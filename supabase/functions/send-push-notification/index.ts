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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    // Auth: Only allow service-role calls (internal use from emergency-alert)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
      // Not a service-role call — reject
      return new Response(
        JSON.stringify({ error: 'Forbidden - Internal use only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'Push notifications not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { user_id, title, body: notifBody, data, tag } = body;

    if (!user_id || !title) {
      return new Response(
        JSON.stringify({ error: 'user_id and title are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id);

    if (subError) {
      console.error('Error fetching subscriptions:', subError.message);
      throw new Error('Failed to fetch push subscriptions');
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for user:', user_id.slice(0, 8) + '...');
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.stringify({
      title,
      body: notifBody,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: tag || 'default',
      data: data || {},
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'TTL': '86400' },
          body: payload,
        });

        if (response.ok || response.status === 201) {
          sent++;
        } else if (response.status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          failed++;
        } else {
          console.error('Push delivery failed:', response.status);
          failed++;
        }
      } catch (pushError) {
        console.error('Push error for subscription:', sub.id);
        failed++;
      }
    }

    console.log(`Push results: ${sent} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({ success: true, sent, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const corsHeaders = getCorsHeaders(req);
    console.error('Send push notification error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'An internal error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
