import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, getClientIP, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";
import { parseBody, badRequest, PhoneSchema } from "../_shared/validation.ts";

const SmsBodySchema = z.object({
  to: z.union([PhoneSchema, z.array(PhoneSchema).min(1).max(10)]),
  message: z.string().trim().min(1).max(1600),
}).strict();

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) return originRejection;

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
      logJwtFailure({ fn: 'sms-gateway', reason: 'missing_bearer', authHeader, ip: getClientIP(req) });
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claims?.claims?.sub || claims.claims.role !== "authenticated") {
      logJwtFailure({ fn: 'sms-gateway', reason: classifyClaims(claimsError, claims), authHeader, claims: claims?.claims, ip: getClientIP(req) });
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claims.claims.sub as string;

    const limited = await enforceLimits({
      scope: 'sms-gateway', ip: getClientIP(req), userId,
      ipLimitPerMin: 10, userLimitPerMin: 20, corsHeaders,
    });
    if (limited) return limited;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const parsed = await parseBody(req, SmsBodySchema);
    if (!parsed.ok || !parsed.data) return badRequest(parsed.error!, corsHeaders);
    const { to, message } = parsed.data;
    const recipients = Array.isArray(to) ? to : [to];

    const formattedRecipients = recipients.map((phone) => {
      const cleaned = phone.replace(/\s/g, '');
      if (cleaned.startsWith('+')) return cleaned;
      if (cleaned.startsWith('0')) return '+254' + cleaned.slice(1);
      return '+254' + cleaned;
    });

    console.log('SMS request:', { userId: userId.slice(0, 8) + '...', recipientCount: formattedRecipients.length });

    const callbackUrl = `${SUPABASE_URL}/functions/v1/sms-webhook`;
    
    const atResponse = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'apiKey': AFRICAS_TALKING_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        username: AFRICAS_TALKING_USERNAME,
        to: formattedRecipients.join(','),
        message: message,
        from: 'MediReach',
        callback: callbackUrl,
      }),
    });

    const atResult = await atResponse.json();

    for (const recipient of formattedRecipients) {
      await supabase.from('sms_logs').insert({
        user_id: userId,
        phone_number: recipient,
        message: message.slice(0, 100) + (message.length > 100 ? '...' : ''),
        direction: 'outbound',
        status: atResult.SMSMessageData?.Recipients?.[0]?.status || 'sent',
        provider_message_id: atResult.SMSMessageData?.Recipients?.[0]?.messageId,
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        recipients: formattedRecipients.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const corsHeaders = getCorsHeaders(req);
    console.error('SMS gateway error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
