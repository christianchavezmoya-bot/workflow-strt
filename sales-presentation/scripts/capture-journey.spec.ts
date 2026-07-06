/**
 * Capture user-journey views (scenes 09–16).
 * Requires API :4000 + Vite :5173.
 */
import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "sales-presentation", "public", "screenshots", "scenes");
mkdirSync(outDir, { recursive: true });

const ADMIN = { email: "admin@commtrac.local", password: "Admin123!" };
const PROJECT_ID = "9ab1516f-b622-4d60-9c74-030e54023469";
const PRODUCT_ID = "13f4fed7-27aa-4e36-b339-137b6b010574";

async function dismissOverlays(page: import("@playwright/test").Page) {
  for (let i = 0; i < 3; i++) {
    const skip = page.getByRole("button", { name: /skip for now/i });
    if (await skip.isVisible({ timeout: 400 }).catch(() => false)) await skip.click();
    await page.keyboard.press("Escape").catch(() => undefined);
  }
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await dismissOverlays(page);
}

async function shot(page: import("@playwright/test").Page, scene: string, view: string, loc?: import("@playwright/test").Locator) {
  const path = join(outDir, `${scene}-${view}.png`);
  try {
    if (loc) {
      await loc.waitFor({ state: "visible", timeout: 10_000 });
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await loc.screenshot({ path, timeout: 10_000 });
    } else {
      await page.locator("main.app-content").screenshot({ path, timeout: 10_000 });
    }
    console.log(`  ✓ ${scene}-${view}`);
  } catch {
    await page.locator("main.app-content, form, .glass-card").first().screenshot({ path }).catch(() => undefined);
    console.log(`  ~ ${scene}-${view} (fallback)`);
  }
}

