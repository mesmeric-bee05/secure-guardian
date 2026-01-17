import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Africa's Talking webhook IP ranges (for validation)
const AT_IP_RANGES = [
  '52.18.230.193',
  '54.76.132.202',
  '52.51.140.167',
];

// Rate limiting for webhook calls (prevent replay attacks)
const processedMessages = new Map<string, number>();
const MAX_PROCESSED_AGE_MS = 3600000; // 1 hour

function isReplayAttack(messageId: string): boolean {
  const now = Date.now();
  
  // Clean old entries
  for (const [id, timestamp] of processedMessages.entries()) {
    if (now - timestamp > MAX_PROCESSED_AGE_MS) {
      processedMessages.delete(id);
    }
  }
  
  if (processedMessages.has(messageId)) {
    return true;
  }
  
  processedMessages.set(messageId, now);
  return false;
}

// Validate delivery report data
interface DeliveryReport {
  id: string;
  status: string;
  phoneNumber: string;
  failureReason?: string;
}

function parseDeliveryReport(data: unknown): { valid: boolean; report?: DeliveryReport; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  
  const body = data as Record<string, unknown>;
  
  // Africa's Talking sends these fields
  if (typeof body.id !== 'string' || !body.id) {
    return { valid: false, error: 'Missing message ID' };
  }
  
  if (typeof body.status !== 'string' || !body.status) {
    return { valid: false, error: 'Missing status' };
  }
  
  const validStatuses = ['Success', 'Sent', 'Buffered', 'Rejected', 'Failed', 'Delivered'];
  if (!validStatuses.includes(body.status)) {
    console.warn(`Unknown status received: ${body.status}`);
  }
  
  if (typeof body.phoneNumber !== 'string') {
    return { valid: false, error: 'Missing phone number' };
  }
  
  return {
    valid: true,
    report: {
      id: body.id,
      status: body.status,
      phoneNumber: body.phoneNumber,
      failureReason: typeof body.failureReason === 'string' ? body.failureReason : undefined,
    }
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get client IP for logging (not strict validation as AT may use different IPs)
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    console.log('SMS webhook received from IP:', clientIP);
    
    // Parse the request body
    // Africa's Talking can send both JSON and form-urlencoded
    let reportData: unknown;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      reportData = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      reportData = Object.fromEntries(formData.entries());
    } else {
      // Try JSON first, fallback to form data
      try {
        reportData = await req.json();
      } catch {
        const formData = await req.formData();
        reportData = Object.fromEntries(formData.entries());
      }
    }
    
    console.log('Delivery report data:', JSON.stringify(reportData).slice(0, 200));
    
    // Validate the report
    const validation = parseDeliveryReport(reportData);
    
    if (!validation.valid || !validation.report) {
      console.error('Invalid delivery report:', validation.error);
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { id: messageId, status, phoneNumber, failureReason } = validation.report;
    
    // Check for replay attacks
    if (isReplayAttack(messageId)) {
      console.warn('Duplicate webhook detected for message:', messageId);
      // Return 200 to acknowledge (prevent retries) but don't process
      return new Response(
        JSON.stringify({ success: true, message: 'Already processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Map Africa's Talking status to our delivery_status
    const deliveryStatusMap: Record<string, string> = {
      'Success': 'delivered',
      'Delivered': 'delivered',
      'Sent': 'sent',
      'Buffered': 'pending',
      'Rejected': 'rejected',
      'Failed': 'failed',
    };
    
    const deliveryStatus = deliveryStatusMap[status] || 'unknown';
    
    // Update the sms_logs record
    const updateData: Record<string, unknown> = {
      delivery_status: deliveryStatus,
      status_updated_at: new Date().toISOString(),
    };
    
    if (deliveryStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
    }
    
    if (failureReason) {
      updateData.failure_reason = failureReason.slice(0, 500); // Limit length
    }
    
    // Also update the main status field
    updateData.status = status;
    
    const { data: updated, error: updateError } = await supabase
      .from('sms_logs')
      .update(updateData)
      .eq('provider_message_id', messageId)
      .select('id, user_id')
      .maybeSingle();
    
    if (updateError) {
      console.error('Error updating sms_logs:', updateError.message);
      // Still return 200 to prevent AT from retrying
      return new Response(
        JSON.stringify({ success: false, error: 'Database update failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!updated) {
      console.warn('No sms_log found for message ID:', messageId);
      // Could be a message we didn't track - still acknowledge
      return new Response(
        JSON.stringify({ success: true, message: 'Message not found in logs' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('SMS delivery status updated:', {
      smsLogId: updated.id,
      messageId,
      status: deliveryStatus,
      hasFailureReason: !!failureReason,
    });
    
    // Log to audit for failed deliveries
    if (deliveryStatus === 'failed' || deliveryStatus === 'rejected') {
      await supabase.from('audit_logs').insert({
        user_id: updated.user_id,
        action: 'sms_delivery_failed',
        resource_type: 'sms_logs',
        resource_id: updated.id,
        details: { 
          status: deliveryStatus, 
          failureReason: failureReason?.slice(0, 100),
          phoneNumber: phoneNumber.slice(0, 6) + '***'
        },
      });
    }
    
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('SMS webhook error:', error instanceof Error ? error.message : 'Unknown');
    // Always return 200 to acknowledge receipt
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
