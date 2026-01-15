import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting (in-memory, per function instance)
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, limit = 5, windowMs = 60000): boolean {
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
function validateEmergencyInput(data: unknown): { 
  valid: boolean; 
  error?: string; 
  parsed?: { 
    symptoms: string; 
    latitude?: number; 
    longitude?: number; 
    address?: string; 
    priority: 'low' | 'medium' | 'high' | 'critical';
  } 
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const body = data as Record<string, unknown>;
  
  // Validate symptoms (required)
  if (typeof body.symptoms !== 'string') {
    return { valid: false, error: 'Symptoms must be a string' };
  }
  
  const symptoms = body.symptoms.trim();
  if (symptoms.length < 5) {
    return { valid: false, error: 'Symptoms description too short (min 5 characters)' };
  }
  
  if (symptoms.length > 1000) {
    return { valid: false, error: 'Symptoms description too long (max 1000 characters)' };
  }
  
  // Validate latitude (optional)
  let latitude: number | undefined;
  if (body.latitude !== undefined) {
    if (typeof body.latitude !== 'number' || isNaN(body.latitude)) {
      return { valid: false, error: 'Latitude must be a valid number' };
    }
    if (body.latitude < -90 || body.latitude > 90) {
      return { valid: false, error: 'Latitude must be between -90 and 90' };
    }
    latitude = body.latitude;
  }
  
  // Validate longitude (optional)
  let longitude: number | undefined;
  if (body.longitude !== undefined) {
    if (typeof body.longitude !== 'number' || isNaN(body.longitude)) {
      return { valid: false, error: 'Longitude must be a valid number' };
    }
    if (body.longitude < -180 || body.longitude > 180) {
      return { valid: false, error: 'Longitude must be between -180 and 180' };
    }
    longitude = body.longitude;
  }
  
  // Validate address (optional)
  let address: string | undefined;
  if (body.address !== undefined) {
    if (typeof body.address !== 'string') {
      return { valid: false, error: 'Address must be a string' };
    }
    if (body.address.length > 500) {
      return { valid: false, error: 'Address too long (max 500 characters)' };
    }
    address = body.address.trim();
  }
  
  // Validate priority (optional, default to 'high')
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  let priority: 'low' | 'medium' | 'high' | 'critical' = 'high';
  if (body.priority !== undefined) {
    if (typeof body.priority !== 'string' || !validPriorities.includes(body.priority)) {
      return { valid: false, error: 'Priority must be one of: low, medium, high, critical' };
    }
    priority = body.priority as 'low' | 'medium' | 'high' | 'critical';
  }
  
  return { valid: true, parsed: { symptoms, latitude, longitude, address, priority } };
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

    const userId = claims.claims.sub as string;

    // Rate limiting (stricter for emergency alerts to prevent abuse)
    if (!checkRateLimit(userId, 5, 60000)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse and validate input
    const rawBody = await req.json();
    const validation = validateEmergencyInput(rawBody);
    
    if (!validation.valid || !validation.parsed) {
      return new Response(
        JSON.stringify({ error: validation.error || 'Invalid input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { symptoms, latitude, longitude, address, priority } = validation.parsed;

    // Log minimal metadata (no PII)
    console.log('Emergency alert:', { userId: userId.slice(0, 8) + '...', priority, hasLocation: !!(latitude && longitude) });

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
      console.error('Error creating emergency case:', caseError.message);
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
      details: { priority, hasLocation: !!(latitude && longitude) },
    });

    // Send SMS to emergency contacts if configured
    if (AFRICAS_TALKING_API_KEY && AFRICAS_TALKING_USERNAME && contacts?.length) {
      const locationText = address || (latitude && longitude ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : 'Unknown');
      const message = `EMERGENCY ALERT from ${profile?.full_name || 'MediReach+ User'}!
Symptoms: ${symptoms.slice(0, 100)}${symptoms.length > 100 ? '...' : ''}
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

            // Log SMS (truncated message for privacy)
            await supabase.from('sms_logs').insert({
              user_id: userId,
              phone_number: formattedPhone,
              message: 'Emergency alert notification',
              direction: 'outbound',
              status: 'sent',
            });

            console.log('Emergency SMS sent');
          } catch (smsError) {
            console.error('SMS error');
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
    console.error('Emergency alert error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
