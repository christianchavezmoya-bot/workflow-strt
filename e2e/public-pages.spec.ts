import { test, expect, type Page } from "@playwright/test";

// Public App Store pages: /support and /privacy must load directly in a fresh,
// unauthenticated browser context (Playwright gives each test empty storage),
// survive a refresh, never bounce to /login, and work at phone/tablet widths.
// Backend-independent: the pages are static and make no API calls.

const PAGES = [
  { path: "/support", h1: /Strata N-go Support/i },
  { path: "/privacy", h1: /Privacy Policy/i },
] as const;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "iPad", width: 820, height: 1180 },
  { name: "iPhone", width: 390, height: 844 },
] as const;

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}

for (const { path, h1 } of PAGES) {
  test.describe(`${path} (unauthenticated)`, () => {
    test("loads directly, stays on its URL, and survives a refresh", async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible({ timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe(path);

      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible({ timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe(path);
    });

    test("also works with a trailing slash and different casing", async ({ page }) => {
      for (const variant of [`${path}/`, path.toUpperCase()]) {
        await page.goto(variant);
        await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible({ timeout: 15_000 });
        expect(new URL(page.url()).pathname.toLowerCase()).not.toContain("login");
      }
    });

    for (const vp of VIEWPORTS) {
      test(`is usable at ${vp.name} width (${vp.width}px)`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("link", { name: "support@strata-ngo.com" }).first()).toBeVisible();
        await expectNoHorizontalScroll(page);
      });
    }

    test("shows no dev/staging/debug identifiers", async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible({ timeout: 15_000 });
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(/\b(dev|staging|debug|localhost)\b/i);
    });
  });
}

test.describe("existing routes are unaffected", () => {
  test("unknown paths still land on the sign-in screen, not a public page", async ({ page }) => {
    await page.goto("/definitely-not-a-page");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: /Support|Privacy Policy/i })).toHaveCount(0);
  });

  test("/login still shows the sign-in screen", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible({ timeout: 15_000 });
  });

  test("/reset-password still renders its own page, not the sign-in gate", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { level: 1, name: /Support|Privacy Policy/i })).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/reset-password");
  });

  test("/share/reports/:id still renders the share-link page", async ({ page }) => {
    await page.goto("/share/reports/does-not-exist");
    expect(new URL(page.url()).pathname).toBe("/share/reports/does-not-exist");
    await expect(page.getByText(/not found or has expired/i)).toBeVisible({ timeout: 15_000 });
  });
});
