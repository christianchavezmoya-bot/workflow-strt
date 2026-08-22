import { defineConfig } from "@playwright/test";

/**
 * Workflow consistency smoke — API-level server truth checks.
 * Seed dev DB first: node scripts/seed-workflow-smoke-data.mjs
 *
 * Env:
 *   WC_SMOKE_API      (default http://localhost:4000/api)
 *   WC_SMOKE_EMAIL    (default admin@commtrac.local)
 *   WC_SMOKE_PASSWORD (default Admin123!)
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /workflow-consistency-smoke\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: "e2e-results/workflow-consistency-smoke.json" }]],
  use: {
    baseURL: process.env.WC_SMOKE_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "api", use: {} }],
  webServer: {
    command: "dotnet run --no-launch-profile --urls http://0.0.0.0:4000",
    cwd: "server/Commtrac.Api",
    url: "http://localhost:4000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { ASPNETCORE_ENVIRONMENT: "Development" },
  },
});
