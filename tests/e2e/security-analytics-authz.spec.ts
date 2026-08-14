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

  test("non-admin cannot read audit_logs even when they know the row id", async () => {
    const service = svc();
    // Seed a known audit row via service_role (bypasses the admin-only RPC).
    const { data: seeded, error: seedErr } = await service
      .from("audit_logs")
      .insert({
        action: "security_analytics_export",
        resource_type: "security_events",
        details: { tag: TAG, granularity: "day", rows: 1 },
      })
      .select("id")
      .single();
    expect(seedErr).toBeNull();
    const knownId = seeded!.id as string;

    try {
      const c = createClient(SUPABASE_URL, ANON, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: signIn, error: signInErr } = await c.auth.signInWithPassword({
        email: USER_EMAIL,
        password: USER_PASS,
      });
      expect(signInErr).toBeNull();
      const token = signIn.session!.access_token;

      // 1. Unfiltered select — blocked or empty.
      const all = await c.from("audit_logs").select("id, action, details").limit(50);
      expect(all.error ? true : (all.data ?? []).length === 0).toBe(true);

      // 2. Targeted select by the known id — knowing the identifier must not help.
      const byId = await c.from("audit_logs").select("id, action, details").eq("id", knownId);
      expect(byId.error ? true : (byId.data ?? []).length === 0).toBe(true);

      // 3. Filter on the seeded tag.
      const byTag = await c.from("audit_logs").select("id").filter("details->>tag", "eq", TAG);
      expect(byTag.error ? true : (byTag.data ?? []).length === 0).toBe(true);

      // 4. Raw PostgREST GET with the non-admin bearer token.
      const res = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs?id=eq.${knownId}&select=*`, {
        headers: { apikey: ANON, Authorization: `Bearer ${token}` },
      });
      expect([200, 401, 403]).toContain(res.status);
      const body = await res.text();
      expect(body).not.toContain(TAG);
      expect(body).not.toContain(knownId);
      if (res.status === 200) expect(JSON.parse(body)).toEqual([]);

      // Service role still sees it — the table is not simply empty.
      const { data: asService } = await service.from("audit_logs").select("id").eq("id", knownId);
      expect((asService ?? []).length).toBe(1);
    } finally {
      await service.from("audit_logs").delete().eq("id", knownId);
    }
  });

  test("non-admin cannot insert or update audit_logs via PostgREST", async () => {
    const service = svc();
    const { data: seeded, error: seedErr } = await service
      .from("audit_logs")
      .insert({
        action: "security_analytics_export",
        resource_type: "security_events",
        details: { tag: TAG, origin: "seed" },
      })
      .select("id, action, details")
      .single();
    expect(seedErr).toBeNull();
    const knownId = seeded!.id as string;

    try {
      const c = createClient(SUPABASE_URL, ANON, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: signIn, error: signInErr } = await c.auth.signInWithPassword({
        email: USER_EMAIL,
        password: USER_PASS,
      });
      expect(signInErr).toBeNull();
      const token = signIn.session!.access_token;
      const rest = (path: string, init: RequestInit) =>
        fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
          ...init,
          headers: {
            apikey: ANON,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
            ...(init.headers ?? {}),
          },
        });

      // 1. Raw INSERT — must be denied, and must not create a row.
      const insertRes = await rest("audit_logs", {
        method: "POST",
        body: JSON.stringify({
          action: "forged_admin_action",
          resource_type: "security_events",
          details: { tag: TAG, origin: "forged" },
        }),
      });
      expect([401, 403, 404, 405, 400]).toContain(insertRes.status);
      expect(insertRes.status).not.toBe(201);
      const insertBody = await insertRes.text();
      expect(insertBody).not.toContain("forged_admin_action");

      // 2. Raw UPDATE on a known id — must be denied / affect nothing.
      const patchRes = await rest(`audit_logs?id=eq.${knownId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "tampered", details: { tag: TAG, origin: "tampered" } }),
      });
      expect([401, 403, 404, 405, 400, 200, 204]).toContain(patchRes.status);
      const patchBody = await patchRes.text();
      expect(patchBody).not.toContain("tampered");
      if (patchRes.status === 200) expect(JSON.parse(patchBody || "[]")).toEqual([]);

      // 3. Same attempts through supabase-js for symmetry.
      const jsInsert = await c
        .from("audit_logs")
        .insert({ action: "forged_js", resource_type: "security_events", details: { tag: TAG } })
        .select("id");
      expect(jsInsert.error ? true : (jsInsert.data ?? []).length === 0).toBe(true);
      const jsUpdate = await c.from("audit_logs").update({ action: "tampered_js" }).eq("id", knownId).select("id");
      expect(jsUpdate.error ? true : (jsUpdate.data ?? []).length === 0).toBe(true);

      // 4. Nothing changed, and no forged rows exist (service_role view).
      const { data: after } = await service
        .from("audit_logs")
        .select("id, action, details")
        .eq("id", knownId)
        .single();
      expect(after!.action).toBe("security_analytics_export");
      expect((after!.details as Record<string, unknown>).origin).toBe("seed");

      const { data: forged } = await service
        .from("audit_logs")
        .select("id, action")
        .in("action", ["forged_admin_action", "forged_js", "tampered", "tampered_js"]);
      expect(forged ?? []).toHaveLength(0);
    } finally {
      await service.from("audit_logs").delete().eq("id", knownId);
    }
  });

  test("denied non-admin export is recorded in audit_logs", async ({ request }) => {
    const service = svc();
    const since = new Date().toISOString();
    const token = await nonAdminToken();
    const c = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: signIn } = await c.auth.signInWithPassword({ email: USER_EMAIL, password: USER_PASS });
    const nonAdminId = signIn.user!.id;

    const res = await request.post(EXPORT_URL, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { since: SINCE },
    });
    expect(res.status()).toBe(403);
    expect(await res.text()).not.toContain("created_at,event_type");

    // The denial must be provable in the tamper-evident audit chain.
    type Row = { id: string; action: string; user_id: string | null; resource_type: string | null; details: Record<string, unknown> };
    let rows: Row[] = [];
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && rows.length === 0) {
      const { data } = await service
        .from("audit_logs")
        .select("id, action, user_id, resource_type, details, created_at")
        .eq("action", "security_events_export_denied")
        .eq("user_id", nonAdminId)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      rows = (data ?? []) as Row[];
      if (rows.length === 0) await new Promise((r) => setTimeout(r, 500));
    }

    expect(rows.length, "expected exactly one denial audit entry").toBe(1);
    expect(rows[0].resource_type).toBe("security_events");
    expect(rows[0].user_id).toBe(nonAdminId);
    expect(String(rows[0].details.reason)).toMatch(/not_admin|role_lookup_failed/);

    await service.from("audit_logs").delete().in("id", rows.map((r) => r.id));
  });

  test("non-admin cannot delete rows from audit_logs (PostgREST)", async () => {
    const service = svc();
    const { data: seeded, error: seedErr } = await service
      .from("audit_logs")
      .insert([
        { action: "security_analytics_export", resource_type: "security_events", details: { tag: TAG, origin: "delete-proof-1" } },
        { action: "security_analytics_export", resource_type: "security_events", details: { tag: TAG, origin: "delete-proof-2" } },
      ])
      .select("id");
    expect(seedErr).toBeNull();
    const ids = (seeded ?? []).map((r) => r.id as string);
    expect(ids).toHaveLength(2);

    const countRows = async () => {
      const { data } = await service.from("audit_logs").select("id").in("id", ids);
      return (data ?? []).length;
    };
    expect(await countRows()).toBe(2);

    try {
      const c = createClient(SUPABASE_URL, ANON, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: signIn, error: signInErr } = await c.auth.signInWithPassword({
        email: USER_EMAIL,
        password: USER_PASS,
      });
      expect(signInErr).toBeNull();
      const token = signIn.session!.access_token;

      // 1. Targeted raw DELETE on a known id.
      const one = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs?id=eq.${ids[0]}`, {
        method: "DELETE",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      });
      expect([401, 403, 404, 405, 400, 200, 204]).toContain(one.status);
      expect(one.status).not.toBe(201);
      const oneBody = await one.text();
      expect(oneBody).not.toContain(ids[0]);
      if (one.status === 200) expect(JSON.parse(oneBody || "[]")).toEqual([]);

      // 2. Blanket DELETE attempt across the whole table.
      const all = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs?action=eq.security_analytics_export`, {
        method: "DELETE",
        headers: { apikey: ANON, Authorization: `Bearer ${token}`, Prefer: "return=representation" },
      });
      expect([401, 403, 404, 405, 400, 200, 204]).toContain(all.status);
      const allBody = await all.text();
      expect(allBody).not.toContain(TAG);
      if (all.status === 200) expect(JSON.parse(allBody || "[]")).toEqual([]);

      // 3. Same via supabase-js.
      const js = await c.from("audit_logs").delete().in("id", ids).select("id");
      expect(js.error ? true : (js.data ?? []).length === 0).toBe(true);

      // 4. Nothing was removed and the rows are untouched.
      expect(await countRows()).toBe(2);
      const { data: after } = await service
        .from("audit_logs")
        .select("id, action, details")
        .in("id", ids);
      for (const row of after ?? []) {
        expect(row.action).toBe("security_analytics_export");
        expect((row.details as Record<string, unknown>).tag).toBe(TAG);
      }
    } finally {
      await service.from("audit_logs").delete().in("id", ids);
    }
  });
});




