import { test, expect } from "@playwright/test";

/**
 * Backend-backed smoke: login with seeded admin and reach the authenticated shell.
 * Requires API on :4000 (see playwright.full.config.ts webServer).
 */
test.describe("login flow", () => {
  test("seeded admin can sign in and reach the app shell", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/");

    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Email").fill("admin.dev@stratango.local");
    await page.getByLabel("Password").fill("Admin123!");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator(".app-shell")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /sign in/i })).toHaveCount(0);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join("; ")}`).toHaveLength(0);
  });
});
