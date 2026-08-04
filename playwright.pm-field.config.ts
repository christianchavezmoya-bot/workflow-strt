import { defineConfig, devices } from "@playwright/test";

/**
 * PM field smoke — login, JO00991 capture table edits, issue resolve.
 * Requires API on :4000 with field data (JO00991, CAD-0039, CC-0012).
 * Seed dev DB first: sqlite3 server/Commtrac.Api/commtrac.db < scripts/seed-pm-smoke-data.sql
 *
 * Env:
 *   PM_SMOKE_EMAIL    (default jose.lopez@strataworldwide.com)
 *   PM_SMOKE_PASSWORD (default from test plan)
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /pm-field-smoke\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  reporter: [["list"], ["json", { outputFile: "e2e-results/pm-field-smoke.json" }]],
  use: {
    baseURL: process.env.PM_SMOKE_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "dotnet run --no-launch-profile --urls http://0.0.0.0:4000",
      cwd: "server/Commtrac.Api",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { ASPNETCORE_ENVIRONMENT: "Development" },
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
