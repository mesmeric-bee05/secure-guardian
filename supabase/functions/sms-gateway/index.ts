import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting (in-memory, per function instance)
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimiter.get(userId);
  
  if (!record || record.resetAt < now) {
    rateLimiter.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

// Input validation
function validateSMSInput(data: unknown): { valid: boolean; error?: string; parsed?: { to: string[]; message: string } } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const body = data as Record<string, unknown>;
  
  // Validate 'to' field
  let recipients: string[] = [];
  if (typeof body.to === 'string') {
    recipients = [body.to];
  } else if (Array.isArray(body.to)) {
    recipients = body.to.filter((t): t is string => typeof t === 'string');
  } else {
    return { valid: false, error: 'Missing or invalid "to" field' };
  }
  
  if (recipients.length === 0) {
    return { valid: false, error: 'At least one recipient is required' };
  }
  
  if (recipients.length > 10) {
    return { valid: false, error: 'Maximum 10 recipients allowed' };
  }
  
  // Validate phone number format
  const phoneRegex = /^\+?[0-9]{10,15}$/;
  for (const phone of recipients) {
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return { valid: false, error: `Invalid phone number format: ${phone.slice(0, 4)}...` };
    }
  }
  
  // Validate message
  if (typeof body.message !== 'string') {
    return { valid: false, error: 'Message must be a string' };
  }
  
  if (body.message.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  
  if (body.message.length > 1600) {
    return { valid: false, error: 'Message too long (max 1600 characters)' };
  }
  
  return { valid: true, parsed: { to: recipients, message: body.message } };
}

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

    // Rate limiting (stricter for SMS)
    if (!checkRateLimit(userId, 10, 60000)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse and validate input
    const rawBody = await req.json();
    const validation = validateSMSInput(rawBody);
    
    if (!validation.valid || !validation.parsed) {
      return new Response(
        JSON.stringify({ error: validation.error || 'Invalid input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { to, message } = validation.parsed;

    // Format phone numbers
    const formattedRecipients = to.map(phone => {
      const cleaned = phone.replace(/\s/g, '');
      if (cleaned.startsWith('+')) return cleaned;
      if (cleaned.startsWith('0')) return '+254' + cleaned.slice(1);
      return '+254' + cleaned;
    });

    // Log minimal metadata (no phone numbers or message content)
    console.log('SMS request:', { userId: userId.slice(0, 8) + '...', recipientCount: formattedRecipients.length });

    // Build SMS request with delivery callback
    const callbackUrl = `${SUPABASE_URL}/functions/v1/sms-webhook`;
    
    // Africa's Talking API call with delivery callback
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
    
    console.log('SMS sent with delivery callback:', callbackUrl);

    const atResult = await atResponse.json();

    // Log SMS in database (without full message content for privacy)
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
    console.error('SMS gateway error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
