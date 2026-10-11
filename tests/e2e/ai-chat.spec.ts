// E2E: AI chat returns a real streamed answer, and failures surface a clear message.
import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? "";

async function openChat(page: Page) {
  await page.goto("/auth");
  await page.locator("#login-email").fill(ADMIN_EMAIL);
  await page.locator("#login-password").fill(ADMIN_PASS);
  await page.locator("form").filter({ has: page.locator("#login-email") }).getByRole("button").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15_000 });
  await page.goto("/chat");
}

async function ask(page: Page, text: string) {
  const box = page.locator("form textarea, form input[type=text]").last();
  await box.fill(text);
  await page.locator('form button[type="submit"]').last().click();
}

test.describe("AI chat", () => {
  test.skip(!(ADMIN_EMAIL && ADMIN_PASS), "requires TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD");

  test("a real question gets a streamed answer", async ({ page }) => {
    await openChat(page);
    const resp = page.waitForResponse((r) => r.url().includes("/functions/v1/ai-chat"), { timeout: 60_000 });
    await ask(page, "What is the first aid for a minor burn?");
    const r = await resp;
    expect(r.status()).toBe(200);
    await expect(page.getByText(/water|cool/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/sorry, there was an error|try again/i)).toHaveCount(0);
  });

  test("a failed request shows a clear error message", async ({ page }) => {
    await openChat(page);
    await page.route("**/functions/v1/ai-chat", (route) =>
      route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Rate limit exceeded" }) }));
    await ask(page, "Hello");
    await expect(page.getByText(/rate limit|too many|busy/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
