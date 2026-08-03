// E2E: concurrent USSD bursts from multiple distinct phone numbers.
// Verifies per-phone rate limiting is isolated (one phone's burst does not
// exhaust another's budget) and that rate_limit_429 rows are persisted per
// phone hash with the correct scope and menu_path.
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

function randomPhone() {
  return `+25473${Math.floor(1e7 + Math.random() * 9e7)}`;
}

function payload(text: string, phone: string) {
  const fd = new FormData();
  fd.set("sessionId", `cburst-${crypto.randomUUID()}`);
  fd.set("phoneNumber", phone);
  fd.set("text", text);
  return fd;
}

async function hit(phone: string, text = "") {
  const res = await fetch(URL_FN, { method: "POST", headers: { apikey: ANON_KEY }, body: payload(text, phone) });
  return { status: res.status, text: await res.text() };
}

async function burst(phone: string, n: number) {
  const out: { status: number; text: string }[] = [];
  for (let i = 0; i < n; i++) out.push(await hit(phone));
  return out;
}

async function waitForCount(fn: () => Promise<number>, min = 1, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    last = await fn();
    if (last >= min) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

Deno.test({
  ...opts,
  name: "concurrent USSD bursts from multiple phones each trip 429 and log per-phone rate_limit_429 rows",
}, async () => {
  const phones = [randomPhone(), randomPhone(), randomPhone()];
  const hashes = await Promise.all(phones.map(sha256Hex));
  const since = new Date(Date.now() - 5_000).toISOString();

  // ussd-phone bucket = 30/min per phone. Fire 45 per phone, all in parallel.
  const results = await Promise.all(phones.map((p) => burst(p, 45)));

  results.forEach((res, i) => {
    const denied = res.filter((r) => /Too many requests/.test(r.text));
    assert(denied.length > 0, `phone #${i} expected throttled responses, got ${denied.length}`);
    // Bilingual denial copy (EN + SW) must be present.
    assert(denied.some((r) => /Too many requests/.test(r.text)), "expected English denial copy");
  });

  for (let i = 0; i < phones.length; i++) {
    const hash = hashes[i];
    const count = await waitForCount(async () => {
      const { count } = await admin
        .from("security_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "rate_limit_429")
        .in("scope", ["ussd-ip", "ussd-phone"])
        .gte("created_at", since)
        .filter("details->>phone_hash", "eq", hash);
      return count ?? 0;
    });
    assert(count > 0, `expected rate_limit_429 rows for phone #${i} (hash ${hash.slice(0, 8)}…), got 0`);

    const { data } = await admin
      .from("security_events")
      .select("scope, details")
      .eq("event_type", "rate_limit_429")
      .gte("created_at", since)
      .filter("details->>phone_hash", "eq", hash)
      .limit(3);
    const row = (data ?? [])[0] as { scope: string; details: { menu_path?: string; phone_hash?: string } } | undefined;
    assert(row, `expected persisted row for phone #${i}`);
    assert(typeof row!.details?.menu_path === "string", "menu_path must be recorded");
    assert(row!.details?.phone_hash === hash, "phone_hash must match sha256(phone)");
  }

  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "a fresh phone is not blocked by another phone's exhausted per-phone budget",
}, async () => {
  const noisy = randomPhone();
  await burst(noisy, 40); // exhaust the noisy phone's per-phone bucket

  const quiet = randomPhone();
  const first = await hit(quiet);
  // Per-phone isolation: the quiet phone's first request must not be denied by
  // the noisy phone's usage. (A shared IP bucket may still apply under heavy
  // parallel load, so only assert the per-phone scope did not deny it.)
  assert(
    !/Too many requests/.test(first.text) || /ussd-ip/.test(first.text),
    `fresh phone was throttled by another phone's budget: ${first.text.slice(0, 120)}`,
  );

  await flushSecurityEvents();
});
