// E2E: fire an IP-scoped USSD burst (single phone/IP hammers the ussd-ip
// bucket at 120/min) and confirm rate_limit_429 rows land with the correct
// scope, hashed phone and menu_path. Complements ussd.securityevents.e2e.test.ts
// (which covers ussd-donate + ussd-clinic sub-flow scopes).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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

function payload(text: string, phone: string) {
  const fd = new FormData();
  fd.set("sessionId", `burst-${crypto.randomUUID()}`);
  fd.set("phoneNumber", phone);
  fd.set("text", text);
  return fd;
}

async function waitForCount(query: () => Promise<number>, min = 1, timeoutMs = 6000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    last = await query();
    if (last >= min) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

Deno.test({
  ...opts,
  name: "USSD rapid burst on main menu trips ussd-phone limit and logs rate_limit_429 with phone_hash + menu_path",
}, async () => {
  const phone = `+25473${Math.floor(1e7 + Math.random() * 9e7)}`;
  const phoneHash = await sha256Hex(phone);
  const since = new Date(Date.now() - 5_000).toISOString();

  // ussd-phone bucket = 30/min. Fire 45 hits at the main menu ('') to trip it.
  const responses: { status: number; text: string; headers: Headers }[] = [];
  for (let i = 0; i < 45; i++) {
    const res = await fetch(URL_FN, { method: "POST", headers: { apikey: ANON_KEY }, body: payload("", phone) });
    responses.push({ status: res.status, text: await res.text(), headers: res.headers });
  }

  const denied = responses.filter((r) => /Too many requests/.test(r.text));
  assert(denied.length > 0, `expected some throttled responses, got ${denied.length}`);

  // Throttled responses must advertise the standard rate-limit headers.
  const SCOPE_LIMITS: Record<string, string> = { "ussd-ip": "120", "ussd-phone": "30" };
  denied.forEach((r, i) => {
    const retry = r.headers.get("Retry-After");
    assert(retry !== null && /^\d+$/.test(retry) && Number(retry) > 0, `denial #${i}: bad Retry-After "${retry}"`);
    const scope = r.headers.get("X-RateLimit-Scope");
    assert(scope !== null && scope in SCOPE_LIMITS, `denial #${i}: unexpected X-RateLimit-Scope "${scope}"`);
    assertEquals(r.headers.get("X-RateLimit-Limit"), SCOPE_LIMITS[scope!], `denial #${i}: X-RateLimit-Limit`);
    assertEquals(r.headers.get("X-RateLimit-Remaining"), "0", `denial #${i}: X-RateLimit-Remaining`);
  });


  const count = await waitForCount(async () => {
    const { count } = await admin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "rate_limit_429")
      .in("scope", ["ussd-ip", "ussd-phone"])
      .gte("created_at", since)
      .filter("details->>phone_hash", "eq", phoneHash);
    return count ?? 0;
  });
  assert(count > 0, `expected rate_limit_429 row for burst (phone_hash=${phoneHash.slice(0, 8)}…), got 0`);

  // Menu path should be recorded (empty for main menu is still stored as "").
  const { data } = await admin
    .from("security_events")
    .select("event_type, scope, details, created_at")
    .gte("created_at", since)
    .filter("details->>phone_hash", "eq", phoneHash);
  const rows = (data ?? []) as {
    event_type: string;
    scope: string;
    details: { menu_path?: string; phone_hash?: string };
  }[];
  assert(rows.length > 0, "expected at least one persisted rate_limit_429 row");

  // No side-effects beyond the throttling itself: every row for this phone is a
  // rate_limit_429 on the main menu, and never more rows than 429 responses.
  for (const r of rows) {
    assertEquals(r.event_type, "rate_limit_429", `unexpected event_type ${r.event_type}`);
    assert(["ussd-ip", "ussd-phone"].includes(r.scope), `unexpected scope ${r.scope}`);
    assertEquals(r.details?.menu_path ?? "", "", "main-menu burst must log menu_path ''");
    assertEquals(r.details?.phone_hash, phoneHash, "phone_hash in details must match sha256(phone)");
  }
  assert(
    rows.length <= denied.length,
    `logged ${rows.length} security_events for ${denied.length} throttled responses — no extra rows expected`,
  );

  // Throttling is not an admin action: it must not touch audit_logs.
  const { count: auditCount } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
    .in("action", ["ussd_rate_limit", "rate_limit_429"]);
  assertEquals(auditCount ?? 0, 0, "USSD throttling must not create audit_logs rows");


  await flushSecurityEvents();
});
