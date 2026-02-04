import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: track last update time per CHW
const lastUpdateTimes = new Map<string, number>();
const RATE_LIMIT_MS = 30000; // 30 seconds minimum between updates

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authorization header' }),
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
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claims.user.id;

    // Use service role for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user is a CHW
    const { data: isCHW } = await supabase.rpc('is_chw', { _user_id: userId });
    
    if (!isCHW) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - CHW access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting check
    const lastUpdate = lastUpdateTimes.get(userId);
    const now = Date.now();
    
    if (lastUpdate && (now - lastUpdate) < RATE_LIMIT_MS) {
      const waitTime = Math.ceil((RATE_LIMIT_MS - (now - lastUpdate)) / 1000);
      return new Response(
        JSON.stringify({ 
          error: `Rate limited - Please wait ${waitTime} seconds`,
          wait_seconds: waitTime 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { latitude, longitude } = body;

    // Validate GPS coordinates
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Invalid coordinates - latitude and longitude must be numbers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (latitude < -90 || latitude > 90) {
      return new Response(
        JSON.stringify({ error: 'Invalid latitude - must be between -90 and 90' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (longitude < -180 || longitude > 180) {
      return new Response(
        JSON.stringify({ error: 'Invalid longitude - must be between -180 and 180' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update CHW location
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
          JSON.stringify({ error: 'No CHW assignment found for this user' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('Failed to update location');
    }

    // Update rate limit tracking
    lastUpdateTimes.set(userId, now);

    // Clean up old entries (older than 1 hour)
    const oneHourAgo = now - 3600000;
    for (const [key, time] of lastUpdateTimes.entries()) {
      if (time < oneHourAgo) {
        lastUpdateTimes.delete(key);
      }
    }

    console.log(`CHW location updated: ${userId.slice(0, 8)}... -> (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Location updated successfully',
        location: {
          latitude: assignment.latitude,
          longitude: assignment.longitude,
          updated_at: assignment.last_location_update,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('CHW location update error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
