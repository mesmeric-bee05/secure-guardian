import { test, expect } from "@playwright/test";

test.describe("/support page smoke", () => {
  test("renders localized head + JSON-LD DonateAction", async ({ page }) => {
    await page.goto("/support");
    await expect(page).toHaveTitle(/Support|Saidia/i);

    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc && desc.length).toBeGreaterThan(20);

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
    expect(ogTitle).toBeTruthy();

    const ldJson = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(ldJson).toBeTruthy();
    expect(ldJson!).toMatch(/DonateAction|NGO/);
  });

  test("donation preset buttons render", async ({ page }) => {
    await page.goto("/support");
    // At least one preset amount button is visible
    const anyPreset = page.getByRole("button", { name: /100|500|1000|KES|KSh/i }).first();
    await expect(anyPreset).toBeVisible({ timeout: 10_000 });
  });
});
