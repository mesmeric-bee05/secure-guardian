// E2E: the Security Analytics streaming export must reject invalid/unexpected
// filter fields with a clear 4xx JSON error and never emit any CSV bytes.
//
// Skips gracefully when admin credentials are absent.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? "";

const EXPORT_URL = `${SUPABASE_URL}/functions/v1/security-events-export`;
const hasEnv = Boolean(SUPABASE_URL && ANON && ADMIN_EMAIL && ADMIN_PASS);
const SINCE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

async function adminToken(): Promise<string> {
  const c = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  if (error || !data.session) throw new Error(`admin sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

type Case = { name: string; body: unknown };

const CASES: Case[] = [
  { name: "unknown field", body: { since: SINCE, bogus: 1 } },
  { name: "unknown filter alias", body: { since: SINCE, event_type: "rate_limit_429" } },
  { name: "wrong type for eventType", body: { since: SINCE, eventType: 123 } },
  { name: "out-of-enum eventType", body: { since: SINCE, eventType: "not_a_real_event" } },
  { name: "out-of-enum severity", body: { since: SINCE, severity: "catastrophic" } },
  { name: "oversized scopeContains", body: { since: SINCE, scopeContains: "x".repeat(500) } },
  { name: "malformed since", body: { since: "yesterday" } },
  { name: "missing since", body: {} },
  { name: "non-uuid userId", body: { since: SINCE, userId: "not-a-uuid" } },
  { name: "array body", body: [{ since: SINCE }] },
];

test.describe("Security Analytics — invalid filter rejection", () => {
  test.skip(!hasEnv, "requires TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD");

  for (const c of CASES) {
    test(`rejects ${c.name} with 4xx and no export`, async ({ request }) => {
      const token = await adminToken();
      const res = await request.post(EXPORT_URL, {
        headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: c.body as Record<string, unknown>,
      });

      expect(res.status(), `status for "${c.name}"`).toBeGreaterThanOrEqual(400);
      expect(res.status(), `status for "${c.name}"`).toBeLessThan(500);

      const headers = res.headers();
      // No CSV stream may start for a rejected request.
      expect(headers["content-type"] ?? "").toContain("application/json");
      expect(headers["content-type"] ?? "").not.toContain("text/csv");
      expect(headers["content-disposition"]).toBeUndefined();

      const text = await res.text();
      expect(text).not.toContain("created_at,event_type");
      const body = JSON.parse(text) as { error?: unknown };
      expect(typeof body.error, `error payload for "${c.name}": ${text}`).toBe("string");
      expect(String(body.error).length).toBeGreaterThan(0);
      // Errors must not echo secrets or full row data.
      expect(text).not.toMatch(/service_role|eyJhbGciOi/);
    });
  }

  test("malformed JSON body is rejected with 400 and a JSON error", async ({ request }) => {
    const token = await adminToken();
    const res = await request.post(EXPORT_URL, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: "{not-json",
    });
    expect(res.status()).toBe(400);
    expect(res.headers()["content-disposition"]).toBeUndefined();
    expect(JSON.parse(await res.text()).error).toBeTruthy();
  });

  test("a valid body still exports (control case)", async ({ request }) => {
    const token = await adminToken();
    const res = await request.post(EXPORT_URL, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { since: SINCE },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(await res.text()).toContain("created_at,event_type");
  });
});
