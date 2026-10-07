// E2E: Audit Logs M-PESA filters (action, rejection reason, donation ID, empty state)
// against SIMULATED, run-tagged rejection rows. Audit rows are append-only.
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? "";
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY ?? "";
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "";
const hasEnv = Boolean(SUPABASE_URL && SERVICE && ((ADMIN_EMAIL && ADMIN_PASS) || (STORAGE_KEY && SESSION_JSON)));

const RUN = `audit-${Date.now().toString(36)}`;
const DON_A = randomUUID();
const DON_B = randomUUID();

async function open(page: Page) {
  if (ADMIN_EMAIL && ADMIN_PASS) {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASS);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15_000 });
  } else {
    await page.goto("/");
    await page.evaluate(({ k, v }) => window.localStorage.setItem(k, v), { k: STORAGE_KEY, v: SESSION_JSON });
  }
  await page.goto("/admin");
  await page.getByRole("button", { name: /audit logs/i }).first().click();
}

async function byDonation(page: Page, id: string) {
  const i = page.getByTestId("audit-donation-filter");
  await i.fill(id);
  await i.press("Enter");
}

test.describe("Audit Logs — M-PESA filters", () => {
  test.skip(!hasEnv, "requires SUPABASE_SERVICE_ROLE_KEY + admin credentials");

  test.beforeAll(async () => {
    const c = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const rows = [
      { resource_id: DON_A, reason: "duplicate_reference" },
      { resource_id: DON_A, reason: "amount_mismatch" },
      { resource_id: DON_B, reason: "invalid_token" },
    ].map((r) => ({
      action: "mpesa_callback_rejected", resource_type: "donations", resource_id: r.resource_id,
      details: { reason: r.reason, simulated: true, run_id: RUN },
    }));
    const { error } = await c.from("audit_logs").insert(rows);
    if (error) throw new Error(`seed: ${error.message}`);
  });

  test("donation ID filter returns only that donation's rejections", async ({ page }) => {
    await open(page);
    await byDonation(page, DON_A);
    await expect(page.getByTestId("audit-row")).toHaveCount(2, { timeout: 15_000 });
  });

  test("reason + donation filters combine", async ({ page }) => {
    await open(page);
    await byDonation(page, DON_A);
    await page.getByTestId("audit-reason-filter").click();
    await page.getByRole("option", { name: /amount/i }).click();
    await expect(page.getByTestId("audit-row")).toHaveCount(1, { timeout: 15_000 });
  });

  test("unknown donation shows empty state", async ({ page }) => {
    await open(page);
    await byDonation(page, randomUUID());
    await expect(page.getByTestId("audit-empty")).toBeVisible({ timeout: 15_000 });
  });
});
