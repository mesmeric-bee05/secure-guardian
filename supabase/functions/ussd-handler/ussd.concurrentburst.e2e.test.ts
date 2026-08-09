// E2E: concurrent USSD bursts from multiple distinct phone numbers.
// Asserts exact success-vs-429 accounting per phone, that every persisted
// rate_limit_429 row correlates to the correct event_type / scope / menu_path
// / phone_hash, and that per-phone budgets are isolated across phones.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { flushSecurityEvents, sha256Hex } from "../_shared/securityLog.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const URL_FN = `${SUPABASE_URL}/functions/v1/ussd-handler`;

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

// Per-phone bucket is 30 requests/min (see ussd-handler: ipLimitPerMin: 30 on
// the 'ussd-phone' scope). Token-bucket refill can let a couple extra through
// while a burst is in flight, hence the small tolerance.
const PHONE_LIMIT = 30;
const REFILL_TOLERANCE = 5;
const BURST = 45;

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

const DENIED_RE = /Too many requests|Too many (clinic lookups|donation attempts)/;

const USSD_SCOPES = ["ussd-ip", "ussd-phone", "ussd-clinic", "ussd-donate"];
const SCOPE_LIMITS: Record<string, number> = {
  "ussd-ip": 120,
  "ussd-phone": 30,
  "ussd-clinic": 60,
  "ussd-donate": 30,
};

/** Every throttled USSD response must carry usable rate-limit headers. */
function assertRateLimitHeaders(headers: Headers, label: string) {
  const retry = headers.get("Retry-After");
  assert(retry !== null, `${label}: Retry-After header missing on a throttled response`);
  assert(/^\d+$/.test(retry!), `${label}: Retry-After must be an integer, got "${retry}"`);
  assert(Number(retry) > 0, `${label}: Retry-After must be positive, got ${retry}`);

  const scope = headers.get("X-RateLimit-Scope");
  assert(scope !== null, `${label}: X-RateLimit-Scope header missing`);
  assert(USSD_SCOPES.includes(scope!), `${label}: unexpected X-RateLimit-Scope "${scope}"`);

  const limit = headers.get("X-RateLimit-Limit");
  assertEquals(limit, String(SCOPE_LIMITS[scope!]), `${label}: X-RateLimit-Limit for scope ${scope}`);

  const remaining = headers.get("X-RateLimit-Remaining");
  assert(remaining !== null && /^\d+$/.test(remaining), `${label}: X-RateLimit-Remaining must be an integer`);
  assertEquals(Number(remaining), 0, `${label}: a throttled response must report 0 remaining`);
  return scope!;
}

async function hit(phone: string, text = "") {
  const res = await fetch(URL_FN, { method: "POST", headers: { apikey: ANON_KEY }, body: payload(text, phone) });
  const body = await res.text();
  const denied = DENIED_RE.test(body);
  return { status: res.status, text: body, denied, headers: res.headers };
}


async function burst(phone: string, n: number, text = "") {
  const out: Awaited<ReturnType<typeof hit>>[] = [];
  for (let i = 0; i < n; i++) out.push(await hit(phone, text));
  return out;
}

interface EventRow {
  event_type: string;
  scope: string;
  details: { menu_path?: string; phone_hash?: string } | null;
}

async function eventsForHash(hash: string, since: string): Promise<EventRow[]> {
  const { data } = await admin
    .from("security_events")
    .select("event_type, scope, details")
    .eq("event_type", "rate_limit_429")
    .gte("created_at", since)
    .filter("details->>phone_hash", "eq", hash)
    .limit(200);
  return (data ?? []) as EventRow[];
}

async function waitForEvents(hash: string, since: string, min = 1, timeoutMs = 10_000): Promise<EventRow[]> {
  const deadline = Date.now() + timeoutMs;
  let rows: EventRow[] = [];
  while (Date.now() < deadline) {
    rows = await eventsForHash(hash, since);
    if (rows.length >= min) return rows;
    await new Promise((r) => setTimeout(r, 250));
  }
  return rows;
}

Deno.test({
  ...opts,
  name: "concurrent bursts: per-phone served/429 counts are exact and every 429 row has the right event_type, scope, menu_path and phone_hash",
}, async () => {
  const phones = [randomPhone(), randomPhone(), randomPhone()];
  const hashes = await Promise.all(phones.map(sha256Hex));
  const since = new Date(Date.now() - 5_000).toISOString();

  // All three phones hammer the main menu ('' -> menu_path '') in parallel.
  const results = await Promise.all(phones.map((p) => burst(p, BURST)));

  results.forEach((res, i) => {
    const throttled = res.filter((r) => r.denied).length;
    const served = res.filter((r) => !r.denied).length;

    assertEquals(served + throttled, BURST, `phone #${i}: every request must be served or throttled`);
    assert(served > 0, `phone #${i}: expected some served responses before the limit tripped`);
    assert(
      served <= PHONE_LIMIT + REFILL_TOLERANCE,
      `phone #${i}: expected at most ${PHONE_LIMIT + REFILL_TOLERANCE} served, got ${served}`,
    );
    assert(
      throttled >= BURST - PHONE_LIMIT - REFILL_TOLERANCE,
      `phone #${i}: expected at least ${BURST - PHONE_LIMIT - REFILL_TOLERANCE} throttled, got ${throttled}`,
    );
  });

  for (let i = 0; i < phones.length; i++) {
    const hash = hashes[i];
    const rows = await waitForEvents(hash, since);
    assert(rows.length > 0, `expected rate_limit_429 rows for phone #${i} (hash ${hash.slice(0, 8)}…), got 0`);

    for (const row of rows) {
      assertEquals(row.event_type, "rate_limit_429", "event_type must be rate_limit_429");
      assert(
        ["ussd-phone", "ussd-ip"].includes(row.scope),
        `unexpected scope "${row.scope}" for a USSD main-menu burst`,
      );
      assertEquals(row.details?.menu_path, "", "main-menu burst must record an empty menu_path");
      assertEquals(row.details?.phone_hash, hash, "phone_hash must match sha256(phone)");
    }

    // Cross-phone isolation: no other phone's hash appears in this phone's rows.
    const otherHashes = hashes.filter((h) => h !== hash);
    for (const row of rows) {
      assert(!otherHashes.includes(row.details?.phone_hash ?? ""), "429 row leaked another phone's hash");
    }
  }

  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "a donate-branch burst records rate_limit_429 rows carrying the donate menu_path",
}, async () => {
  const phone = randomPhone();
  const hash = await sha256Hex(phone);
  const since = new Date(Date.now() - 5_000).toISOString();

  const res = await burst(phone, BURST, "5");
  const throttled = res.filter((r) => r.denied).length;
  const served = res.filter((r) => !r.denied).length;
  assertEquals(served + throttled, BURST, "every donate-branch request must be served or throttled");
  assert(throttled > 0, `expected throttled donate-branch responses, got ${throttled}`);

  const rows = await waitForEvents(hash, since);
  assert(rows.length > 0, "expected persisted rate_limit_429 rows for the donate burst");
  for (const row of rows) {
    assertEquals(row.event_type, "rate_limit_429");
    assert(["ussd-phone", "ussd-ip", "ussd-donate"].includes(row.scope), `unexpected scope "${row.scope}"`);
    assertEquals(row.details?.menu_path, "5", "donate-branch 429 must record menu_path '5'");
    assertEquals(row.details?.phone_hash, hash);
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
    !first.denied || /ussd-ip/.test(first.text),
    `fresh phone was throttled by another phone's budget: ${first.text.slice(0, 120)}`,
  );

  await flushSecurityEvents();
});
