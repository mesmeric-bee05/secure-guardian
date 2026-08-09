// E2E: SecurityAnalyticsTab filter aggregation + CSV export.
// Requires TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD (or a preinjected
// LOVABLE_BROWSER_SUPABASE_SESSION_JSON) and SUPABASE_SERVICE_ROLE_KEY
// to seed rows. Skips gracefully when creds are absent so forks/CI without
// secrets stay green.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? "";
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY ?? "";
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "";

const hasSeedCreds = SUPABASE_URL && SERVICE && ANON;
const hasAdmin = (ADMIN_EMAIL && ADMIN_PASS) || (STORAGE_KEY && SESSION_JSON);

const TAG = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const NOW = new Date();
const FROM = new Date(NOW.getTime() - 60 * 60 * 1000);

test.describe("Security Analytics — filters + CSV", () => {
  test.skip(!hasSeedCreds || !hasAdmin, "requires SUPABASE_SERVICE_ROLE_KEY + admin credentials");

  test.beforeAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => ({
        event_type: "rate_limit_429",
        scope: "ussd-donate",
        ip_address: "10.0.0.1",
        severity: "info",
        details: { menu_path: "5*100", phone_hash: `${TAG}-donate-${i}`.padEnd(64, "0") },
        created_at: new Date(FROM.getTime() + i * 60_000).toISOString(),
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        event_type: "validation_failed",
        scope: "ussd-schema",
        ip_address: "10.0.0.2",
        severity: "info",
        details: { menu_path: "", phone_hash: `${TAG}-val-${i}`.padEnd(64, "0") },
        created_at: new Date(FROM.getTime() + (i + 3) * 60_000).toISOString(),
      })),
      {
        event_type: "auth_failed",
        scope: "ai-chat",
        ip_address: "10.0.0.3",
        severity: "info",
        details: { reason: "missing_sub", tag: TAG },
        created_at: new Date(FROM.getTime() + 5 * 60_000).toISOString(),
      },
    ];
    const { error } = await admin.from("security_events").insert(rows);
    if (error) throw new Error(`seed failed: ${error.message}`);
  });

  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await admin
      .from("security_events")
      .delete()
      .or(`details->>tag.eq.${TAG},details->>phone_hash.ilike.${TAG}%`);
  });

  async function login(page: import("@playwright/test").Page) {
    if (STORAGE_KEY && SESSION_JSON) {
      await page.goto("/");
      await page.evaluate(
        ({ k, v }) => window.localStorage.setItem(k, v),
        { k: STORAGE_KEY, v: SESSION_JSON },
      );
    } else {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
      await page.getByLabel(/password/i).fill(ADMIN_PASS);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/\/(index|dashboard|admin|)$/i, { timeout: 15_000 });
    }
    await page.goto("/admin");
    // Open the Security Analytics tab (label may be "Sec Analytics" on mobile tabs).
    const tab = page.getByRole("button", { name: /security\s*analytics/i }).first();
    await tab.click();
    await expect(page.getByRole("heading", { name: /security analytics/i })).toBeVisible();
  }

  function fromDateStr() { return FROM.toISOString().slice(0, 10); }
  function toDateStr() { return NOW.toISOString().slice(0, 10); }

  // The user id of the admin identity `login()` uses — needed to assert the
  // audit row was attributed to the right actor.
  async function adminUserId(): Promise<string> {
    if (STORAGE_KEY && SESSION_JSON) {
      const s = JSON.parse(SESSION_JSON) as { user?: { id?: string } };
      if (s.user?.id) return s.user.id;
    }
    const c = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await c.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
    if (error || !data.user) throw new Error(`admin sign-in failed: ${error?.message}`);
    return data.user.id;
  }

  // Numeric row count rendered in the header badge ("N rows...").
  async function uiRowCount(page: import("@playwright/test").Page): Promise<number> {
    const txt = (await page.getByTestId("sec-row-count").innerText()).trim();
    const m = txt.match(/^(\d+)\s+rows/);
    if (!m) throw new Error(`could not parse row count from "${txt}"`);
    return Number(m[1]);
  }

  // Read a download's bytes AND persist it under the Playwright output dir so
  // CI can upload the exact exported file as a debugging artifact.
  async function readDownload(
    download: import("@playwright/test").Download,
    testInfo: import("@playwright/test").TestInfo,
    label: string,
  ): Promise<string> {
    const target = testInfo.outputPath(`downloads/${label}.csv`);
    await download.saveAs(target);
    return readFileSync(target, "utf8");
  }

  const HEADER = "bucket,event_type,count";

  // Validate CSV header columns + per-row field formats for a given bucket.
  function assertCsvShape(csv: string, bucket: "day" | "hour", expectedRows?: number) {
    expect(csv.charCodeAt(0)).not.toBe(0xfeff); // no BOM
    expect(csv).not.toMatch(/\n\s*\n/); // no blank lines
    const lines = csv.replace(/\r\n/g, "\n").trim().split("\n");
    expect(lines[0]).toBe(HEADER);
    const body = lines.slice(1);
    if (typeof expectedRows === "number") expect(body.length).toBe(expectedRows);

    const bucketRe = bucket === "day"
      ? /^\d{4}-\d{2}-\d{2}$/
      : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:00(:00)?/;
    const fromMs = new Date(`${fromDateStr()}T00:00:00.000Z`).getTime();
    const toMs = new Date(`${toDateStr()}T23:59:59.999Z`).getTime();

    for (const line of body) {
      const fields = line.split(",");
      expect(fields, `row must have exactly 3 fields: "${line}"`).toHaveLength(3);
      const [bucketVal, evt, cnt] = fields;
      expect(bucketVal, `bucket field format for ${bucket}: "${bucketVal}"`).toMatch(bucketRe);
      const parsed = new Date(bucketVal.replace(" ", "T"));
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      expect(parsed.getTime()).toBeGreaterThanOrEqual(fromMs - 24 * 60 * 60 * 1000);
      expect(parsed.getTime()).toBeLessThanOrEqual(toMs);
      expect(evt).toMatch(/^[a-z0-9_]+$/);
      expect(cnt).toMatch(/^\d+$/);
      expect(Number(cnt)).toBeGreaterThanOrEqual(1);
    }
  }




  test("filters by event_type + menu_path aggregate to the right count", async ({ page }) => {
    await login(page);
    await page.getByTestId("sec-filter-from").fill(fromDateStr());
    await page.getByTestId("sec-filter-to").fill(toDateStr());
    // event_type = rate_limit_429
    await page.getByTestId("sec-filter-event-type").click();
    await page.getByRole("option", { name: "rate_limit_429" }).click();
    await page.getByTestId("sec-filter-menu-path").fill("donate");
    await page.getByTestId("sec-refresh").click();
    await expect(page.getByTestId("sec-row-count")).toContainText(/^3 rows/);

    // Clear filters — all 6 seed rows back.
    await page.getByTestId("sec-filter-event-type").click();
    await page.getByRole("option", { name: /all event types/i }).click();
    await page.getByTestId("sec-filter-menu-path").fill("");
    await page.getByTestId("sec-refresh").click();
    await expect(page.getByTestId("sec-row-count")).toContainText(/(6|[7-9]|\d{2,}) rows/);
  });

  test("CSV export contents reflect active filters", async ({ page }) => {
    await login(page);
    await page.getByTestId("sec-filter-from").fill(fromDateStr());
    await page.getByTestId("sec-filter-to").fill(toDateStr());
    await page.getByTestId("sec-filter-event-type").click();
    await page.getByRole("option", { name: "rate_limit_429" }).click();
    await page.getByTestId("sec-filter-menu-path").fill("donate");
    await page.getByTestId("sec-refresh").click();
    await expect(page.getByTestId("sec-row-count")).toContainText(/^3 rows/);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("sec-export-csv").click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(c as Buffer);
    const csv = Buffer.concat(chunks).toString("utf8").trim();
    const [header, ...body] = csv.split("\n");
    expect(header).toBe("bucket,event_type,count");
    expect(body.length).toBeGreaterThan(0);
    let total = 0;
    for (const line of body) {
      const [, evt, cnt] = line.split(",");
      expect(evt).toBe("rate_limit_429");
      total += Number(cnt);
    }
    expect(total).toBe(3);
    expect(csv).not.toContain("validation_failed");
    expect(csv).not.toContain("auth_failed");
  });



  test("no-match filter shows zero rows and exports a header-only CSV", async ({ page }) => {
    await login(page);
    await page.getByTestId("sec-filter-from").fill(fromDateStr());
    await page.getByTestId("sec-filter-to").fill(toDateStr());
    await page.getByTestId("sec-filter-menu-path").fill(`no-such-path-${TAG}`);
    await page.getByTestId("sec-refresh").click();
    await expect(page.getByTestId("sec-row-count")).toContainText(/^0 rows/);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("sec-export-csv").click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(c as Buffer);
    const csv = Buffer.concat(chunks).toString("utf8").trim();
    expect(csv).toBe("bucket,event_type,count");
  });

  for (const bucket of ["day", "hour"] as const) {
    test(`admin CSV export (${bucket} bucket) writes an audit_logs entry matching the export`, async ({ page }) => {
      const admin = createClient(SUPABASE_URL, SERVICE, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const expectedUserId = await adminUserId();
      const since = new Date().toISOString();

      await login(page);
      await page.getByTestId("sec-filter-from").fill(fromDateStr());
      await page.getByTestId("sec-filter-to").fill(toDateStr());
      // Bucket select is the only one without a testid; pick it by current value.
      await page.getByRole("combobox").filter({ hasText: /^(Hour|Day)$/ }).click();
      await page.getByRole("option", { name: bucket === "day" ? "Day" : "Hour" }).click();
      await page.getByTestId("sec-refresh").click();
      await expect(page.getByTestId("sec-row-count")).not.toContainText(/^0 rows/);
      const expectedRows = await uiRowCount(page);

      await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("sec-export-csv").click(),
      ]);

      // Poll for the audit row (RPC write is fire-and-forget).
      type AuditRow = {
        action: string;
        user_id: string | null;
        resource_type: string | null;
        details: Record<string, unknown>;
      };
      let row: AuditRow | undefined;
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && !row) {
        const { data } = await admin
          .from("audit_logs")
          .select("action, user_id, resource_type, details, created_at")
          .eq("action", "security_analytics_export")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1);
        row = (data ?? [])[0] as AuditRow | undefined;
        if (!row) await new Promise((r) => setTimeout(r, 500));
      }
      expect(row, "expected a security_analytics_export audit entry").toBeTruthy();
      expect(row!.action).toBe("security_analytics_export");
      expect(row!.resource_type).toBe("security_events");
      expect(row!.user_id).toBe(expectedUserId);
      expect(row!.details).toMatchObject({
        from: fromDateStr(),
        to: toDateStr(),
        granularity: bucket,
        rows: expectedRows,
      });

      // And the UI reflects the trail, including the same row count.
      await expect(page.getByTestId("sec-last-audit")).toContainText(/Last export: security_analytics_export/);
      await expect(page.getByTestId("sec-last-audit")).toContainText(`${expectedRows} rows`);
    });
  }
});


