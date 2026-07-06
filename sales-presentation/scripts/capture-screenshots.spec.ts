/**
 * Capture region-specific views for each presentation scene (4 views × 13 scenes).
 * Requires API :4000 + Vite :5173.
 * Optional: CAPTURE_FROM=5 to resume from scene 5.
 */
import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "sales-presentation", "public", "screenshots", "scenes");
mkdirSync(outDir, { recursive: true });

const ADMIN = { email: "admin@commtrac.local", password: "Admin123!" };
const PROJECT_ID = "9ab1516f-b622-4d60-9c74-030e54023469";
const PRODUCT_ID = "13f4fed7-27aa-4e36-b339-137b6b010574";
const CAPTURE_FROM = Number(process.env.CAPTURE_FROM ?? "1");

async function dismissOverlays(page: import("@playwright/test").Page) {
  for (let i = 0; i < 3; i++) {
    const skip = page.getByRole("button", { name: /skip for now/i });
    if (await skip.isVisible({ timeout: 400 }).catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(300);
    }
    await page.keyboard.press("Escape").catch(() => undefined);
  }
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await page.waitForTimeout(800);
  await dismissOverlays(page);
}

async function clipShot(
  page: import("@playwright/test").Page,
  scene: string,
  view: string,
  locator: import("@playwright/test").Locator,
  label?: string
) {
  const path = join(outDir, `${scene}-${view}.png`);
  try {
    await locator.waitFor({ state: "visible", timeout: 12_000 });
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await locator.screenshot({ path, timeout: 10_000 });
    console.log(`  ✓ ${scene}-${view}${label ? ` (${label})` : ""}`);
  } catch {
    console.warn(`  ✗ ${scene}-${view} locator failed, using main content`);
    await pageRegion(page, scene, view);
  }
}

async function pageRegion(
  page: import("@playwright/test").Page,
  scene: string,
  view: string,
  scrollTo?: import("@playwright/test").Locator
) {
  const path = join(outDir, `${scene}-${view}.png`);
  const main = page.locator("main.app-content");
  if (scrollTo) {
    await scrollTo.scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(350);
  }
  await main.screenshot({ path, timeout: 15_000 });
  console.log(`  ✓ ${scene}-${view}`);
}

function skipScene(n: number): boolean {
  return n < CAPTURE_FROM;
}

