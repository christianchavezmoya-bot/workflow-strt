#!/usr/bin/env node
/**
 * Record journey MP4 videos with Playwright (library API for predictable output).
 * Produces:
 *   public/videos/journey-create-project.mp4
 *   public/videos/journey-workflow-run.mp4
 *   public/videos/journey-mobile-upload.mp4
 *
 * Requires API :4000 + Vite :5173, and seeded workflow assignments
 * (run scripts/seed-workflow.mjs first).
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const videosDir = join(root, "public", "videos");
const tmpDir = join(root, ".video-tmp");
mkdirSync(videosDir, { recursive: true });

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const ADMIN = { email: "admin@commtrac.local", password: "Admin123!" };
const PROJECT_ID = "9ab1516f-b622-4d60-9c74-030e54023469";
const PRODUCT_ID = "13f4fed7-27aa-4e36-b339-137b6b010574";

const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dismiss(page) {
  for (let i = 0; i < 3; i++) {
    const skip = page.getByRole("button", { name: /skip for now/i });
    if (await skip.isVisible({ timeout: 400 }).catch(() => false)) await skip.click().catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
  }
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 });
  await sleep(800);
  await dismiss(page);
}

/** Move mouse smoothly to an element center for a natural cursor feel. */
async function glideTo(page, locator) {
  try {
    const box = await locator.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
      await sleep(300);
    }
  } catch { /* ignore */ }
}

async function convert(webmPath, outName, portrait = false) {
  const out = join(videosDir, outName);
  // Landscape → 1280 wide; portrait (phone) → 760 tall so it fits a phone frame
  const scale = portrait ? "scale=-2:760,fps=30" : "scale=1280:-2,fps=30";
  execFileSync("ffmpeg", [
    "-y", "-i", webmPath,
    "-vf", scale,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    out,
  ], { stdio: "pipe" });
  console.log(`  → ${outName}`);
}

async function recordScene(name, viewport, fn, portrait = false) {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: tmpDir, size: viewport },
  });
  const page = await context.newPage();
  let err = null;
  try {
    await fn(page);
  } catch (e) {
    err = e;
    console.warn(`  ! ${name} partial: ${e.message}`);
  }
  await sleep(600);
  await page.close();
  await context.close();
  await browser.close();
  const webm = readdirSync(tmpDir).find((f) => f.endsWith(".webm"));
  if (webm) await convert(join(tmpDir, webm), name, portrait);
  rmSync(tmpDir, { recursive: true, force: true });
  if (err) console.warn(`  (recorded ${name} despite partial run)`);
}

// ── Video 1: Create a project ──
async function createProject(page) {
  await login(page);
  await page.goto(`${BASE}/projects`);
  await sleep(1500);
  const createBtn = page.getByRole("link", { name: /create project/i })
    .or(page.getByRole("button", { name: /create project/i })).first();
  await glideTo(page, createBtn);
  await createBtn.click();
  await sleep(1500);

  const job = page.getByLabel(/job number/i).first();
  await glideTo(page, job);
  await job.click();
  for (const ch of "DEMO-9001") { await page.keyboard.type(ch); await sleep(60); }
  await sleep(500);

  const cust = page.getByLabel(/customer name/i).first();
  if (await cust.isVisible().catch(() => false)) {
    await glideTo(page, cust);
    await cust.click();
    for (const ch of "Demo Utilities Inc") { await page.keyboard.type(ch); await sleep(45); }
    await sleep(400);
  }
  const site = page.getByLabel(/^site/i).first();
  if (await site.isVisible().catch(() => false)) {
    await glideTo(page, site);
    await site.click();
    for (const ch of "North Ridge Substation") { await page.keyboard.type(ch); await sleep(40); }
    await sleep(400);
  }
  // Workflow mode radio
  const modeRow = page.getByText(/installation only/i).first();
  if (await modeRow.isVisible().catch(() => false)) {
    await glideTo(page, modeRow);
    await modeRow.click().catch(() => {});
    await sleep(600);
  }
  // Scroll to show the form then hover Save (do not necessarily submit to avoid clutter)
  const save = page.getByRole("button", { name: /^save|create project|save project/i }).first();
  if (await save.isVisible().catch(() => false)) {
    await glideTo(page, save);
    await sleep(800);
    await save.click().catch(() => {});
    await sleep(2500);
  } else {
    await sleep(1500);
  }
}

