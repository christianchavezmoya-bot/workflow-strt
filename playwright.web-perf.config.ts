import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /web-perf\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
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
      reuseExistingServer: true,
      timeout: 180_000,
      env: { ASPNETCORE_ENVIRONMENT: "Development" },
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
