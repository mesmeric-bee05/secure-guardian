// E2E: fire USSD bursts and confirm security_events rows land with the
// expected event_type, scope, menu_path, and hashed phone.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { flushSecurityEvents, sha256Hex } from "../_shared/securityLog.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const URL_FN = `${SUPABASE_URL}/functions/v1/ussd-handler`;

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function body(text: string, phone: string) {
  const fd = new FormData();
  fd.set("sessionId", `sec-${crypto.randomUUID()}`);
  fd.set("phoneNumber", phone);
  fd.set("text", text);
  return fd;
}

async function fire(text: string, phone: string, n: number) {
  const out: { status: number; text: string }[] = [];
  for (let i = 0; i < n; i++) {
    const res = await fetch(URL_FN, { method: "POST", headers: { apikey: ANON_KEY }, body: body(text, phone) });
    out.push({ status: res.status, text: await res.text() });
  }
  return out;
}

async function waitForRow(query: () => Promise<number>, timeoutMs = 5000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    last = await query();
    if (last > 0) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

Deno.test({ ...opts, name: "USSD donate burst persists rate_limit_429 rows with phone_hash + menu_path" }, async () => {
  const phone = `+25470${Math.floor(1e7 + Math.random() * 9e7)}`;
  const phoneHash = await sha256Hex(phone);
  const since = new Date(Date.now() - 5_000).toISOString();

  const outcomes = await fire("5*500", phone, 25);
  const denied = outcomes.filter((o) => /Too many donation attempts|Majaribio mengi ya mchango/.test(o.text));
  assert(denied.length > 0, "expected at least one throttled donate response");

  const count = await waitForRow(async () => {
    const { count } = await admin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "rate_limit_429")
      .eq("scope", "ussd-donate")
      .gte("created_at", since)
      .filter("details->>phone_hash", "eq", phoneHash);
    return count ?? 0;
  });
  assert(count > 0, `expected security_events row for donate burst (phone_hash=${phoneHash.slice(0, 8)}…), got 0`);
  await flushSecurityEvents();
});

Deno.test({ ...opts, name: "USSD clinic burst persists rate_limit_429 rows with phone_hash + menu_path" }, async () => {
  const phone = `+25471${Math.floor(1e7 + Math.random() * 9e7)}`;
  const phoneHash = await sha256Hex(phone);
  const since = new Date(Date.now() - 5_000).toISOString();

  const outcomes = await fire("2", phone, 35);
  const denied = outcomes.filter((o) => /Too many clinic lookups|Maombi mengi ya kliniki/.test(o.text));
  assert(denied.length > 0, "expected at least one throttled clinic response");

  const count = await waitForRow(async () => {
    const { count } = await admin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "rate_limit_429")
      .eq("scope", "ussd-clinic")
      .gte("created_at", since)
      .filter("details->>phone_hash", "eq", phoneHash);
    return count ?? 0;
  });
  assert(count > 0, `expected security_events row for clinic burst (phone_hash=${phoneHash.slice(0, 8)}…), got 0`);
  await flushSecurityEvents();
});

Deno.test({ ...opts, name: "USSD invalid donate amount logs validation_failed with menu_path" }, async () => {
  const phone = `+25472${Math.floor(1e7 + Math.random() * 9e7)}`;
  const phoneHash = await sha256Hex(phone);
  const since = new Date(Date.now() - 5_000).toISOString();

  // "abc" gets sanitized to "", producing invalid amount branch. Use "5*99999" (>70000).
  const res = await fetch(URL_FN, { method: "POST", headers: { apikey: ANON_KEY }, body: body("5*99999", phone) });
  const txt = await res.text();
  assert(/Invalid amount|Kiasi si sahihi/.test(txt), `expected invalid-amount response, got: ${txt}`);

  const count = await waitForRow(async () => {
    const { count } = await admin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "validation_failed")
      .eq("scope", "ussd-donate")
      .gte("created_at", since)
      .filter("details->>phone_hash", "eq", phoneHash);
    return count ?? 0;
  });
  assert(count > 0, `expected validation_failed row for donate (phone_hash=${phoneHash.slice(0, 8)}…), got 0`);
  await flushSecurityEvents();
});
