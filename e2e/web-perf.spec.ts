import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Web perf smoke — measures login + assets navigation and logs API waterfall.
 * Requires API on :4000 (playwright.web-perf.config.ts).
 *
 * Strict mode (CI): WEB_PERF_STRICT=1 enforces assets content budget.
 * Override budget: WEB_PERF_ASSETS_MS_MAX (default 2000 in strict, 20000 in report-only).
 *
 * Also writes e2e-results/web-perf-report.json so scripts/perf-baseline.mjs can
 * compare a run against recorded numbers. Budgets are ceilings and cannot detect
 * "slower but still passing"; the recorded values can.
 */
test.describe("web perf smoke", () => {
  test("login and assets page load metrics", async ({ page }) => {
    const strict = process.env.WEB_PERF_STRICT === "1";
    const assetsBudgetMs = strict
      ? Number(process.env.WEB_PERF_ASSETS_MS_MAX ?? "2000")
      : 20_000;
    const loginBudgetMs = strict
      ? Number(process.env.WEB_PERF_LOGIN_MS_MAX ?? "8000")
      : 20_000;

    const apiCalls: Array<{ path: string; status: number; ms: number }> = [];

    page.on("response", (res) => {
      const url = res.url();
      if (!url.includes("/api/")) return;
      try {
        const path = new URL(url).pathname.replace("/api", "");
        const timing = res.request().timing();
        apiCalls.push({
          path,
          status: res.status(),
          ms: Math.round(timing.responseEnd - timing.requestStart),
        });
      } catch {
        /* ignore */
      }
    });

    const loginStart = Date.now();
    await page.goto("/");
    await page.getByLabel("Email").fill("admin.dev@stratango.local");
    await page.getByLabel("Password").fill("Admin123!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.locator(".app-shell")).toBeVisible({ timeout: 30_000 });
    const loginMs = Date.now() - loginStart;

    const assetsStart = Date.now();
    await page.goto("/installations/assets");
    await expect(page.locator(".app-content")).toBeVisible({ timeout: 30_000 });

    await page.waitForFunction(
      () => {
        const spinner = document.querySelector(".MuiCircularProgress-root");
        const alert = document.querySelector(".MuiAlert-root");
        const table = document.querySelector("table");
        const cards = document.querySelectorAll(".glass-card");
        return Boolean(alert || table || cards.length > 0 || !spinner);
      },
      undefined,
      { timeout: 30_000 },
    ).catch(() => {});

    const assetsContentMs = Date.now() - assetsStart;

    const slowest = [...apiCalls].sort((a, b) => b.ms - a.ms).slice(0, 12);
    const report = {
      runAt: new Date().toISOString(),
      loginMs,
      assetsContentMs,
      assetsBudgetMs,
      loginBudgetMs,
      strict,
      totalApiCalls: apiCalls.length,
      slowestApi: slowest,
    };

    console.log(JSON.stringify(report, null, 2));

    const dir = path.join(process.cwd(), "e2e-results");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "web-perf-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    expect(loginMs).toBeLessThan(loginBudgetMs);
    expect(assetsContentMs).toBeLessThan(assetsBudgetMs);
  });
});