test("capture journey scenes 09-16", async ({ page, browser }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  console.log("Scene 09 — Create project...");
  await page.goto("/projects");
  await page.waitForTimeout(1000);
  await shot(page, "09", "v1", page.getByRole("link", { name: /create project/i }).or(page.getByRole("button", { name: /create project/i })));
  await page.goto("/projects/new");
  await page.waitForTimeout(1500);
  await shot(page, "09", "v2", page.getByRole("heading", { name: /create project/i }).or(page.locator("main.app-content .glass-card").first()));
  await shot(page, "09", "v3", page.locator("main.app-content").getByLabel(/job|project|customer/i).first());
  await page.goto("/projects");
  await page.waitForTimeout(1000);
  await shot(page, "09", "v4", page.locator("table tbody tr").first());

  console.log("Scene 10 — Assets...");
  await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
  await page.waitForTimeout(1500);
  await shot(page, "10", "v1", page.locator("main.app-content").getByLabel("Project").first());
  await shot(page, "10", "v2", page.getByRole("button", { name: /add asset|new asset|bulk/i }).first());
  await shot(page, "10", "v3", page.locator("table tbody tr").first());
  await shot(page, "10", "v4", page.getByRole("button", { name: /start run|assign|workflow/i }).first());

  console.log("Scene 11 — Start Run...");
  const runBtn = page.getByRole("button", { name: /start run|continue run|resume run/i }).first();
  if (await runBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await shot(page, "11", "v1", runBtn);
    await runBtn.click();
    await page.waitForTimeout(1200);
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shot(page, "11", "v2", dialog);
      await shot(page, "11", "v3", dialog.getByText(/workflow|run|step/i).first());
      const start = dialog.getByRole("button", { name: /start|continue/i });
      if (await start.isVisible({ timeout: 3000 }).catch(() => false)) {
        await start.click();
        await page.waitForTimeout(1500);
        await shot(page, "11", "v4", page.getByRole("dialog").first());
      } else {
        await shot(page, "11", "v4", dialog);
      }
    } else {
      await shot(page, "11", "v2");
      await shot(page, "11", "v3");
      await shot(page, "11", "v4");
    }
  } else {
    for (const v of ["v1", "v2", "v3", "v4"]) await shot(page, "11", v);
  }

  console.log("Scene 12 — Workflow steps...");
  const dlg = page.getByRole("dialog");
  if (!(await dlg.isVisible({ timeout: 2000 }).catch(() => false))) {
    await page.goto("/work-instructions");
    await page.waitForTimeout(1200);
  }
  if (await dlg.isVisible().catch(() => false)) {
    await shot(page, "12", "v1", dlg);
    await shot(page, "12", "v2", dlg.getByText(/capture|checkbox|field|step/i).first());
    await shot(page, "12", "v3", dlg.getByRole("button", { name: /next|continue|complete/i }).first());
    await shot(page, "12", "v4", dlg.locator(".MuiLinearProgress-root, [role='progressbar']").first().or(dlg));
  } else {
    await shot(page, "12", "v1", page.locator("main.app-content").first());
    for (const v of ["v2", "v3", "v4"]) await shot(page, "12", v);
  }

  console.log("Scene 13 — Photos...");
  if (await dlg.isVisible().catch(() => false)) {
    await shot(page, "13", "v1", dlg.getByRole("button", { name: /photo|video|camera/i }).first().or(dlg));
    await shot(page, "13", "v2", dlg.getByText(/photo|camera|gallery|capture/i).first());
    await shot(page, "13", "v3", dlg.getByText(/attach|media|upload/i).first());
    await shot(page, "13", "v4", dlg.getByText(/missing|required/i).first().or(dlg));
    await page.keyboard.press("Escape").catch(() => undefined);
  } else {
    await page.goto("/");
    await page.waitForTimeout(1000);
    const uploadBtn = page.getByRole("button", { name: /upload|photo|missing/i }).first();
    if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadBtn.click();
      await page.waitForTimeout(1000);
      await shot(page, "13", "v1", page.getByRole("dialog").first());
      for (const v of ["v2", "v3", "v4"]) await shot(page, "13", v, page.getByRole("dialog").first());
      await page.keyboard.press("Escape").catch(() => undefined);
    } else {
      for (const v of ["v1", "v2", "v3", "v4"]) await shot(page, "13", v);
    }
  }

  console.log("Scene 14 — Issues...");
  await page.goto("/issues");
  await page.waitForTimeout(1200);
  await shot(page, "14", "v1", page.getByRole("heading", { name: /issues/i }));
  await shot(page, "14", "v2", page.getByText(/blocking|open|medium/i).first());
  await shot(page, "14", "v3", page.locator("main.app-content table, main.app-content .glass-card").nth(1));
  await page.goto("/");
  await shot(page, "14", "v4", page.getByRole("heading", { name: /needs attention/i }).first());

  console.log("Scene 15 — Mobile upload...");
  await shot(page, "15", "v1", page.locator(".topbar").first());
  await page.goto("/");
  await page.waitForTimeout(800);
  await page.goto("/mobile-upload");
  await page.waitForTimeout(800);
  await shot(page, "15", "v2", page.locator("main, form, .glass-card").first());
  const mobile = await browser.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto("/mobile-upload");
  await mobile.waitForTimeout(800);
  await shot(mobile, "15", "v3", mobile.locator("main, form, body").first());
  await mobile.close();
  await shot(page, "15", "v4", page.locator("main.app-content, form").first());

  console.log("Scene 16 — Complete...");
  await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
  await page.waitForTimeout(1200);
  await shot(page, "16", "v1", page.getByRole("button", { name: /history|complete|summary/i }).first().or(page.locator("table tbody tr").first()));
  await page.goto("/work-instructions");
  await page.waitForTimeout(1000);
  await shot(page, "16", "v2");
  await page.goto(`/projects/${PROJECT_ID}`);
  await shot(page, "16", "v3", page.getByText(/snapshot|status|complete/i).first());
  await page.goto("/documents");
  await shot(page, "16", "v4");

  for (let s = 9; s <= 16; s++) {
    const id = String(s).padStart(2, "0");
    for (const v of ["v1", "v2", "v3", "v4"]) {
      expect(existsSync(join(outDir, `${id}-${v}.png`)), `missing ${id}-${v}`).toBeTruthy();
    }
  }
});
