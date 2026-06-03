import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, getClientIP, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";
import { parseBody, badRequest, UuidSchema } from "../_shared/validation.ts";

const PushBodySchema = z.object({
  user_id: UuidSchema,
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(500).optional(),
  tag: z.string().trim().max(120).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict();

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) return originRejection;

  try {
    const limited = await enforceLimits({
      scope: 'send-push', ip: getClientIP(req), ipLimitPerMin: 60, corsHeaders,
    });
    if (limited) return limited;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
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

    const parsed = await parseBody(req, PushBodySchema);
    if (!parsed.ok || !parsed.data) return badRequest(parsed.error!, corsHeaders);
    const { user_id, title, body: notifBody, data, tag } = parsed.data;

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
