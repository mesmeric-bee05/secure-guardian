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
  };
}

// Rate limiting: track last update time per CHW
const lastUpdateTimes = new Map<string, number>();
const RATE_LIMIT_MS = 30000;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: isCHW } = await supabase.rpc('is_chw', { _user_id: userId });
    
    if (!isCHW) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - CHW access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lastUpdate = lastUpdateTimes.get(userId);
    const now = Date.now();
    
    if (lastUpdate && (now - lastUpdate) < RATE_LIMIT_MS) {
      const waitTime = Math.ceil((RATE_LIMIT_MS - (now - lastUpdate)) / 1000);
      return new Response(
        JSON.stringify({ error: `Rate limited - Please wait ${waitTime} seconds`, wait_seconds: waitTime }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { latitude, longitude } = body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Invalid coordinates' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return new Response(
        JSON.stringify({ error: 'Coordinates out of range' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: assignment, error: updateError } = await supabase
      .from('chw_assignments')
      .update({
        latitude,
        longitude,
        last_location_update: new Date().toISOString(),
      })
      .eq('chw_user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating CHW location:', updateError);
      
      if (updateError.code === 'PGRST116') {
        return new Response(
          JSON.stringify({ error: 'No CHW assignment found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('Failed to update location');
    }

    lastUpdateTimes.set(userId, now);

    const oneHourAgo = now - 3600000;
    for (const [key, time] of lastUpdateTimes.entries()) {
      if (time < oneHourAgo) lastUpdateTimes.delete(key);
    }

    console.log(`CHW location updated: ${userId.slice(0, 8)}...`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Location updated successfully',
        location: { latitude: assignment.latitude, longitude: assignment.longitude, updated_at: assignment.last_location_update },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const corsHeaders = getCorsHeaders(req);
    console.error('CHW location update error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
