import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, getClientIP, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";
import { parseBody, badRequest, LatSchema, LngSchema } from "../_shared/validation.ts";

const LocationBodySchema = z.object({
  latitude: LatSchema,
  longitude: LngSchema,
}).strict();

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) return originRejection;

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

    // Durable IP+user rate limit (≈ 2/min/user, plenty for legit beacons)
    const limited = await enforceLimits({
      scope: 'chw-location', ip: getClientIP(req), userId,
      ipLimitPerMin: 60, userLimitPerMin: 2, corsHeaders,
    });
    if (limited) return limited;

    const parsed = await parseBody(req, LocationBodySchema);
    if (!parsed.ok || !parsed.data) return badRequest(parsed.error!, corsHeaders);
    const { latitude, longitude } = parsed.data;

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
