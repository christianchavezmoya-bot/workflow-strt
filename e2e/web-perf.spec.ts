import { test, expect } from "@playwright/test";

/**
 * Web perf smoke — measures login + assets navigation and logs API waterfall.
 * Requires API on :4000 (playwright.full.config.ts).
 */
test.describe("web perf smoke", () => {
  test("login and assets page load metrics", async ({ page }) => {
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
    await page.getByLabel("Email").fill("admin@commtrac.local");
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
    console.log(
      JSON.stringify(
        {
          loginMs,
          assetsContentMs,
          totalApiCalls: apiCalls.length,
          slowestApi: slowest,
        },
        null,
        2,
      ),
    );

    expect(loginMs).toBeLessThan(20_000);
    expect(assetsContentMs).toBeLessThan(20_000);
  });
});
