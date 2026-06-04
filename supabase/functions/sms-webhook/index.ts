import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getClientIP, getCorsHeaders, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";

const WEBHOOK_RESPONSE_HEADERS = { 'Content-Type': 'text/plain' };

// Replay attack prevention
const processedMessages = new Map<string, number>();
const MAX_PROCESSED_AGE_MS = 3600000;

function isReplayAttack(messageId: string): boolean {
  const now = Date.now();
  for (const [id, timestamp] of processedMessages.entries()) {
    if (now - timestamp > MAX_PROCESSED_AGE_MS) processedMessages.delete(id);
  }
  if (processedMessages.has(messageId)) return true;
  processedMessages.set(messageId, now);
  return false;
}

interface DeliveryReport {
  id: string;
  status: string;
  phoneNumber: string;
  failureReason?: string;
}

function parseDeliveryReport(data: unknown): { valid: boolean; report?: DeliveryReport; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid request body' };
  const body = data as Record<string, unknown>;
  if (typeof body.id !== 'string' || !body.id) return { valid: false, error: 'Missing message ID' };
  if (typeof body.status !== 'string' || !body.status) return { valid: false, error: 'Missing status' };
  if (typeof body.phoneNumber !== 'string') return { valid: false, error: 'Missing phone number' };
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const clientIP = getClientIP(req);
    const limited = await enforceLimits({
      scope: 'sms-webhook', ip: clientIP, ipLimitPerMin: 60, corsHeaders,
    });
    if (limited) return limited;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    console.log('SMS webhook received from IP:', clientIP);
    
    let reportData: unknown;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      reportData = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      reportData = Object.fromEntries(formData.entries());
    } else {
      try {
        reportData = await req.json();
      } catch {
        const formData = await req.formData();
        reportData = Object.fromEntries(formData.entries());
      }
    }
    
    const validation = parseDeliveryReport(reportData);
    
    if (!validation.valid || !validation.report) {
      console.error('Invalid delivery report:', validation.error);
      return new Response(
        JSON.stringify({ error: 'Invalid delivery report' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { id: messageId, status, phoneNumber, failureReason } = validation.report;
    
    if (isReplayAttack(messageId)) {
      return new Response(
        JSON.stringify({ success: true, message: 'Already processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const deliveryStatusMap: Record<string, string> = {
      'Success': 'delivered', 'Delivered': 'delivered', 'Sent': 'sent',
      'Buffered': 'pending', 'Rejected': 'rejected', 'Failed': 'failed',
    };
    
    const deliveryStatus = deliveryStatusMap[status] || 'unknown';
    
    const updateData: Record<string, unknown> = {
      delivery_status: deliveryStatus,
      status_updated_at: new Date().toISOString(),
      status,
    };
    
    if (deliveryStatus === 'delivered') updateData.delivered_at = new Date().toISOString();
    if (failureReason) updateData.failure_reason = failureReason.slice(0, 500);
    
    const { data: updated, error: updateError } = await supabase
      .from('sms_logs')
      .update(updateData)
      .eq('provider_message_id', messageId)
      .select('id, user_id')
      .maybeSingle();
    
    if (updateError) {
      console.error('Error updating sms_logs:', updateError.message);
      return new Response(
        JSON.stringify({ success: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!updated) {
      return new Response(
        JSON.stringify({ success: true, message: 'Message not found in logs' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (deliveryStatus === 'failed' || deliveryStatus === 'rejected') {
      await supabase.from('audit_logs').insert({
        user_id: updated.user_id,
        action: 'sms_delivery_failed',
        resource_type: 'sms_logs',
        resource_id: updated.id,
        details: { status: deliveryStatus, phoneNumber: phoneNumber.slice(0, 6) + '***' },
      });
    }
    
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('SMS webhook error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ success: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
