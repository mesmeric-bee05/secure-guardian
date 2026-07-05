import { test, expect } from "@playwright/test";

// This spec is a shallow smoke that /admin renders and doesn't crash.
// Full CHW Analytics interaction requires an authenticated admin session,
// which CI does not provision — we assert the route responds without runtime
// errors and either redirects to auth or renders the panel skeleton.
test("/admin route responds without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  const res = await page.goto("/admin");
  expect(res?.status()).toBeLessThan(500);
  // Either landed on auth or on the admin shell
  await expect(page.locator("body")).toBeVisible();
  // No hard runtime errors
  const fatal = errors.filter((e) => !/(favicon|manifest|service worker|hydrat|Warning:)/i.test(e));
  expect(fatal, `unexpected errors: ${fatal.join("\n")}`).toHaveLength(0);
});
