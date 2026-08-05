// E2E: non-admin access proofs for Security Analytics.
// Verifies the streaming export endpoint returns 401/403, that RLS hides
// security_events rows from a non-admin PostgREST query (while the same rows
// are visible to service_role), and that the admin tab renders the
// "Admin access required" card for a non-admin session.
//
// Skips gracefully when SUPABASE_SERVICE_ROLE_KEY / TEST_USER_* are absent.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const USER_EMAIL = process.env.TEST_USER_EMAIL ?? "";
const USER_PASS = process.env.TEST_USER_PASSWORD ?? "";

const hasEnv = Boolean(SUPABASE_URL && ANON && SERVICE && USER_EMAIL && USER_PASS);
const EXPORT_URL = `${SUPABASE_URL}/functions/v1/security-events-export`;
const TAG = `authz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const SINCE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function svc() {
  return createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function nonAdminToken(): Promise<string> {
  const c = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email: USER_EMAIL, password: USER_PASS });
  if (error || !data.session) throw new Error(`non-admin sign-in failed: ${error?.message}`);
  const { data: isAdmin } = await svc().rpc("is_admin", { _user_id: data.session.user.id });
  if (isAdmin) throw new Error("TEST_USER_EMAIL is an admin — this suite needs a non-admin identity");
  return data.session.access_token;
}

test.describe("Security Analytics — non-admin authorization", () => {
  test.skip(!hasEnv, "requires SUPABASE_SERVICE_ROLE_KEY + TEST_USER_EMAIL/TEST_USER_PASSWORD");

  test.beforeAll(async () => {
    const { error } = await svc().from("security_events").insert([
      {
        event_type: "rate_limit_429",
        scope: "ussd-donate",
        ip_address: "10.9.9.9",
        severity: "info",
        details: { tag: TAG, menu_path: "5*100" },
        created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
    ]);
    if (error) throw new Error(`seed failed: ${error.message}`);
  });

  test.afterAll(async () => {
    await svc().from("security_events").delete().filter("details->>tag", "eq", TAG);
  });

  test("unauthenticated export request is rejected with 401 and no CSV", async ({ request }) => {
    const res = await request.post(EXPORT_URL, {
      headers: { apikey: ANON, "Content-Type": "application/json" },
      data: { since: SINCE },
    });
    expect(res.status()).toBe(401);
    expect(res.headers()["content-type"] ?? "").not.toContain("text/csv");
    expect(await res.text()).not.toContain("created_at,event_type");
  });

  test("signed-in non-admin export request is rejected with 403 and no CSV", async ({ request }) => {
    const token = await nonAdminToken();
    const res = await request.post(EXPORT_URL, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { since: SINCE },
    });
    expect(res.status()).toBe(403);
    const body = await res.text();
    expect(res.headers()["content-type"] ?? "").toContain("application/json");
    expect(JSON.parse(body).error).toBe("Forbidden");
    expect(body).not.toContain(TAG);
  });

  test("RLS blocks a direct non-admin query on security_events", async () => {
    const c = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error: signInErr } = await c.auth.signInWithPassword({ email: USER_EMAIL, password: USER_PASS });
    expect(signInErr).toBeNull();

    const { data, error } = await c
      .from("security_events")
      .select("id, event_type, details")
      .filter("details->>tag", "eq", TAG);
    // Either a hard permission error or zero rows — both mean RLS blocked it.
    expect(error ? true : (data ?? []).length === 0).toBe(true);

    // Same rows ARE visible to service_role, proving the table is not just empty.
    const { data: asService } = await svc()
      .from("security_events")
      .select("id")
      .filter("details->>tag", "eq", TAG);
    expect((asService ?? []).length).toBeGreaterThan(0);
  });

  test("non-admin sees the admin-access-required card in the Security Analytics tab", async ({ page }) => {
    const c = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data } = await c.auth.signInWithPassword({ email: USER_EMAIL, password: USER_PASS });
    const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;

    await page.goto("/");
    await page.evaluate(
      ({ k, v }) => window.localStorage.setItem(k, v),
      { k: storageKey, v: JSON.stringify(data.session) },
    );
    await page.goto("/admin");

    // Either the whole /admin route is gated, or the tab shows the guard card.
    const guard = page.getByText(/admin access required|not authorized|access denied/i).first();
    const redirected = /\/(auth|)$/.test(new URL(page.url()).pathname);
    if (!redirected) {
      const tab = page.getByRole("button", { name: /security\s*analytics/i }).first();
      if (await tab.count()) await tab.click();
      await expect(guard).toBeVisible();
      await expect(page.getByTestId("sec-export-csv")).toHaveCount(0);
    }
  });

  test("non-admin hitting the export endpoint URL directly gets 403 with an empty body", async ({ page }) => {
    const c = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data } = await c.auth.signInWithPassword({ email: USER_EMAIL, password: USER_PASS });
    const token = data.session!.access_token;

    // Hit the function URL directly from the browser context (same origin
    // handling as a user pasting the endpoint into the address bar / fetch).
    await page.goto("/");
    const res = await page.request.post(EXPORT_URL, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { since: SINCE },
      failOnStatusCode: false,
    });

    expect(res.status()).toBe(403);
    const headers = res.headers();
    expect(headers["content-type"] ?? "").not.toContain("text/csv");
    expect(headers["content-disposition"] ?? "").not.toContain("attachment");

    const body = (await res.text()).trim();
    // No CSV payload of any kind: no header row, no data rows, no seeded data.
    expect(body).not.toContain("created_at,event_type");
    expect(body).not.toContain(TAG);
    expect(body.split("\n").filter((l) => l.includes(","))).toHaveLength(0);
    // Body is empty or a bare {"error":"Forbidden"} envelope — nothing else.
    expect(body === "" || JSON.parse(body).error === "Forbidden").toBe(true);
    if (body !== "") expect(Object.keys(JSON.parse(body))).toEqual(["error"]);

    // A GET on the same URL must not leak data either.
    const getRes = await page.request.get(EXPORT_URL, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    });
    expect([401, 403, 405]).toContain(getRes.status());
    expect(await getRes.text()).not.toContain(TAG);
  });
});

