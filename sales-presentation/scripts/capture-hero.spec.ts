/**
 * v5 hero/full-view screenshots — full main.app-content (no element crops).
 * Requires API :4000 + Vite :5173 + seeded workflow (scripts/seed-workflow.mjs).
 * Output: public/screenshots/hero/*.png  and  public/screenshots/mobile/*.png
 */
import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const heroDir = join(process.cwd(), "sales-presentation", "public", "screenshots", "hero");
const mobileDir = join(process.cwd(), "sales-presentation", "public", "screenshots", "mobile");
mkdirSync(heroDir, { recursive: true });
mkdirSync(mobileDir, { recursive: true });

const ADMIN = { email: "admin@commtrac.local", password: "Admin123!" };
const PROJECT_ID = "9ab1516f-b622-4d60-9c74-030e54023469";
const PRODUCT_ID = "13f4fed7-27aa-4e36-b339-137b6b010574";

async function dismiss(page: import("@playwright/test").Page) {
  for (let i = 0; i < 3; i++) {
    const s = page.getByRole("button", { name: /skip for now/i });
    if (await s.isVisible({ timeout: 400 }).catch(() => false)) await s.click().catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
  }
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 });
  await page.waitForTimeout(1000);
  await dismiss(page);
}

async function hero(page: import("@playwright/test").Page, name: string, url: string, waitMs = 2200) {
  await page.goto(url);
  await page.waitForTimeout(waitMs);
  await dismiss(page);
  const main = page.locator("main.app-content");
  const target = (await main.count()) ? main : page.locator("body");
  await target.screenshot({ path: join(heroDir, `${name}.png`), timeout: 15_000 });
  console.log(`  ✓ hero/${name}`);
}

test("capture v5 hero screenshots", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await hero(page, "dashboard", "/");
  await hero(page, "projects", "/projects");
  await hero(page, "assets", `/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`, 3000);
  await hero(page, "work-instructions", "/work-instructions");
  await hero(page, "issues", "/issues");
  await hero(page, "documents", "/documents");
  await hero(page, "admin", "/admin?tab=users");
  await hero(page, "settings", "/settings");
  await hero(page, "project-detail", `/projects/${PROJECT_ID}`);
  await hero(page, "tips", "/tips");

  // Assets page with a row expanded (shows workflow assignment + Start Run)
  await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
  await page.waitForTimeout(3000);
  const chevron = page.locator("table tbody tr").first().locator("button").first();
  if (await chevron.isVisible({ timeout: 5000 }).catch(() => false)) {
    await chevron.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.locator("main.app-content").screenshot({ path: join(heroDir, "assets-expanded.png") });
  console.log("  ✓ hero/assets-expanded");

  // Runner setup dialog + first step
  const runBtn = page.locator('button:has-text("Start Run")').first();
  if (await runBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await runBtn.click().catch(() => {});
    await page.waitForTimeout(1800);
    const dialog = page.getByRole("dialog").first();
    if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dialog.screenshot({ path: join(heroDir, "runner-setup.png") });
      console.log("  ✓ hero/runner-setup");
      const start = dialog.getByRole("button", { name: /^start/i }).first();
      if (await start.isVisible({ timeout: 3000 }).catch(() => false)) {
        await start.click().catch(() => {});
        await page.waitForTimeout(2500);
        await page.getByRole("dialog").first().screenshot({ path: join(heroDir, "runner-step.png") });
        console.log("  ✓ hero/runner-step");
      }
    }
  }
  if (!existsSync(join(heroDir, "runner-setup.png"))) {
    await hero(page, "runner-setup", "/work-instructions");
  }
  if (!existsSync(join(heroDir, "runner-step.png"))) {
    await hero(page, "runner-step", "/work-instructions");
  }

  // ── Mobile full views ──
  const m = await browser.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto("/login");
  await m.getByLabel(/email/i).fill(ADMIN.email);
  await m.getByLabel(/password/i).fill(ADMIN.password);
  await m.getByRole("button", { name: /sign in|log in|login/i }).click();
  await m.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 });
  await dismiss(m);

  const mshot = async (name: string, url: string, waitMs = 2000) => {
    await m.goto(url);
    await m.waitForTimeout(waitMs);
    await dismiss(m);
    await m.locator("main.app-content, body").first().screenshot({ path: join(mobileDir, `${name}.png`) });
    console.log(`  ✓ mobile/${name}`);
  };
  await mshot("dashboard", "/");
  await mshot("assets", `/installations/assets?project=${PROJECT_ID}`, 2500);
  await mshot("projects", "/projects");
  await mshot("mobile-upload", "/mobile-upload");
  await m.close();

  for (const n of ["dashboard", "projects", "assets", "work-instructions", "issues", "documents", "admin", "settings", "project-detail", "runner-setup", "runner-step"]) {
    expect(existsSync(join(heroDir, `${n}.png`)), `missing hero/${n}`).toBeTruthy();
  }
});
