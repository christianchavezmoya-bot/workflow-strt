import { test, expect, type Page } from "@playwright/test";

/**
 * Visual baseline — the layout safety net for the excellence programme.
 *
 * Captures every stable route at desktop and phone width and compares it to a
 * stored reference image. Nothing else in the suite guards layout: the perf
 * gates protect speed and the e2e specs protect behaviour, so before this
 * existed a refactor could silently move the whole UI and pass CI.
 *
 * Generating / refreshing the reference images:
 *   npm run test:e2e:visual -- --update-snapshots
 * See docs/VISUAL_BASELINE.md — the references must come from a seeded
 * environment, so they are produced on the staging machine, not in CI.
 */

const EMAIL = process.env.VISUAL_EMAIL ?? "admin@StrataNgo.local";
const PASSWORD = process.env.VISUAL_PASSWORD ?? "Admin123!";

/** Frozen so any rendered "now" is identical between runs. */
const FIXED_TIME = new Date("2026-06-15T09:00:00.000Z");

/**
 * Routes that render standalone content from stable data.
 *
 * Deliberately excluded, with reasons — add here rather than silently skipping:
 *   /projects/:id, /projects/:id/edit, ...    need a record id that differs per environment
 *   /sign/:tokenId, /share/reports/:shareId   need a generated one-time token
 *   /mobile-upload                            entered by QR scan with a session code
 *   /reset-password                           needs an emailed token
 */
const ROUTES: Array<{ path: string; name: string; note?: string }> = [
  { path: "/", name: "dashboard" },
  { path: "/projects", name: "projects-list" },
  { path: "/projects/new", name: "project-new" },
  { path: "/installations/assets", name: "installations-assets" },
  { path: "/installations/capture", name: "installations-capture" },
  { path: "/issues", name: "issues-board" },
  { path: "/documents", name: "documents" },
  { path: "/work-instructions", name: "work-instructions" },
  { path: "/time-analytics", name: "time-analytics" },
  { path: "/tips", name: "tips" },
  { path: "/settings", name: "settings" },
  { path: "/profile", name: "profile" },
  { path: "/admin", name: "admin" },
  { path: "/admin/fault-reports", name: "admin-fault-reports" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

/**
 * Regions whose content legitimately changes between runs — relative
 * timestamps, live clocks, sync state. Masked rather than excluded so layout
 * shifts around them are still caught.
 */
const VOLATILE_SELECTORS = [
  "[data-visual-volatile]",
  ".MuiCircularProgress-root",
  "time",
];

function masks(page: Page) {
  return VOLATILE_SELECTORS.map((selector) => page.locator(selector));
}

async function dismissOnboarding(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const skipTour = page.getByRole("button", { name: /skip for now/i }).first();
    if (!(await skipTour.isVisible().catch(() => false))) return;
    await skipTour.click();
    await page.waitForTimeout(400);
  }
}

/** Wait for the page to stop moving: no spinners, no in-flight requests. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForFunction(() => !document.querySelector(".MuiCircularProgress-root"), undefined, {
      timeout: 15_000,
    })
    .catch(() => {});
  // Let CSS transitions and MUI ripples finish before the shutter.
  await page.waitForTimeout(600);
}

test.describe("visual baseline", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test.beforeEach(async ({ page }) => {
        await page.clock.setFixedTime(FIXED_TIME);
      });

      test("login screen", async ({ page }) => {
        await page.goto("/login");
        await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });
        await settle(page);
        await expect(page).toHaveScreenshot(`${viewport.name}-login.png`, {
          fullPage: true,
          mask: masks(page),
          maxDiffPixelRatio: 0.02,
          animations: "disabled",
        });
      });

      for (const route of ROUTES) {
        test(route.name, async ({ page }) => {
          await page.goto("/login");
          await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });
          await page.getByLabel("Email").fill(EMAIL);
          await page.getByLabel("Password").fill(PASSWORD);
          await page.getByRole("button", { name: /sign in/i }).click();
          await expect(page.locator(".app-shell")).toBeVisible({ timeout: 30_000 });
          await dismissOnboarding(page);

          await page.goto(route.path);
          await expect(page.locator(".app-content")).toBeVisible({ timeout: 30_000 });
          await settle(page);

          await expect(page).toHaveScreenshot(`${viewport.name}-${route.name}.png`, {
            fullPage: true,
            mask: masks(page),
            maxDiffPixelRatio: 0.02,
            animations: "disabled",
          });
        });
      }
    });
  }
});
