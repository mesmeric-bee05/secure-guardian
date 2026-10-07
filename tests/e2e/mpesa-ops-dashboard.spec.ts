// E2E: admin M-PESA Ops view — pending donations, callback ledger, denied attempts.
// Seeds clearly tagged SIMULATED rows with the service role (never presented
// as Safaricom traffic). Audit rows are append-only and are left in place,
// identifiable by details.run_id.
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? "";
const USER_EMAIL = process.env.TEST_USER_EMAIL ?? "";
const USER_PASS = process.env.TEST_USER_PASSWORD ?? "";
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY ?? "";
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "";

const hasSeed = Boolean(SUPABASE_URL && SERVICE && ANON);
const hasAdmin = Boolean((ADMIN_EMAIL && ADMIN_PASS) || (STORAGE_KEY && SESSION_JSON));
const RUN = `ops-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const svc = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

let pendingId = "";
let paidId = "";

async function login(page: Page, email: string, pass: string, injected = false) {
  if (injected) {
    await page.goto("/");
    await page.evaluate(({ k, v }) => window.localStorage.setItem(k, v), { k: STORAGE_KEY, v: SESSION_JSON });
  } else {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(pass);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15_000 });
  }
  await page.goto("/admin");
}

async function openOps(page: Page) {
  await login(page, ADMIN_EMAIL, ADMIN_PASS, !(ADMIN_EMAIL && ADMIN_PASS));
  await page.getByRole("button", { name: /m-pesa ops/i }).first().click();
  await expect(page.getByTestId("mpesa-ops")).toBeVisible();
  await expect(page.getByTestId("ops-refresh").locator(".animate-spin")).toHaveCount(0, { timeout: 15_000 });
}

async function filterDonation(page: Page, id: string) {
  const input = page.getByTestId("ops-donation-id");
  await input.fill(id);
  await input.press("Enter");
  await expect(page.getByTestId("ops-refresh").locator(".animate-spin")).toHaveCount(0, { timeout: 15_000 });
}

test.describe("M-PESA Ops dashboard", () => {
  test.skip(!hasSeed || !hasAdmin, "requires SUPABASE_SERVICE_ROLE_KEY + admin credentials");

  test.beforeAll(async () => {
    const c = svc();
    const { data: dons, error } = await c.from("donations").insert([
      { amount_kes: 50, phone_msisdn: "254700000001", status: "pending", checkout_request_id: `${RUN}-pending` },
      { amount_kes: 100, phone_msisdn: "254700000002", status: "success", checkout_request_id: `${RUN}-paid`, mpesa_receipt: `${RUN}R1` },
    ]).select("id, checkout_request_id");
    if (error || !dons) throw new Error(`seed donations: ${error?.message}`);
    pendingId = dons.find((d) => d.checkout_request_id.endsWith("pending"))!.id;
    paidId = dons.find((d) => d.checkout_request_id.endsWith("paid"))!.id;

    const led = await c.from("mpesa_callback_events").insert({
      checkout_request_id: `${RUN}-paid`, reference_id: `${RUN}R1`, donation_id: paidId, result_code: 0, status: "success",
    });
    if (led.error) throw new Error(`seed ledger: ${led.error.message}`);
    // Replaying the same reference must be refused by the unique constraint.
    const dup = await c.from("mpesa_callback_events").insert({
      checkout_request_id: `${RUN}-paid`, reference_id: `${RUN}R1`, donation_id: paidId, result_code: 0, status: "success",
    });
    expect(dup.error?.code).toBe("23505");

    const aud = await c.from("audit_logs").insert([
      { action: "mpesa_callback_rejected", resource_type: "donations", resource_id: paidId, details: { reason: "duplicate_reference", simulated: true, run_id: RUN } },
      { action: "mpesa_callback_rejected", resource_type: "donations", resource_id: paidId, details: { reason: "amount_mismatch", simulated: true, run_id: RUN } },
    ]);
    if (aud.error) throw new Error(`seed audit: ${aud.error.message}`);
  });

  test.afterAll(async () => {
    const c = svc();
    await c.from("mpesa_callback_events").delete().like("checkout_request_id", `${RUN}%`);
    await c.from("donations").delete().like("checkout_request_id", `${RUN}%`);
  });

  test("pending donation appears and donation filter narrows rows", async ({ page }) => {
    await openOps(page);
    await filterDonation(page, pendingId);
    await expect(page.locator(`[data-testid="ops-pending-row"][data-donation-id="${pendingId}"]`)).toHaveCount(1);
    await expect(page.getByTestId("ops-pending-row")).toHaveCount(1);
    await expect(page.getByTestId("ops-count-pending")).toHaveText("1");
    await expect(page.getByTestId("ops-ledger-empty")).toBeVisible();
  });

  test("ledger success, duplicate denial and cards agree", async ({ page }) => {
    await openOps(page);
    await filterDonation(page, paidId);
    await expect(page.locator(`[data-testid="ops-ledger-row"][data-reference="${RUN}R1"]`)).toHaveCount(1);
    await expect(page.getByTestId("ops-denial-row")).toHaveCount(2);
    await expect(page.getByTestId("ops-count-denied")).toHaveText("2");
    await expect(page.getByTestId("ops-count-duplicate")).toHaveText("1");
    await expect(page.getByTestId("simulated-badge")).toHaveCount(2);
  });

  test("reason filter narrows denied attempts", async ({ page }) => {
    await openOps(page);
    await filterDonation(page, paidId);
    await page.getByTestId("ops-reason").click();
    await page.getByRole("option", { name: /amount/i }).click();
    await expect(page.locator('[data-testid="ops-denial-row"][data-reason="amount_mismatch"]')).toHaveCount(1);
    await expect(page.getByTestId("ops-denial-row")).toHaveCount(1);
  });

  test("success card counts ledger rows with status success", async () => {
    const { count } = await svc().from("mpesa_callback_events").select("id", { count: "exact", head: true })
      .eq("status", "success").like("checkout_request_id", `${RUN}%`);
    expect(count).toBe(1);
  });
});

test.describe("M-PESA Ops — non-admin", () => {
  test.skip(!(SUPABASE_URL && ANON && USER_EMAIL && USER_PASS), "requires TEST_USER_EMAIL/TEST_USER_PASSWORD");

  test("non-admin cannot read the callback ledger", async () => {
    const c = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: USER_EMAIL, password: USER_PASS });
    expect(error).toBeNull();
    const { data } = await c.from("mpesa_callback_events").select("id").limit(5);
    expect(data ?? []).toHaveLength(0);
  });
});
