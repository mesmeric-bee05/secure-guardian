# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ai-chat.spec.ts >> AI chat >> a failed request shows a clear error message
- Location: tests/e2e/ai-chat.spec.ts:35:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img [ref=e8]
      - heading "MediReach+" [level=3] [ref=e10]
      - paragraph [ref=e11]: Your AI-powered health companion
    - generic [ref=e12]:
      - generic [ref=e13]:
        - tablist [ref=e14]:
          - tab "Log In" [selected] [ref=e15] [cursor=pointer]
          - tab "Sign Up" [ref=e16] [cursor=pointer]
        - tabpanel "Log In" [ref=e17]:
          - generic [ref=e18]:
            - generic [ref=e19]:
              - text: Email
              - textbox "Email" [ref=e20]: e2e-admin@medireach.test
            - generic [ref=e21]:
              - text: Password
              - textbox "Password" [ref=e22]: hEvVFU_RO7Gk2f6PbDuF4CfW!a9
            - button "Log In" [ref=e23] [cursor=pointer]
      - generic [ref=e24]:
        - img [ref=e25]
        - generic [ref=e27]: Your data is secure and encrypted
```

# Test source

```ts
  1  | // E2E: AI chat returns a real streamed answer, and failures surface a clear message.
  2  | import { test, expect, type Page } from "@playwright/test";
  3  | 
  4  | const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
  5  | const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? "";
  6  | 
  7  | async function openChat(page: Page) {
  8  |   await page.goto("/auth");
  9  |   await page.locator("#login-email").fill(ADMIN_EMAIL);
  10 |   await page.locator("#login-password").fill(ADMIN_PASS);
  11 |   await page.locator("form").filter({ has: page.locator("#login-email") }).getByRole("button").click();
> 12 |   await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15_000 });
     |              ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  13 |   await page.goto("/chat");
  14 | }
  15 | 
  16 | async function ask(page: Page, text: string) {
  17 |   const box = page.locator("form textarea, form input[type=text]").last();
  18 |   await box.fill(text);
  19 |   await page.locator('form button[type="submit"]').last().click();
  20 | }
  21 | 
  22 | test.describe("AI chat", () => {
  23 |   test.skip(!(ADMIN_EMAIL && ADMIN_PASS), "requires TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD");
  24 | 
  25 |   test("a real question gets a streamed answer", async ({ page }) => {
  26 |     await openChat(page);
  27 |     const resp = page.waitForResponse((r) => r.url().includes("/functions/v1/ai-chat"), { timeout: 60_000 });
  28 |     await ask(page, "What is the first aid for a minor burn?");
  29 |     const r = await resp;
  30 |     expect(r.status()).toBe(200);
  31 |     await expect(page.getByText(/water|cool/i).first()).toBeVisible({ timeout: 60_000 });
  32 |     await expect(page.getByText(/sorry, there was an error|try again/i)).toHaveCount(0);
  33 |   });
  34 | 
  35 |   test("a failed request shows a clear error message", async ({ page }) => {
  36 |     await openChat(page);
  37 |     await page.route("**/functions/v1/ai-chat", (route) =>
  38 |       route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Rate limit exceeded" }) }));
  39 |     await ask(page, "Hello");
  40 |     await expect(page.getByText(/rate limit|too many|busy/i).first()).toBeVisible({ timeout: 20_000 });
  41 |   });
  42 | });
  43 | 
```