/**
 * Capture populated app screenshots (requires API :4000 + Vite :5173).
 */
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "sales-presentation", "public", "screenshots");
mkdirSync(outDir, { recursive: true });

const ADMIN_EMAIL = "admin@commtrac.local";
const ADMIN_PASSWORD = "Admin123!";

async function dismissOverlays(page: import("@playwright/test").Page) {
  for (let i = 0; i < 4; i++) {
    const skip = page.getByRole("button", { name: /skip for now/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(600);
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(200);
  }
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);
}

async function waitForAppReady(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
}

async function shot(page: import("@playwright/test").Page, filename: string) {
  await waitForAppReady(page);
  await dismissOverlays(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, filename), fullPage: false });
}

test("capture populated presentation screenshots", async ({ page, browser }) => {
  test.setTimeout(360_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  // Dashboard — switch scope to All projects if available
  await page.goto("/");
  await waitForAppReady(page);
  await dismissOverlays(page);
  const viewSelect = page.locator("select, [role='combobox']").filter({ hasText: /project|scope|view/i }).first();
  if (await viewSelect.isVisible().catch(() => false)) {
    await viewSelect.click().catch(() => undefined);
    await page.getByRole("option", { name: /all projects|all/i }).first().click().catch(() => undefined);
    await page.waitForTimeout(1500);
  }
  await shot(page, "desktop-dashboard.png");

  // Projects list with data
  await page.goto("/projects");
  await shot(page, "desktop-projects.png");

  // Project detail
  const projectLink = page.locator("a[href*='/projects/'], tr a, [data-testid*='project']").first();
  await page.goto("/projects");
  await waitForAppReady(page);
  if (await page.locator("table tbody tr, [class*='ProjectList']").first().isVisible().catch(() => false)) {
    await page.locator("table tbody tr").first().click().catch(async () => {
      await page.locator("a[href*='/projects/']").first().click();
    });
    await page.waitForURL(/\/projects\/[^/]+/, { timeout: 10_000 }).catch(() => undefined);
    await shot(page, "desktop-project-detail.png");
  }

  // Assets — select first project in dropdown
  await page.goto("/installations/assets");
  await waitForAppReady(page);
  await dismissOverlays(page);
  const projectFilter = page.locator("label:has-text('Project')").locator("..").locator("select, [role='combobox']").first();
  const altFilter = page.getByRole("combobox").first();
  const filter = (await projectFilter.isVisible().catch(() => false)) ? projectFilter : altFilter;
  if (await filter.isVisible().catch(() => false)) {
    await filter.click();
    await page.waitForTimeout(300);
    const option = page.getByRole("option").nth(1);
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      await page.waitForTimeout(2000);
    }
  }
  await shot(page, "desktop-assets.png");

  // Workflow runner
  const startRun = page.getByRole("button", { name: /start run|continue run|resume run/i }).first();
  if (await startRun.isVisible().catch(() => false)) {
    await startRun.click();
    await page.waitForTimeout(3500);
    await dismissOverlays(page);
    await page.screenshot({ path: join(outDir, "desktop-workflow-runner.png"), fullPage: false });
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  await page.goto("/issues");
  await shot(page, "desktop-issues.png");

  await page.goto("/documents");
  await shot(page, "desktop-documents.png");

  await page.goto("/work-instructions");
  await shot(page, "desktop-work-instructions.png");

  await page.goto("/admin");
  await shot(page, "desktop-admin.png");

  // Mobile
  const mobile = await browser.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto("/login");
  await mobile.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await mobile.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await mobile.getByRole("button", { name: /sign in|log in|login/i }).click();
  await mobile.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await mobile.waitForTimeout(1200);
  await dismissOverlays(mobile);

  await mobile.goto("/");
  await waitForAppReady(mobile);
  await dismissOverlays(mobile);
  await mobile.screenshot({ path: join(outDir, "mobile-dashboard.png"), fullPage: false });

  await mobile.goto("/installations/assets");
  await waitForAppReady(mobile);
  await dismissOverlays(mobile);
  const mFilter = mobile.getByRole("combobox").first();
  if (await mFilter.isVisible().catch(() => false)) {
    await mFilter.click();
    await mobile.getByRole("option").nth(1).click().catch(() => undefined);
    await mobile.waitForTimeout(2000);
  }
  await mobile.screenshot({ path: join(outDir, "mobile-assets.png"), fullPage: false });

  await mobile.goto("/projects");
  await waitForAppReady(mobile);
  await dismissOverlays(mobile);
  await mobile.screenshot({ path: join(outDir, "mobile-projects.png"), fullPage: false });

  await mobile.close();

  // Sanity: dashboard must not be blank login
  expect(await page.title()).not.toMatch(/login/i);
});