test("capture scene-specific views", async ({ page, browser }) => {
  test.setTimeout(900_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  let mobile = await browser.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto("/login");
  await mobile.getByLabel(/email/i).fill(ADMIN.email);
  await mobile.getByLabel(/password/i).fill(ADMIN.password);
  await mobile.getByRole("button", { name: /sign in|log in|login/i }).click();
  await mobile.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await dismissOverlays(mobile);

  if (!skipScene(1)) {
    console.log("Scene 01...");
    await page.goto("/");
    await page.waitForTimeout(1200);
    await dismissOverlays(page);
    await clipShot(page, "01", "v1", page.getByRole("heading", { name: /Needs Attention/i }), "Needs Attention");
    await page.goto("/projects");
    await page.waitForTimeout(1200);
    await clipShot(page, "01", "v2", page.locator("main.app-content .glass-card").first(), "Projects list");
    await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
    await page.waitForTimeout(1500);
    await clipShot(page, "01", "v3", page.locator("main.app-content table").first(), "Assets table");
    await mobile.goto("/");
    await mobile.waitForTimeout(1200);
    await mobile.locator("main.app-content").screenshot({ path: join(outDir, "01-v4.png") });
    console.log("  ✓ 01-v4 (mobile home)");
  }

  if (!skipScene(2)) {
    console.log("Scene 02...");
    await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
    await page.waitForTimeout(1200);
    await clipShot(page, "02", "v1", page.getByText(/health|AIM-100|Complete|In Progress/i).first(), "Health bar");
    const startRun = page.getByRole("button", { name: /start run/i }).first();
    if (await startRun.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clipShot(page, "02", "v2", startRun, "Start Run");
    } else {
      await pageRegion(page, "02", "v2");
    }
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForTimeout(1200);
    await clipShot(page, "02", "v3", page.getByText(/Project snapshot/i).first(), "Project snapshot");
    await mobile.goto(`/installations/assets?project=${PROJECT_ID}`);
    await mobile.waitForTimeout(1200);
    await mobile.locator("main.app-content").screenshot({ path: join(outDir, "02-v4.png") });
    console.log("  ✓ 02-v4 (mobile assets)");
  }

  if (!skipScene(3)) {
    console.log("Scene 03...");
    await page.goto("/");
    await page.waitForTimeout(1000);
    await clipShot(page, "03", "v1", page.locator(".sidebar, nav.sidebar, [class*='sidebar']").first(), "Sidebar nav");
    await page.goto("/work-instructions");
    await page.waitForTimeout(1200);
    await pageRegion(page, "03", "v2");
    await page.goto("/admin?tab=users");
    await page.waitForTimeout(1200);
    await clipShot(page, "03", "v3", page.locator("main.app-content table, main.app-content .glass-card").first(), "Admin users");
    await mobile.goto("/");
    await mobile.waitForTimeout(1000);
    await mobile.locator(".bottom-tab-bar, nav").first().screenshot({ path: join(outDir, "03-v4.png") }).catch(async () => {
      await mobile.locator("main.app-content").screenshot({ path: join(outDir, "03-v4.png") });
    });
    console.log("  ✓ 03-v4 (mobile tabs)");
  }

  if (!skipScene(4)) {
    console.log("Scene 04...");
    await page.goto("/projects");
    await page.waitForTimeout(1200);
    await clipShot(page, "04", "v1", page.locator("main.app-content table").first(), "Projects table");
    const chevron = page.locator("table tbody tr").first().getByRole("button").first();
    if (await chevron.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chevron.click();
      await page.waitForTimeout(600);
      await clipShot(page, "04", "v2", page.locator("table tbody tr").first(), "Expanded project row");
    } else {
      await pageRegion(page, "04", "v2");
    }
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForTimeout(1200);
    await clipShot(page, "04", "v3", page.getByText(/Project snapshot/i).first(), "Project detail");
    await clipShot(
      page,
      "04",
      "v4",
      page.getByText("Workflow actions").locator("xpath=ancestor::div[contains(@class,'glass-card')]").first(),
      "Workflow actions"
    );
  }

  if (!skipScene(5)) {
    console.log("Scene 05...");
    await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
    await page.waitForTimeout(1500);
    await clipShot(
      page,
      "05",
      "v1",
      page.locator("main.app-content").getByLabel("Project").locator("xpath=ancestor::div[contains(@class,'MuiFormControl')]").first(),
      "Project filter"
    );
    await clipShot(page, "05", "v2", page.locator("main.app-content table thead").first(), "Asset columns");
    const row = page.locator("table tbody tr").first();
    if (await row.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clipShot(page, "05", "v3", row, "Asset row");
      const expandBtn = row.getByRole("button").first();
      if (await expandBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expandBtn.click();
        await page.waitForTimeout(500);
        await clipShot(page, "05", "v4", row, "Expanded asset");
      } else {
        await clipShot(page, "05", "v4", page.getByRole("button", { name: /start run|continue run|resume run/i }).first().or(row), "Run action");
      }
    } else {
      await pageRegion(page, "05", "v3");
      await pageRegion(page, "05", "v4");
    }
  }

  if (!skipScene(6)) {
    console.log("Scene 06...");
    await page.goto("/work-instructions");
    await page.waitForTimeout(1200);
    await pageRegion(page, "06", "v1");
    await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
    await page.waitForTimeout(1200);
    const runBtn = page.getByRole("button", { name: /start run|continue run|resume run/i }).first();
    if (await runBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await runBtn.click();
      await page.waitForTimeout(1000);
      const cont = page.getByRole("button", { name: /^continue$/i });
      if (await cont.isVisible({ timeout: 2000 }).catch(() => false)) await cont.click();
      const dialog = page.getByRole("dialog");
      if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dialog.screenshot({ path: join(outDir, "06-v2.png") });
        console.log("  ✓ 06-v2 (workflow setup)");
        const startArrow = dialog.getByRole("button", { name: /start/i });
        if (await startArrow.isVisible({ timeout: 2000 }).catch(() => false)) {
          await startArrow.click();
          await page.waitForTimeout(1500);
          await (page.getByRole("dialog").or(page.locator(".MuiDialog-root"))).first().screenshot({ path: join(outDir, "06-v3.png") });
          console.log("  ✓ 06-v3 (workflow step)");
        } else {
          await pageRegion(page, "06", "v3");
        }
        await page.keyboard.press("Escape").catch(() => undefined);
      }
    } else {
      await pageRegion(page, "06", "v2");
      await pageRegion(page, "06", "v3");
    }
    await page.goto("/work-instructions");
    await page.waitForTimeout(1000);
    const builderToggle = page.getByRole("button", { name: /builder/i });
    if (await builderToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await builderToggle.click();
      await page.waitForTimeout(800);
    }
    await pageRegion(page, "06", "v4");
  }

  if (!skipScene(7)) {
    console.log("Scene 07...");
    await page.goto("/");
    await page.waitForTimeout(1200);
    await dismissOverlays(page);
    await clipShot(page, "07", "v1", page.getByRole("heading", { name: /Needs Attention/i }), "Needs Attention");
    const evidence = page.getByRole("heading", { name: /Evidence Completeness/i });
    if (await evidence.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clipShot(page, "07", "v2", evidence.locator("xpath=ancestor::div[contains(@class,'glass-card')]").first(), "Evidence");
    } else {
      await pageRegion(page, "07", "v2");
    }
    const workload = page.getByRole("heading", { name: /Technician Workload|Technician/i });
    if (await workload.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clipShot(page, "07", "v3", workload.locator("xpath=ancestor::div[contains(@class,'glass-card')]").first(), "Workload");
    } else {
      await pageRegion(page, "07", "v3");
    }
    await clipShot(page, "07", "v4", page.getByRole("tab").first(), "Dashboard tabs");
  }

  if (!skipScene(8)) {
    console.log("Scene 08...");
    await page.goto("/issues");
    await page.waitForTimeout(1200);
    await clipShot(page, "08", "v1", page.getByRole("heading", { name: /Issues Board/i }), "Issues header");
    await clipShot(page, "08", "v2", page.getByText(/Blocking|Total Open|Medium/i).first(), "Issue KPIs");
    await clipShot(page, "08", "v3", page.locator("main.app-content .glass-card").nth(1), "Issue filters/list");
    await page.goto("/");
    await page.waitForTimeout(1000);
    await clipShot(page, "08", "v4", page.getByRole("heading", { name: /Needs Attention/i }), "Dashboard issues link");
  }

  if (!skipScene(9)) {
    console.log("Scene 09...");
    await page.goto("/documents");
    await page.waitForTimeout(1200);
    await clipShot(page, "09", "v1", page.locator("main.app-content table, main.app-content .glass-card").first(), "Documents");
    await page.goto("/work-instructions");
    await page.waitForTimeout(1200);
    await pageRegion(page, "09", "v2");
    await page.goto("/admin");
    await page.waitForTimeout(1200);
    await clipShot(page, "09", "v3", page.getByRole("tab", { name: /Customers|Users/i }).first(), "Admin tab");
    await page.goto("/tips");
    await page.waitForTimeout(1200);
    await pageRegion(page, "09", "v4");
  }

  if (!skipScene(10)) {
    console.log("Scene 10...");
    await mobile.goto("/");
    await mobile.waitForTimeout(1000);
    await mobile.locator(".topbar, header").first().screenshot({ path: join(outDir, "10-v1.png") }).catch(async () => {
      await mobile.locator("main.app-content").screenshot({ path: join(outDir, "10-v1.png") });
    });
    await mobile.goto(`/installations/assets?project=${PROJECT_ID}`);
    await mobile.waitForTimeout(1200);
    await mobile.locator("main.app-content").screenshot({ path: join(outDir, "10-v2.png") });
    await mobile.goto("/projects");
    await mobile.waitForTimeout(1000);
    await mobile.locator("main.app-content").screenshot({ path: join(outDir, "10-v3.png") });
    await page.goto("/");
    await page.waitForTimeout(1000);
    await clipShot(page, "10", "v4", page.locator(".topbar").first(), "Sync status");
    console.log("  ✓ 10-v1..v4");
  }

  if (!skipScene(11)) {
    console.log("Scene 11...");
    await page.goto("/admin?tab=users");
    await page.waitForTimeout(1200);
    await clipShot(page, "11", "v1", page.locator("main.app-content table").first(), "Users table");
    await page.getByRole("tab", { name: /Roles/i }).click().catch(() => undefined);
    await page.waitForTimeout(800);
    await pageRegion(page, "11", "v2");
    await page.goto("/settings");
    await page.waitForTimeout(1200);
    await pageRegion(page, "11", "v3");
    await page.goto("/login");
    await page.waitForTimeout(800);
    await page.locator("main, form, .glass-card").first().screenshot({ path: join(outDir, "11-v4.png") });
    console.log("  ✓ 11-v4 (login/auth)");
    await login(page);
  }

  if (!skipScene(12)) {
    console.log("Scene 12...");
    await page.goto("/admin");
    await page.waitForTimeout(1200);
    await clipShot(page, "12", "v1", page.getByRole("tab", { name: /Roles/i }), "Roles tab");
    await page.getByRole("tab", { name: /Roles/i }).click().catch(() => undefined);
    await page.waitForTimeout(800);
    await pageRegion(page, "12", "v2");
    await page.goto("/work-instructions");
    await page.waitForTimeout(1200);
    await pageRegion(page, "12", "v3");
    await page.goto("/documents");
    await page.waitForTimeout(1200);
    await pageRegion(page, "12", "v4");
  }

  if (!skipScene(13)) {
    console.log("Scene 13...");
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForTimeout(1200);
    await clipShot(page, "13", "v1", page.getByText(/JOB-4021|Strata Worldwide/i).first(), "Project header");
    await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
    await page.waitForTimeout(1200);
    await clipShot(page, "13", "v2", page.locator("main.app-content table tbody").first(), "Asset progress");
    await page.goto("/");
    await page.waitForTimeout(1000);
    await clipShot(page, "13", "v3", page.getByText(/Regional snapshot/i).first(), "Regional");
    await mobile.goto("/projects");
    await mobile.waitForTimeout(1000);
    await mobile.locator("main.app-content").screenshot({ path: join(outDir, "13-v4.png") });
  }

  await mobile.close();

  for (let s = 1; s <= 13; s++) {
    const id = String(s).padStart(2, "0");
    for (const v of ["v1", "v2", "v3", "v4"]) {
      expect(existsSync(join(outDir, `${id}-${v}.png`)), `missing ${id}-${v}.png`).toBeTruthy();
    }
  }
});
