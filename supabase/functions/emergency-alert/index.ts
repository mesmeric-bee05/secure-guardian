import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmergencyAlertRequest {
  symptoms: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const AFRICAS_TALKING_API_KEY = Deno.env.get('AFRICAS_TALKING_API_KEY');
    const AFRICAS_TALKING_USERNAME = Deno.env.get('AFRICAS_TALKING_USERNAME');

    // Validate auth
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
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claims.claims.sub;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { symptoms, latitude, longitude, address, priority = 'high' }: EmergencyAlertRequest = await req.json();

    if (!symptoms) {
      return new Response(
        JSON.stringify({ error: 'Symptoms description is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Emergency alert:', { userId, symptoms, priority, latitude, longitude });

    // Create emergency case
    const { data: emergencyCase, error: caseError } = await supabase
      .from('emergency_cases')
      .insert({
        user_id: userId,
        symptoms,
        location_lat: latitude,
        location_lng: longitude,
        location_address: address,
        priority,
        status: 'pending',
      })
      .select()
      .single();

    if (caseError) {
      console.error('Error creating emergency case:', caseError);
      throw new Error('Failed to create emergency case');
    }

    // Get user profile and emergency contacts
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, phone_number')
      .eq('user_id', userId)
      .single();

    const { data: contacts } = await supabase
      .from('emergency_contacts')
      .select('name, phone_number')
      .eq('user_id', userId);

    // Log audit
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'emergency_alert_created',
      resource_type: 'emergency_cases',
      resource_id: emergencyCase.id,
      details: { symptoms, priority, location: { latitude, longitude } },
    });

    // Send SMS to emergency contacts if configured
    if (AFRICAS_TALKING_API_KEY && AFRICAS_TALKING_USERNAME && contacts?.length) {
      const locationText = address || (latitude && longitude ? `${latitude}, ${longitude}` : 'Unknown');
      const message = `EMERGENCY ALERT from ${profile?.full_name || 'MediReach+ User'}!
Symptoms: ${symptoms}
Location: ${locationText}
Please check on them immediately or call 999.`;

      for (const contact of contacts) {
        if (contact.phone_number) {
          try {
            const formattedPhone = contact.phone_number.startsWith('+') 
              ? contact.phone_number 
              : '+254' + contact.phone_number.replace(/^0/, '');

            await fetch('https://api.africastalking.com/version1/messaging', {
              method: 'POST',
              headers: {
                'apiKey': AFRICAS_TALKING_API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
              },
              body: new URLSearchParams({
                username: AFRICAS_TALKING_USERNAME,
                to: formattedPhone,
                message,
                from: 'MediReach',
              }),
            });

            // Log SMS
            await supabase.from('sms_logs').insert({
              user_id: userId,
              phone_number: formattedPhone,
              message,
              direction: 'outbound',
              status: 'sent',
            });

            console.log('Emergency SMS sent to:', contact.name);
          } catch (smsError) {
            console.error('SMS error:', smsError);
          }
        }
      }
    }

    // Find nearby CHWs (simplified - in production, use geospatial queries)
    const { data: chws } = await supabase
      .from('chw_assignments')
      .select('chw_user_id')
      .eq('is_active', true)
      .limit(5);

    if (chws?.length) {
      // Notify first available CHW
      await supabase
        .from('emergency_cases')
        .update({ assigned_chw_id: chws[0].chw_user_id, status: 'assigned' })
        .eq('id', emergencyCase.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        caseId: emergencyCase.id,
        message: 'Emergency alert sent. Help is on the way.',
        contactsNotified: contacts?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Emergency alert error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
