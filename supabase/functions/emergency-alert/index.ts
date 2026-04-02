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
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const AFRICAS_TALKING_API_KEY = Deno.env.get('AFRICAS_TALKING_API_KEY');
    const AFRICAS_TALKING_USERNAME = Deno.env.get('AFRICAS_TALKING_USERNAME');

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

    if (!checkRateLimit(userId, 5, 60000)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const rawBody = await req.json();
    const validation = validateEmergencyInput(rawBody);
    
    if (!validation.valid || !validation.parsed) {
      return new Response(
        JSON.stringify({ error: validation.error || 'Invalid input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { symptoms, latitude, longitude, address, priority } = validation.parsed;

    console.log('Emergency alert:', { userId: userId.slice(0, 8) + '...', priority, hasLocation: !!(latitude && longitude) });

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, phone_number')
      .eq('user_id', userId)
      .single();

    const { data: contacts } = await supabase
      .from('emergency_contacts')
      .select('name, phone_number')
      .eq('user_id', userId);

    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'emergency_alert_created',
      resource_type: 'emergency_cases',
      resource_id: emergencyCase.id,
      details: { priority, hasLocation: !!(latitude && longitude) },
    });

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

    let assignedChw: { chw_user_id: string; distance_km: number; region: string; city: string } | null = null;
    
    if (latitude && longitude) {
      const { data: nearbyChws, error: chwError } = await supabase
        .rpc('find_nearest_chw', {
          emergency_lat: latitude,
          emergency_lng: longitude,
          max_distance_km: 50
        });
      
      if (chwError) {
        console.error('Error finding nearest CHW:', chwError.message);
      } else if (nearbyChws && nearbyChws.length > 0) {
        assignedChw = nearbyChws[0];
        console.log('Found nearest CHW:', {
          distance: nearbyChws[0].distance_km.toFixed(2) + ' km',
          region: nearbyChws[0].region,
        });
      }
    }
    
    if (!assignedChw) {
      const { data: fallbackChws } = await supabase
        .from('chw_assignments')
        .select('chw_user_id, region, city')
        .eq('is_active', true)
        .limit(1);
      
      if (fallbackChws?.length) {
        assignedChw = { 
          chw_user_id: fallbackChws[0].chw_user_id, 
          distance_km: -1,
          region: fallbackChws[0].region,
          city: fallbackChws[0].city
        };
      }
    }
    
    if (assignedChw) {
      const { error: assignError } = await supabase
        .from('emergency_cases')
        .update({ 
          assigned_chw_id: assignedChw.chw_user_id, 
          status: 'assigned',
          notes: assignedChw.distance_km >= 0 
            ? `CHW assigned from ${assignedChw.city}, ${assignedChw.region} (${assignedChw.distance_km.toFixed(1)} km away)`
            : `CHW assigned from ${assignedChw.city}, ${assignedChw.region} (fallback assignment)`
        })
        .eq('id', emergencyCase.id);
      
      if (!assignError) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              user_id: assignedChw.chw_user_id,
              title: `🚨 Emergency Alert - ${priority.toUpperCase()}`,
              body: `New case: ${symptoms.slice(0, 80)}${symptoms.length > 80 ? '...' : ''}`,
              tag: `emergency-${emergencyCase.id}`,
              data: { caseId: emergencyCase.id, url: '/dashboard' },
            }),
          });
          console.log('Push notification sent to CHW');
        } catch (pushError) {
          console.error('Push notification error');
        }
      }
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
    const corsHeaders = getCorsHeaders(req);
    console.error('Emergency alert error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
