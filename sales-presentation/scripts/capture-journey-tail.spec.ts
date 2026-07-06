/** Quick capture for scenes 15-16 only */
import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "sales-presentation", "public", "screenshots", "scenes");
mkdirSync(outDir, { recursive: true });
const ADMIN = { email: "admin@commtrac.local", password: "Admin123!" };
const PROJECT_ID = "9ab1516f-b622-4d60-9c74-030e54023469";
const PRODUCT_ID = "13f4fed7-27aa-4e36-b339-137b6b010574";

test("capture scenes 15-16", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  const shot = async (scene: string, view: string, loc?: import("@playwright/test").Locator) => {
    const path = join(outDir, `${scene}-${view}.png`);
    if (loc) await loc.screenshot({ path }).catch(() => page.locator("main.app-content").screenshot({ path }));
    else await page.locator("main.app-content").screenshot({ path });
    console.log(`✓ ${scene}-${view}`);
  };

  await page.goto("/mobile-upload");
  await shot("15", "v2", page.locator("main, form").first());
  const mobile = await browser.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto("/mobile-upload");
  await shot("15", "v3", mobile.locator("body"));
  await mobile.close();
  await page.goto("/");
  await shot("15", "v1", page.locator(".topbar"));
  await shot("15", "v4", page.locator("main.app-content"));

  await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
  await shot("16", "v1", page.locator("table tbody tr").first());
  await page.goto(`/projects/${PROJECT_ID}`);
  await shot("16", "v3", page.getByText(/snapshot|status/i).first());
  await page.goto("/documents");
  await shot("16", "v4", page.locator("main.app-content"));
  await page.goto("/work-instructions");
  await shot("16", "v2", page.locator("main.app-content"));

  for (const s of ["15", "16"]) {
    for (const v of ["v1", "v2", "v3", "v4"]) {
      expect(existsSync(join(outDir, `${s}-${v}.png`))).toBeTruthy();
    }
  }
});
