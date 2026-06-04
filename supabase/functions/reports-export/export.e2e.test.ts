// E2E tests for the reports-export edge function: auth/admin gates, validation,
// happy-path stream per dataset, and 429 contract.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { flushSecurityEvents } from "../_shared/securityLog.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const URL_FN = `${SUPABASE_URL}/functions/v1/reports-export`;

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

function headers(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function body(dataset = "security"): string {
  return JSON.stringify({ dataset, since: new Date(Date.now() - 86_400_000).toISOString() });
}

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

Deno.test({ ...opts, name: "reports-export: 401 without bearer" }, async () => {
  const res = await fetch(URL_FN, { method: "POST", headers: headers(), body: body() });
  assertEquals(res.status, 401);
  await res.text();
  await flushSecurityEvents();
});

Deno.test({ ...opts, name: "reports-export: 401 with bad bearer" }, async () => {
  const res = await fetch(URL_FN, { method: "POST", headers: headers("not.a.jwt"), body: body() });
  assertEquals(res.status, 401);
  await res.text();
  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "reports-export: 403 for non-admin user",
  ignore: !USER_EMAIL || !USER_PASSWORD,
}, async () => {
  const token = await getToken(USER_EMAIL, USER_PASSWORD);
  assert(token);
  const res = await fetch(URL_FN, { method: "POST", headers: headers(token!), body: body() });
  assertEquals(res.status, 403);
  await res.text();
  await flushSecurityEvents();
});

Deno.test({
  ...opts,
  name: "reports-export: 400 on bad payload",
  ignore: !ADMIN_EMAIL || !ADMIN_PASSWORD,
}, async () => {
  const token = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert(token);
  const res = await fetch(URL_FN, {
    method: "POST", headers: headers(token!),
    body: JSON.stringify({ dataset: "nope", since: "x" }),
  });
  assert(res.status === 400 || res.status === 422);
  await res.text();
  await flushSecurityEvents();
});

for (const dataset of ["cases", "sms", "security", "protocols"]) {
  Deno.test({
    ...opts,
    name: `reports-export: 200 streams CSV for ${dataset}`,
    ignore: !ADMIN_EMAIL || !ADMIN_PASSWORD,
  }, async () => {
    const token = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert(token);
    const res = await fetch(URL_FN, { method: "POST", headers: headers(token!), body: body(dataset) });
    assertEquals(res.status, 200);
    assert((res.headers.get("Content-Type") || "").includes("text/csv"));
    const dispo = res.headers.get("Content-Disposition") || "";
    assert(dispo.includes(`report-${dataset}-`), `bad disposition: ${dispo}`);
    assertEquals(res.headers.get("X-Content-Type-Options"), "nosniff");
    const text = await res.text();
    const firstLine = text.split("\n")[0];
    assert(firstLine.length > 0, "header line missing");
    await flushSecurityEvents();
  });
}

Deno.test({
  ...opts,
  name: "reports-export: 429 burst returns Retry-After + X-RateLimit-*",
  ignore: !ADMIN_EMAIL || !ADMIN_PASSWORD,
}, async () => {
  const token = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert(token);
  const responses = await Promise.all(
    Array.from({ length: 14 }, () =>
      fetch(URL_FN, { method: "POST", headers: headers(token!), body: body() })
    ),
  );
  await Promise.all(responses.map((r) => r.text().catch(() => "")));
  const blocked = responses.find((r) => r.status === 429);
  assert(blocked, "expected at least one 429 in the burst");
  const retry = blocked.headers.get("Retry-After");
  assert(retry && Number(retry) > 0);
  assert(blocked.headers.get("X-RateLimit-Limit") !== null);
  assert(blocked.headers.get("X-RateLimit-Remaining") !== null);
  await flushSecurityEvents();
});
