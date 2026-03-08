import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const ALLOWED_ORIGINS = [
  'https://id-preview--a195f4d5-59f8-49b0-9a16-0b1c51758426.lovable.app',
  'https://a195f4d5-59f8-49b0-9a16-0b1c51758426.lovableproject.com',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  };
}

// Rate limiting (5/min per user)
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

const MAX_RETRIES = 3;
const CONCURRENT_LIMIT = 5;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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
      throw new Error('SMS provider not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getUser(token);
    
    if (claimsError || !claims?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claims.user.id;

    // Rate limit per user (5/min)
    if (!checkRateLimit(`retry:${userId}`, 5, 60000)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait before retrying.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: isAdmin } = await supabase.rpc('is_admin', { _user_id: userId });
    
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { sms_log_ids, retry_all_failed } = body;

    let targetIds: string[] = [];
    
    if (retry_all_failed === true) {
      const { data: failedLogs, error: fetchAllError } = await supabase
        .from('sms_logs')
        .select('id')
        .eq('status', 'failed')
        .lt('retry_count', MAX_RETRIES)
        .limit(50);
      
      if (fetchAllError) {
        console.error('Error fetching failed SMS logs:', fetchAllError);
        throw new Error('Failed to fetch failed SMS logs');
      }
      
      targetIds = (failedLogs || []).map(l => l.id);
      
      if (targetIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No failed messages to retry', results: [], summary: { attempted: 0, succeeded: 0, failed: 0 } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (sms_log_ids && Array.isArray(sms_log_ids) && sms_log_ids.length > 0) {
      targetIds = sms_log_ids;
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing sms_log_ids array or retry_all_failed flag' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (targetIds.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Maximum 50 messages per retry request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: smsLogs, error: fetchError } = await supabase
      .from('sms_logs')
      .select('*')
      .in('id', targetIds)
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

    const results: { id: string; success: boolean; message: string }[] = [];
    const callbackUrl = `${SUPABASE_URL}/functions/v1/sms-webhook`;

    for (let i = 0; i < smsLogs.length; i += CONCURRENT_LIMIT) {
      const batch = smsLogs.slice(i, i + CONCURRENT_LIMIT);
      
      const batchResults = await Promise.all(batch.map(async (sms) => {
        const currentRetryCount = (sms.retry_count || 0) + 1;
        
        if (currentRetryCount > MAX_RETRIES) {
          return { id: sms.id, success: false, message: `Maximum retry attempts (${MAX_RETRIES}) exceeded` };
        }

        await new Promise(resolve => setTimeout(resolve, 200 * (i % CONCURRENT_LIMIT)));

        try {
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

          await supabase
            .from('sms_logs')
            .update({
              status: newStatus,
              retry_count: currentRetryCount,
              last_retry_at: new Date().toISOString(),
              provider_message_id: recipient?.messageId || sms.provider_message_id,
              failure_reason: null,
            })
            .eq('id', sms.id);

          await supabase.from('audit_logs').insert({
            user_id: userId,
            action: 'sms_retry',
            resource_type: 'sms_logs',
            resource_id: sms.id,
            details: { retry_count: currentRetryCount, new_status: newStatus },
          });

          return { id: sms.id, success: true, message: `Retry ${currentRetryCount} sent successfully` };
        } catch (retryError) {
          console.error(`Retry failed for SMS ${sms.id}`);

          await supabase
            .from('sms_logs')
            .update({
              retry_count: currentRetryCount,
              last_retry_at: new Date().toISOString(),
              failure_reason: 'Retry failed',
            })
            .eq('id', sms.id);

          return { id: sms.id, success: false, message: `Retry ${currentRetryCount} failed` };
        }
      }));

      results.push(...batchResults);
    }

    console.log('SMS retry completed:', { userId: userId.slice(0, 8) + '...', attempted: smsLogs.length, succeeded: results.filter(r => r.success).length });

    return new Response(
      JSON.stringify({ 
        success: true, results,
        summary: { attempted: results.length, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const corsHeaders = getCorsHeaders(req);
    console.error('SMS retry error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
