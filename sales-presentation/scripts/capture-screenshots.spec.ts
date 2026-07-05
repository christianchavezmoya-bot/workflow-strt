/**
 * Capture real app screenshots for the sales presentation.
 */
import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "sales-presentation", "public", "screenshots");
mkdirSync(outDir, { recursive: true });

const ADMIN_EMAIL = "admin@commtrac.local";
const ADMIN_PASSWORD = "Admin123!";

async function dismissOverlays(page: import("@playwright/test").Page) {
  for (let i = 0; i < 3; i++) {
    const skip = page.getByRole("button", { name: /skip for now/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(800);
    }
    const close = page.getByRole("button", { name: /close|dismiss|got it|not now/i }).first();
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await page.waitForTimeout(500);
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
}

async function shot(page: import("@playwright/test").Page, path: string, url: string) {
  await page.goto(url);
  await page.waitForTimeout(2200);
  await dismissOverlays(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, path), fullPage: false });
}

test("capture presentation screenshots", async ({ page, browser }) => {
  test.setTimeout(300_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await shot(page, "desktop-dashboard.png", "/");
  await shot(page, "desktop-projects.png", "/projects");
  await shot(page, "desktop-assets.png", "/installations/assets");
  await shot(page, "desktop-issues.png", "/issues");
  await shot(page, "desktop-documents.png", "/documents");
  await shot(page, "desktop-admin.png", "/admin");
  await shot(page, "desktop-work-instructions.png", "/work-instructions");

  // Workflow runner
  await page.goto("/installations/assets");
  await page.waitForTimeout(2500);
  await dismissOverlays(page);
  const startRun = page.getByRole("button", { name: /start run|continue run|resume run/i }).first();
  if (await startRun.isVisible().catch(() => false)) {
    await startRun.click();
    await page.waitForTimeout(3000);
    await dismissOverlays(page);
    await page.screenshot({ path: join(outDir, "desktop-workflow-runner.png"), fullPage: false });
    await page.keyboard.press("Escape").catch(() => undefined);
  } else {
    await page.goto("/");
    await dismissOverlays(page);
    const dashRun = page.getByRole("button", { name: /start run|continue run|resume run/i }).first();
    if (await dashRun.isVisible().catch(() => false)) {
      await dashRun.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: join(outDir, "desktop-workflow-runner.png"), fullPage: false });
    }
  }

  const mobile = await browser.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto("/login");
  await mobile.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await mobile.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await mobile.getByRole("button", { name: /sign in|log in|login/i }).click();
  await mobile.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await mobile.waitForTimeout(1200);
  await dismissOverlays(mobile);

  await shot(mobile, "mobile-dashboard.png", "/");
  await shot(mobile, "mobile-assets.png", "/installations/assets");
  await shot(mobile, "mobile-projects.png", "/projects");
  await shot(mobile, "mobile-issues.png", "/issues");

  await mobile.close();
});
