// Denial-spike alerting for M-PESA callbacks.
//
// Runs on a schedule (pg_cron) and can also be invoked manually by an admin.
// It counts `mpesa_callback_rejected` audit rows over a window and, when the
// count crosses the threshold, records a critical security_event + audit row
// and optionally POSTs a redacted payload to ALERT_WEBHOOK_URL.
//
// Never logs or forwards token values.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders, getClientIP, rejectDisallowedOrigin } from "../_shared/cors.ts";

const DEFAULT_WINDOW_MINUTES = 15;
const DEFAULT_THRESHOLD = 10;

let cached: SupabaseClient | null = null;
function svc(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}

function clamp(n: number, min: number, max: number, fallback: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) return originRejection;

  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return jsonRes({ error: "method_not_allowed" }, 405);
  }

  // Callers must present the scheduler secret (cron) — no user auth path.
  const secret = Deno.env.get("ALERT_TRIGGER_TOKEN") ?? "";
  const presented = req.headers.get("x-alert-token") ??
    new URL(req.url).searchParams.get("token") ?? "";
  if (secret && presented !== secret) {
    return jsonRes({ error: "unauthorized" }, 401);
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const windowMinutes = clamp(
      Number(body.window_minutes ?? DEFAULT_WINDOW_MINUTES),
      1,
      1440,
      DEFAULT_WINDOW_MINUTES,
    );
    const threshold = clamp(Number(body.threshold ?? DEFAULT_THRESHOLD), 1, 10_000, DEFAULT_THRESHOLD);

    const supabase = svc();
    const { data, error } = await supabase.rpc("mpesa_denial_spike_check", {
      _window: `${windowMinutes} minutes`,
      _threshold: threshold,
    });
    if (error) throw new Error(error.message);

    const result = data as {
      denial_count: number;
      spike: boolean;
      reasons: Record<string, number>;
      since: string;
    };

    if (!result.spike) {
      return jsonRes({ ...result, alerted: false });
    }

    console.error(
      `mpesa-denial-alert: SPIKE ${result.denial_count} denials in ${windowMinutes}m (threshold ${threshold})`,
    );

    await supabase.from("security_events").insert({
      event_type: "mpesa_denial_spike",
      scope: "mpesa-callback",
      severity: "critical",
      ip_address: getClientIP(req),
      details: {
        denial_count: result.denial_count,
        threshold,
        window_minutes: windowMinutes,
        reasons: result.reasons,
        since: result.since,
      },
    });

    await supabase.from("audit_logs").insert({
      user_id: null,
      action: "mpesa_denial_spike",
      resource_type: "donations",
      details: {
        denial_count: result.denial_count,
        threshold,
        window_minutes: windowMinutes,
        reasons: result.reasons,
      },
    });

    let webhookStatus: number | null = null;
    const webhook = Deno.env.get("ALERT_WEBHOOK_URL");
    if (webhook) {
      try {
        const res = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text:
              `MediReach+ alert: ${result.denial_count} M-PESA callback denials in the last ${windowMinutes} minutes (threshold ${threshold}).`,
            denial_count: result.denial_count,
            threshold,
            window_minutes: windowMinutes,
            reasons: result.reasons,
          }),
        });
        webhookStatus = res.status;
        await res.text();
      } catch (e) {
        console.error("mpesa-denial-alert webhook failed:", e instanceof Error ? e.message : e);
      }
    }

    return jsonRes({ ...result, alerted: true, webhook_status: webhookStatus });
  } catch (err) {
    console.error("mpesa-denial-alert error:", err instanceof Error ? err.message : err);
    return jsonRes({ error: "internal_error" }, 500);
  }
});
