import { defineConfig, devices } from "@playwright/test";

/**
 * Full e2e: boots the API (fresh temp DB per run) and Vite dev server.
 * Use for login → authenticated shell flows. Keep playwright.config.ts
 * backend-independent for fast CI smoke.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /(login-flow|work-instructions-builder-nav)\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "dotnet run --no-launch-profile --urls http://0.0.0.0:4000",
      cwd: "server/Commtrac.Api",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ASPNETCORE_ENVIRONMENT: "Development",
      },
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
