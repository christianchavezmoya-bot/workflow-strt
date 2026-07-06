/**
 * Capture scene-14 (Flag issue) and scene-15 (Add from phone QR) dialogs.
 * Requires API :4000 + Vite :5173 + seeded workflow (scripts/seed-workflow.mjs).
 * Output: public/screenshots/hero/flag-issue.png, hero/phone-upload.png
 */
import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const heroDir = join(process.cwd(), "sales-presentation", "public", "screenshots", "hero");
mkdirSync(heroDir, { recursive: true });

const API = "http://localhost:4000/api";
const ADMIN = { email: "admin@commtrac.local", password: "Admin123!" };
const PROJECT_ID = "9ab1516f-b622-4d60-9c74-030e54023469";
const PRODUCT_ID = "13f4fed7-27aa-4e36-b339-137b6b010574";

async function dismiss(page: import("@playwright/test").Page) {
  for (let i = 0; i < 3; i++) {
    const s = page.getByRole("button", { name: /skip for now/i });
    if (await s.isVisible({ timeout: 300 }).catch(() => false)) await s.click().catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
  }
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 });
  await page.waitForTimeout(800);
  await dismiss(page);
}

test("capture flag-issue + phone-upload dialogs", async ({ page, request }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // API: token, ids, and a live run
  const token = (await (await request.post(`${API}/auth/login`, { data: ADMIN })).json()).token as string;
  const adminId = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())[
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
  ];
  const H = { Authorization: `Bearer ${token}` };
  const assets = await (await request.get(`${API}/project-assets/by-project/${PROJECT_ID}`, { headers: H })).json();
  const asset = assets[0];
  const configs = await (await request.get(`${API}/workflow-configs/by-product/${PRODUCT_ID}`, { headers: H })).json();
  const cfg = configs.find((c: any) => c.status === "Published");
  const run = await (await request.post(`${API}/asset-workflow-runs`, {
    headers: H, data: { assetId: asset.id, workflowConfigId: cfg.id, technicianUserId: adminId },
  })).json();
  console.log("run", run.id, "asset", asset.assetTag);

  await login(page);

  // Warm the assets page so runsMap is populated before the deep link
  await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
  await page.waitForTimeout(3500);
  await dismiss(page);

  // ── Scene 15: Add from phone (QR) via deep link ──
  // NOTE: do NOT press Escape while polling — it closes the dialog.
  await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}&asset=${asset.id}&action=photos&run=${run.id}`);
  let qrOk = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    if ((await page.getByText("Add from phone").count()) > 0) { qrOk = true; break; }
  }
  await page.waitForTimeout(2500); // QR image render
  await page.screenshot({ path: join(heroDir, "phone-upload.png") });
  console.log(`  ${qrOk ? "✓" : "~"} hero/phone-upload`);
  await page.getByRole("button", { name: /^close$/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);

  // ── Scene 14: Flag issue dialog (drive the runner) ──
  await page.goto(`/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
  await page.waitForTimeout(3500);
  await dismiss(page);
  const chevron = page.locator("table tbody tr").first().locator("button").first();
  if (await chevron.isVisible({ timeout: 6000 }).catch(() => false)) {
    await chevron.click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  const runBtn = page.locator('button:has-text("Continue Run"), button:has-text("Start Run")').first();
  if (await runBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
    await runBtn.scrollIntoViewIfNeeded().catch(() => {});
    await runBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
    const assignBtn = page.getByRole("button", { name: /assign.*start/i }).first();
    if (await assignBtn.isVisible({ timeout: 2500 }).catch(() => false)) await assignBtn.click().catch(() => {});

    // "Continue Run" opens the "Run workflow" setup dialog — click its Start/Continue
    // button to enter the step view where "Flag issue" lives.
    await page.waitForTimeout(1200);
    const setupGo = page.getByRole("dialog").getByRole("button", { name: /^start|^continue|^resume|begin|launch/i }).last();
    if (await setupGo.isVisible({ timeout: 5000 }).catch(() => false)) {
      await setupGo.click().catch(() => {});
      await page.waitForTimeout(2500);
    }

    // Poll for the runner + Flag issue button (up to ~40s)
    let flagged = false;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1000);
      const flag = page.locator('button:has-text("Flag issue")').first();
      if (await flag.isVisible({ timeout: 300 }).catch(() => false)) {
        await flag.scrollIntoViewIfNeeded().catch(() => {});
        await flag.click().catch(() => {});
        await page.waitForSelector("text=Flag issue on this step", { timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(800);
        const desc = page.getByPlaceholder(/describe|observed/i).first();
        if (await desc.isVisible({ timeout: 1500 }).catch(() => false)) {
          await desc.fill("Cracked housing near cable gland — monitor before next use.").catch(() => {});
          await page.waitForTimeout(600);
        }
        await page.screenshot({ path: join(heroDir, "flag-issue.png") });
        console.log("  ✓ hero/flag-issue");
        flagged = true;
        break;
      }
    }
    if (!flagged) console.log("  ~ Flag issue button not found");
  } else {
    console.log("  ~ run button not found");
  }

  expect(existsSync(join(heroDir, "phone-upload.png"))).toBeTruthy();
});
