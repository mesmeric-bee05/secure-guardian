// E2E: fire an IP-scoped USSD burst (single phone/IP hammers the ussd-ip
// bucket at 120/min) and confirm rate_limit_429 rows land with the correct
// scope, hashed phone and menu_path. Complements ussd.securityevents.e2e.test.ts
// (which covers ussd-donate + ussd-clinic sub-flow scopes).
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
  const responses: { status: number; text: string }[] = [];
  for (let i = 0; i < 45; i++) {
    const res = await fetch(URL_FN, { method: "POST", headers: { apikey: ANON_KEY }, body: payload("", phone) });
    responses.push({ status: res.status, text: await res.text() });
  }

  const denied = responses.filter((r) => /Too many requests/.test(r.text));
  assert(denied.length > 0, `expected some throttled responses, got ${denied.length}`);

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
    .select("scope, details")
    .eq("event_type", "rate_limit_429")
    .gte("created_at", since)
    .filter("details->>phone_hash", "eq", phoneHash)
    .limit(5);
  const row = (data ?? [])[0] as { scope: string; details: { menu_path?: string; phone_hash?: string } } | undefined;
  assert(row, "expected at least one persisted rate_limit_429 row");
  assert(typeof row!.details?.menu_path === "string", "menu_path must be present in details");
  assert(row!.details?.phone_hash === phoneHash, "phone_hash in details must match sha256(phone)");

  await flushSecurityEvents();
});