/** Click any confirmation dialog's primary/affirmative button, if present. */
async function confirmAnyDialog(page, timeout = 4000) {
  const dialog = page.getByRole("dialog").first();
  if (!(await dialog.isVisible({ timeout }).catch(() => false))) return false;
  await sleep(900);
  const affirm = dialog.getByRole("button", {
    name: /assign.*start|start|continue|take over|proceed|confirm|yes|begin|launch|ok/i,
  }).last();
  if (await affirm.isVisible({ timeout: 2000 }).catch(() => false)) {
    await glideTo(page, affirm);
    await affirm.click().catch(() => {});
    await sleep(1800);
    return true;
  }
  return false;
}

// ── Video 2: Asset workflow run ──
async function workflowRun(page) {
  await login(page);
  await page.goto(`${BASE}/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
  await sleep(2500);
  await dismiss(page);

  // Expand the first asset row (loads its workflow assignments so "Start Run" appears).
  // The expand toggle is the first button (chevron) in the first data row.
  const chevron = page.locator("table tbody tr").first().locator("button").first();
  if (await chevron.isVisible({ timeout: 6000 }).catch(() => false)) {
    await glideTo(page, chevron);
    await chevron.click().catch(() => {});
    await sleep(3000); // wait for loadAssignmentsForAsset
  }

  // NOTE: the button's visible text is "Start Run" but its accessible name is the
  // tooltip ("Start workflow"), so match by visible text with has-text.
  const runBtn = page.locator('button:has-text("Start Run")').first();
  if (await runBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
    await runBtn.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(500);
    await glideTo(page, runBtn);
    await runBtn.click().catch(() => {});
    await sleep(1800);

    // Handle chained dialogs: auto-assign ("Assign to me & Start"), then run setup
    await confirmAnyDialog(page, 5000);
    await confirmAnyDialog(page, 3000);
    await sleep(2500);

    // In the runner: tick a checkbox, advance steps
    for (let step = 0; step < 3; step++) {
      const check = page.getByRole("checkbox").first();
      if (await check.isVisible({ timeout: 2000 }).catch(() => false)) {
        await glideTo(page, check);
        await check.click().catch(() => {});
        await sleep(700);
      }
      const next = page.getByRole("button", { name: /^next$|^continue$|proceed/i }).first();
      if (await next.isVisible({ timeout: 2000 }).catch(() => false)) {
        await glideTo(page, next);
        await next.click().catch(() => {});
        await sleep(1800);
      } else {
        break;
      }
    }
    await sleep(1500);
  } else {
    await page.goto(`${BASE}/work-instructions`);
    await sleep(3000);
  }
}

// ── Video 3: Mobile upload (phone viewport) ──
async function mobileUpload(page) {
  await login(page);
  await page.goto(`${BASE}/installations/assets?project=${PROJECT_ID}&product=${PRODUCT_ID}`);
  await sleep(2000);
  await page.goto(`${BASE}/mobile-upload`);
  await sleep(2500);
  // Scroll gently to reveal upload UI
  await page.mouse.wheel(0, 200);
  await sleep(1500);
  await page.mouse.wheel(0, -200);
  await sleep(1500);
}

async function main() {
  const only = process.env.ONLY;
  if (!only || only === "create") {
    console.log("Recording journey-create-project.mp4 ...");
    await recordScene("journey-create-project.mp4", DESKTOP, createProject);
  }
  if (!only || only === "run") {
    console.log("Recording journey-workflow-run.mp4 ...");
    await recordScene("journey-workflow-run.mp4", DESKTOP, workflowRun);
  }
  if (!only || only === "mobile") {
    console.log("Recording journey-mobile-upload.mp4 ...");
    await recordScene("journey-mobile-upload.mp4", PHONE, mobileUpload, true);
  }
  console.log("Done. Videos in public/videos/");
}

main().catch((e) => { console.error(e); process.exit(1); });
