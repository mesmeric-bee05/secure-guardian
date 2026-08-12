import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  outputDir: "test-results-e2e",
  reporter: [["list"], ["html", { outputFolder: "playwright-report-e2e", open: "never" }]],
  use: {
    baseURL: "http://localhost:8080",
    // Always capture debugging evidence — including for passing runs and runs
    // that end early — so CI artifacts are never empty when triaging.
    trace: "on",
    screenshot: "on",
    video: "on",
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
