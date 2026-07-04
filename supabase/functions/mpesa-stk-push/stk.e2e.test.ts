// E2E tests for mpesa-stk-push: auth gates, Zod validation, 503 when secrets
// missing (demo mode), and 429 burst contract. Covers both sandbox and
// production behaviour — the function selects the Daraja host from MPESA_ENV.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { flushSecurityEvents } from "../_shared/securityLog.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const URL_FN = `${SUPABASE_URL}/functions/v1/mpesa-stk-push`;

const USER_EMAIL = Deno.env.get("TEST_USER_EMAIL");
const USER_PASSWORD = Deno.env.get("TEST_USER_PASSWORD");

async function token(): Promise<string | null> {
  if (!USER_EMAIL || !USER_PASSWORD) return null;
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: USER_EMAIL, password: USER_PASSWORD });
  if (error || !data.session) return null;
  return data.session.access_token;
}

function headers(bearer?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  };
}

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

Deno.test({ ...opts, name: "mpesa-stk-push: 401 without bearer" }, async () => {
  const res = await fetch(URL_FN, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ amount: 500, phone: "254712345678" }),
  });
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test({ ...opts, name: "mpesa-stk-push: 401 with malformed bearer" }, async () => {
  const res = await fetch(URL_FN, {
    method: "POST", headers: headers("not.a.jwt"),
    body: JSON.stringify({ amount: 500, phone: "254712345678" }),
  });
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test({ ...opts, name: "mpesa-stk-push: 405 on GET" }, async () => {
  const res = await fetch(URL_FN, { method: "GET", headers: headers() });
  assert(res.status === 405 || res.status === 401);
  await res.text();
});

Deno.test({
  ...opts,
  name: "mpesa-stk-push: 400 on invalid body (Zod)",
  ignore: !USER_EMAIL || !USER_PASSWORD,
}, async () => {
  const t = await token();
  assert(t);
  const res = await fetch(URL_FN, {
    method: "POST", headers: headers(t!),
    body: JSON.stringify({ amount: 5, phone: "07123" }),
  });
  assertEquals(res.status, 400);
  const j = await res.json();
  assert(j.error, "expected error field");
  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "mpesa-stk-push: 400 on non-JSON body",
  ignore: !USER_EMAIL || !USER_PASSWORD,
}, async () => {
  const t = await token();
  assert(t);
  const res = await fetch(URL_FN, {
    method: "POST", headers: headers(t!),
    body: "not-json",
  });
  assertEquals(res.status, 400);
  await res.text();
});

Deno.test({
  ...opts,
  name: "mpesa-stk-push: 503 or 200 depending on MPESA_* secrets (auth+valid input)",
  ignore: !USER_EMAIL || !USER_PASSWORD,
}, async () => {
  const t = await token();
  assert(t);
  const res = await fetch(URL_FN, {
    method: "POST", headers: headers(t!),
    body: JSON.stringify({ amount: 10, phone: "254712345678", reference: "test" }),
  });
  // In demo mode we expect 503 mpesa_not_configured; in configured envs 200 or 502.
  assert([200, 502, 503].includes(res.status), `unexpected status ${res.status}`);
  const j = await res.json();
  if (res.status === 503) {
    assertEquals(j.error, "mpesa_not_configured");
    assert(Array.isArray(j.missing) && j.missing.length > 0);
  }
  if (res.status === 200) {
    assertEquals(j.ok, true);
    assert(typeof j.checkout_request_id === "string");
  }
  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "mpesa-stk-push: 429 burst returns Retry-After + X-RateLimit-*",
  ignore: !USER_EMAIL || !USER_PASSWORD,
}, async () => {
  const t = await token();
  assert(t);
  const responses = await Promise.all(
    Array.from({ length: 25 }, () =>
      fetch(URL_FN, {
        method: "POST", headers: headers(t!),
        body: JSON.stringify({ amount: 10, phone: "254712345678" }),
      })
    ),
  );
  await Promise.all(responses.map((r) => r.text().catch(() => "")));
  const blocked = responses.find((r) => r.status === 429);
  assert(blocked, "expected a 429 in the burst");
  assert(Number(blocked.headers.get("Retry-After")) > 0);
  assertEquals(blocked.headers.get("X-RateLimit-Limit"), "10");
  await flushSecurityEvents();
});
