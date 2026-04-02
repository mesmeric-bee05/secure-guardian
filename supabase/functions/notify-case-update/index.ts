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

const rateLimiter = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

const statusLabels: Record<string, { en: string; sw: string }> = {
  in_progress: { en: 'A health worker is now handling your case', sw: 'Mhudumu wa afya anashughulikia kesi yako sasa' },
  resolved: { en: 'Your case has been resolved', sw: 'Kesi yako imekamilika' },
  escalated: { en: 'Your case has been escalated to a facility', sw: 'Kesi yako imeongezwa hadi kituo cha afya' },
  assigned: { en: 'A health worker has been assigned to your case', sw: 'Mhudumu wa afya amepewa kesi yako' },
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerId = claims.claims.sub as string;

    if (!checkRateLimit(callerId)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const caseId = body?.case_id;
    const newStatus = body?.new_status;

    if (!caseId || typeof caseId !== 'string') {
      return new Response(JSON.stringify({ error: 'case_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!newStatus || !statusLabels[newStatus]) {
      return new Response(JSON.stringify({ error: 'Invalid new_status' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the case to verify authorization and get patient user_id
    const { data: caseData, error: caseError } = await supabase
      .from('emergency_cases')
      .select('user_id, assigned_chw_id, symptoms')
      .eq('id', caseId)
      .single();

    if (caseError || !caseData) {
      return new Response(JSON.stringify({ error: 'Case not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorization: caller must be the assigned CHW or an admin
    const { data: isAdmin } = await supabase.rpc('is_admin', { _user_id: callerId });
    if (caseData.assigned_chw_id !== callerId && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!caseData.user_id) {
      return new Response(JSON.stringify({ success: true, message: 'No patient user_id to notify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get patient's preferred language
    const { data: profile } = await supabase
      .from('profiles')
      .select('preferred_language')
      .eq('user_id', caseData.user_id)
      .single();

    const lang = profile?.preferred_language === 'sw' ? 'sw' : 'en';
    const label = statusLabels[newStatus];
    const title = lang === 'en' ? 'Case Update' : 'Sasisha Kesi';
    const bodyText = label[lang];

    // Send push notification to the patient
    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: caseData.user_id,
          title,
          body: bodyText,
          data: { case_id: caseId, status: newStatus },
        },
      });
      console.log(`Push sent to patient ${caseData.user_id.slice(0, 8)}... for case ${caseId.slice(0, 8)}...`);
    } catch (pushError) {
      console.error('Push notification failed:', pushError instanceof Error ? pushError.message : 'Unknown');
      // Don't fail the request if push fails
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('notify-case-update error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
