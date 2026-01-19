import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exponential backoff delays in milliseconds
const RETRY_DELAYS = [2000, 4000, 8000]; // 2s, 4s, 8s
const MAX_RETRIES = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AFRICAS_TALKING_API_KEY = Deno.env.get('AFRICAS_TALKING_API_KEY');
    const AFRICAS_TALKING_USERNAME = Deno.env.get('AFRICAS_TALKING_USERNAME');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!AFRICAS_TALKING_API_KEY || !AFRICAS_TALKING_USERNAME) {
      throw new Error('Africa\'s Talking credentials not configured');
    }

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claims.claims.sub as string;

    // Check if user is admin using service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: isAdmin } = await supabase.rpc('is_admin', { _user_id: userId });
    
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { sms_log_ids } = body;

    if (!sms_log_ids || !Array.isArray(sms_log_ids) || sms_log_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid sms_log_ids array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (sms_log_ids.length > 10) {
      return new Response(
        JSON.stringify({ error: 'Maximum 10 messages per retry request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the failed SMS logs
    const { data: smsLogs, error: fetchError } = await supabase
      .from('sms_logs')
      .select('*')
      .in('id', sms_log_ids)
      .eq('status', 'failed');

    if (fetchError) {
      console.error('Error fetching SMS logs:', fetchError);
      throw new Error('Failed to fetch SMS logs');
    }

    if (!smsLogs || smsLogs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No failed SMS logs found with the provided IDs' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each SMS for retry
    const results: { id: string; success: boolean; message: string }[] = [];
    const callbackUrl = `${SUPABASE_URL}/functions/v1/sms-webhook`;

    for (const sms of smsLogs) {
      const currentRetryCount = (sms.retry_count || 0) + 1;
      
      if (currentRetryCount > MAX_RETRIES) {
        results.push({
          id: sms.id,
          success: false,
          message: `Maximum retry attempts (${MAX_RETRIES}) exceeded`,
        });
        continue;
      }

      // Apply exponential backoff delay
      const delayMs = RETRY_DELAYS[Math.min(currentRetryCount - 1, RETRY_DELAYS.length - 1)];
      await new Promise(resolve => setTimeout(resolve, delayMs));

      console.log(`Retrying SMS ${sms.id} (attempt ${currentRetryCount}/${MAX_RETRIES})`);

      try {
        // Send SMS via Africa's Talking
        const atResponse = await fetch('https://api.africastalking.com/version1/messaging', {
          method: 'POST',
          headers: {
            'apiKey': AFRICAS_TALKING_API_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: new URLSearchParams({
            username: AFRICAS_TALKING_USERNAME,
            to: sms.phone_number,
            message: sms.message,
            from: 'MediReach',
            callback: callbackUrl,
          }),
        });

        const atResult = await atResponse.json();
        const recipient = atResult.SMSMessageData?.Recipients?.[0];
        const newStatus = recipient?.status || 'sent';

        // Update the original SMS log
        await supabase
          .from('sms_logs')
          .update({
            status: newStatus,
            retry_count: currentRetryCount,
            last_retry_at: new Date().toISOString(),
            provider_message_id: recipient?.messageId || sms.provider_message_id,
            failure_reason: null, // Clear previous failure reason
          })
          .eq('id', sms.id);

        // Log audit entry
        await supabase.from('audit_logs').insert({
          user_id: userId,
          action: 'sms_retry',
          resource_type: 'sms_logs',
          resource_id: sms.id,
          details: {
            retry_count: currentRetryCount,
            new_status: newStatus,
            phone_number_masked: sms.phone_number.slice(0, 4) + '****',
          },
        });

        results.push({
          id: sms.id,
          success: true,
          message: `Retry ${currentRetryCount} sent successfully`,
        });

      } catch (retryError) {
        console.error(`Retry failed for SMS ${sms.id}:`, retryError);

        // Update with failure
        await supabase
          .from('sms_logs')
          .update({
            retry_count: currentRetryCount,
            last_retry_at: new Date().toISOString(),
            failure_reason: retryError instanceof Error ? retryError.message : 'Unknown error',
          })
          .eq('id', sms.id);

        results.push({
          id: sms.id,
          success: false,
          message: `Retry ${currentRetryCount} failed: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`,
        });
      }
    }

    console.log('SMS retry completed:', { 
      userId: userId.slice(0, 8) + '...', 
      attempted: smsLogs.length,
      succeeded: results.filter(r => r.success).length,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        summary: {
          attempted: results.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SMS retry error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
