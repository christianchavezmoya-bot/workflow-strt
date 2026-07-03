import { defineConfig, devices } from "@playwright/test";

/**
 * Walkthrough / visual config — records a video per test and drives BOTH a
 * desktop and a mobile viewport against the running dev server (:5173) with the
 * real API (:4000). Kept separate from the CI smoke config (playwright.config.ts).
 *
 * Run: npx playwright test --config playwright.walkthrough.config.ts
 */
export default defineConfig({
  testDir: "./e2e-walkthrough",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"], ["html", { outputFolder: "walkthrough-report", open: "never" }]],
  outputDir: "walkthrough-artifacts",
  use: {
    baseURL: "http://localhost:5173",
    video: "on",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
