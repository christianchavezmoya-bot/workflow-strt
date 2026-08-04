import { defineConfig, devices } from "@playwright/test";

// e2e config. Boots the Vite dev server and drives it with headless Chromium.
// The smoke spec only needs the frontend; deeper flows (login → project →
// workflow run) additionally need the API on :4000 (see references/testing.md).
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/smoke.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
