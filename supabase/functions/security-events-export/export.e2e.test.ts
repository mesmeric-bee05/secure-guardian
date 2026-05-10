// E2E tests for the security-events-export edge function.
// Verifies auth (401), admin gate (403), validation (400), happy path (200 stream)
// and graceful 429 with Retry-After + X-RateLimit-* headers.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { flushSecurityEvents } from "../_shared/securityLog.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const URL_FN = `${SUPABASE_URL}/functions/v1/security-events-export`;

const ADMIN_EMAIL = Deno.env.get("ADMIN_TEST_EMAIL");
const ADMIN_PASSWORD = Deno.env.get("ADMIN_TEST_PASSWORD");
const USER_EMAIL = Deno.env.get("TEST_USER_EMAIL");
const USER_PASSWORD = Deno.env.get("TEST_USER_PASSWORD");

async function getToken(email?: string, password?: string): Promise<string | null> {
  if (!email || !password) return null;
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return data.session.access_token;
}

function baseHeaders(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function bodyJson(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...extra,
  });
}

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

Deno.test({ ...opts, name: "401 when no Authorization header" }, async () => {
  const res = await fetch(URL_FN, { method: "POST", headers: baseHeaders(), body: bodyJson() });
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(typeof json.error, "string");
  await flushSecurityEvents();
});

Deno.test({ ...opts, name: "401 when bearer is invalid" }, async () => {
  const res = await fetch(URL_FN, {
    method: "POST",
    headers: baseHeaders("invalid.jwt.token"),
    body: bodyJson(),
  });
  assertEquals(res.status, 401);
  await res.text();
  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "403 when caller is signed in but not admin",
  ignore: !USER_EMAIL || !USER_PASSWORD,
}, async () => {
  const token = await getToken(USER_EMAIL, USER_PASSWORD);
  assert(token, "expected to sign in non-admin test user");
  const res = await fetch(URL_FN, { method: "POST", headers: baseHeaders(token!), body: bodyJson() });
  assertEquals(res.status, 403);
  const json = await res.json();
  assertEquals(json.error, "Forbidden");
  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "400 when 'since' is missing/invalid",
  ignore: !ADMIN_EMAIL || !ADMIN_PASSWORD,
}, async () => {
  const token = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert(token, "admin login required");
  const res = await fetch(URL_FN, {
    method: "POST",
    headers: baseHeaders(token!),
    body: JSON.stringify({ since: "not-a-date" }),
  });
  assert(res.status === 400 || res.status === 422, `expected 400/422, got ${res.status}`);
  await res.text();
  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "200 streams CSV with correct headers (admin)",
  ignore: !ADMIN_EMAIL || !ADMIN_PASSWORD,
}, async () => {
  const token = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert(token, "admin login required");
  const res = await fetch(URL_FN, { method: "POST", headers: baseHeaders(token!), body: bodyJson() });
  assertEquals(res.status, 200);
  const ct = res.headers.get("Content-Type") || "";
  assert(ct.includes("text/csv"), `Content-Type was ${ct}`);
  const dispo = res.headers.get("Content-Disposition") || "";
  assert(dispo.includes("attachment") && dispo.includes("security-events-"), `Content-Disposition was ${dispo}`);
  assertEquals(res.headers.get("Cache-Control"), "no-store");
  assertEquals(res.headers.get("X-Content-Type-Options"), "nosniff");
  const text = await res.text();
  const firstLine = text.split("\n")[0];
  assertEquals(firstLine, "created_at,event_type,scope,severity,ip_address,user_id,details");
  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "429 burst returns Retry-After + X-RateLimit-* headers",
  ignore: !ADMIN_EMAIL || !ADMIN_PASSWORD,
}, async () => {
  const token = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert(token, "admin login required");
  // Limit is 5/min/IP and 10/min/user. Burst 14 in parallel from one client.
  const responses = await Promise.all(
    Array.from({ length: 14 }, () =>
      fetch(URL_FN, { method: "POST", headers: baseHeaders(token!), body: bodyJson() })
    ),
  );
  // Drain all bodies to avoid leaks.
  await Promise.all(responses.map((r) => r.text().catch(() => "")));
  const blocked = responses.find((r) => r.status === 429);
  assert(blocked, "expected at least one 429 in the burst");
  const retry = blocked.headers.get("Retry-After");
  assert(retry !== null && Number(retry) > 0, "Retry-After missing or non-positive");
  assert(blocked.headers.get("X-RateLimit-Limit") !== null, "X-RateLimit-Limit missing");
  assert(blocked.headers.get("X-RateLimit-Remaining") !== null, "X-RateLimit-Remaining missing");
  await flushSecurityEvents();
});
