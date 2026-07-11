// E2E: SecurityAnalyticsTab filter aggregation + CSV export.
// Requires TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD (or a preinjected
// LOVABLE_BROWSER_SUPABASE_SESSION_JSON) and SUPABASE_SERVICE_ROLE_KEY
// to seed rows. Skips gracefully when creds are absent so forks/CI without
// secrets stay green.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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
});
