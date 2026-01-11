import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSRequest {
  to: string | string[];
  message: string;
  userId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AFRICAS_TALKING_API_KEY = Deno.env.get('AFRICAS_TALKING_API_KEY');
    const AFRICAS_TALKING_USERNAME = Deno.env.get('AFRICAS_TALKING_USERNAME');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!AFRICAS_TALKING_API_KEY || !AFRICAS_TALKING_USERNAME) {
      throw new Error('Africa\'s Talking credentials not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { to, message, userId }: SMSRequest = await req.json();

    if (!to || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format phone numbers
    const recipients = Array.isArray(to) ? to : [to];
    const formattedRecipients = recipients.map(phone => {
      // Ensure phone starts with country code
      if (phone.startsWith('+')) return phone;
      if (phone.startsWith('0')) return '+254' + phone.slice(1);
      return '+254' + phone;
    });

    console.log('Sending SMS to:', formattedRecipients);

    // Africa's Talking API call
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
      }),
    });

    const atResult = await atResponse.json();
    console.log('Africa\'s Talking response:', atResult);

    // Log SMS in database
    for (const recipient of formattedRecipients) {
      await supabase.from('sms_logs').insert({
        user_id: userId || null,
        phone_number: recipient,
        message: message,
        direction: 'outbound',
        status: atResult.SMSMessageData?.Recipients?.[0]?.status || 'sent',
        provider_message_id: atResult.SMSMessageData?.Recipients?.[0]?.messageId,
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        recipients: formattedRecipients.length,
        result: atResult 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('SMS gateway error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
