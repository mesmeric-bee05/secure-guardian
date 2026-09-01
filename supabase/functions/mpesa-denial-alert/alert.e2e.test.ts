// Verification for the M-PESA denial-spike alert.
// Seeds simulated rejected callbacks, invokes the function, and asserts a
// critical security_events row is created. Below-threshold windows must NOT alert.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ALERT_TOKEN = Deno.env.get("ALERT_TRIGGER_TOKEN") ?? "";
const FN = `${SUPABASE_URL}/functions/v1/mpesa-denial-alert`;

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

async function callAlert(payload: Record<string, unknown>) {
  const res = await fetch(FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ALERT_TOKEN ? { "x-alert-token": ALERT_TOKEN } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

Deno.test({ ...opts, name: "denial-alert: rejects non-POST" }, async () => {
  const res = await fetch(FN, { method: "GET" });
  assertEquals(res.status, 405);
  await res.text();
});

Deno.test({
  ...opts,
  name: "denial-alert: fires for a simulated denial spike and records a security event",
  ignore: !SERVICE_KEY,
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const marker = crypto.randomUUID();
  const since = new Date().toISOString();

  // Seed 12 simulated denials (default threshold is 10).
  const rows = Array.from({ length: 12 }, () => ({
    user_id: null,
    action: "mpesa_callback_rejected",
    resource_type: "donations",
    details: { reason: "invalid_token", test_marker: marker },
  }));
  const { error: seedErr } = await admin.from("audit_logs").insert(rows);
  assert(!seedErr, `seed failed: ${seedErr?.message}`);

  const { status, body } = await callAlert({ window_minutes: 15, threshold: 10 });
  assertEquals(status, 200);
  assertEquals(body.spike, true);
  assertEquals(body.alerted, true);
  assert(body.denial_count >= 12, `expected >=12 denials, got ${body.denial_count}`);

  const { data: events } = await admin
    .from("security_events")
    .select("event_type, severity, details, created_at")
    .eq("event_type", "mpesa_denial_spike")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  assert(events && events.length > 0, "expected a mpesa_denial_spike security event");
  assertEquals(events![0].severity, "critical");

  // Cleanup seeded audit rows (security_events are append-only history).
  await admin.from("audit_logs").delete()
    .eq("action", "mpesa_callback_rejected").gte("created_at", since);
});

Deno.test({
  ...opts,
  name: "denial-alert: does not alert below the threshold",
  ignore: !SERVICE_KEY,
}, async () => {
  // Very high threshold ⇒ never a spike, regardless of ambient traffic.
  const { status, body } = await callAlert({ window_minutes: 1, threshold: 9999 });
  assertEquals(status, 200);
  assertEquals(body.spike, false);
  assertEquals(body.alerted, false);
});
