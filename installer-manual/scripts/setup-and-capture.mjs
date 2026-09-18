#!/usr/bin/env node
/**
 * Seeds minimal demo data locally, then captures real webapp screenshots for the
 * installer training manual. Requires API (:4000) and Vite (:5173) already running.
 *
 *   SeedProfile=StrataNgo dotnet run --project server/Commtrac.Api --urls http://0.0.0.0:4000
 *   npm run dev
 *   node installer-manual/scripts/setup-and-capture.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "installer-manual/screenshots");
const API = process.env.MANUAL_API ?? "http://localhost:4000/api";
const WEB = process.env.MANUAL_WEB ?? "http://localhost:5173";

const ADMIN_EMAIL = process.env.MANUAL_ADMIN_EMAIL ?? "admin.dev@stratango.local";
const ADMIN_PASSWORD = process.env.MANUAL_ADMIN_PASSWORD ?? "Admin123!";
const INSTALLER_EMAIL = process.env.MANUAL_INSTALLER_EMAIL ?? "trainer.installer@manual.local";
const INSTALLER_PASSWORD = process.env.MANUAL_INSTALLER_PASSWORD ?? "Installer123!";
const INSTALLER_NAME = "Alex Installer";
const TRAINING_JOB = "TRAIN-INSTALL-01";
const TRAINING_WORKFLOW_NAME = "Installer_Manual_Demo";

async function api(pathname, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const resp = await fetch(`${API}${pathname}`, { method, headers, body: payload });
  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!resp.ok) throw new Error(`${method} ${pathname} → ${resp.status}: ${text.slice(0, 300)}`);
  return json;
}

async function login(email, password) {
  const data = await api("/auth/login", { method: "POST", body: { email, password } });
  return { token: data.token, user: data.user };
}

function buildTrainingStepsJson(productId) {
  return JSON.stringify({
    id: "installer-manual-wf",
    name: "Installer Manual Demo",
    productId,
    createdAt: Date.now(),
    steps: [
      {
        id: "step-manual-1",
        order: 1,
        title: "Site Check",
        description: "Quick training step used in the installer field guide.",
        overrideInReport: false,
        overrideReportText: "",
        includeDescriptionInReport: true,
        mediaIds: [],
        decisionsEnabled: false,
        decisions: [],
        inputs: [
          { id: "m1-notes", type: "text", label: "Work notes", required: true },
          { id: "m1-safe", type: "checkbox", label: "Work area is safe to enter", required: true },
        ],
        nextStepId: null,
      },
    ],
    media: [],
  });
}

async function ensureInstaller(admin) {
  const users = await api("/users", { token: admin.token });
  let installer = users.find((u) => u.email === INSTALLER_EMAIL);
  if (!installer) {
    installer = await api("/users", {
      method: "POST",
      token: admin.token,
      body: {
        email: INSTALLER_EMAIL,
        fullName: INSTALLER_NAME,
        role: "Installer",
        office: "Australia",
      },
    });
    console.log("  Created installer user");
  }

  installer = await api(`/users/${installer.id}`, {
    method: "PUT",
    token: admin.token,
    body: {
      email: INSTALLER_EMAIL,
      fullName: INSTALLER_NAME,
      role: "Installer",
      office: "Australia",
      isActive: true,
      isFirstLogin: false,
      password: INSTALLER_PASSWORD,
    },
  });
  await login(INSTALLER_EMAIL, INSTALLER_PASSWORD);
  console.log("  Installer ready:", INSTALLER_EMAIL);
  return installer;
}

async function ensureProject(admin) {
  const list = await api("/projects", { token: admin.token });
  let project = list.items?.find((p) => p.jobNumber === TRAINING_JOB);
  if (!project) {
    project = await api("/projects", {
      method: "POST",
      token: admin.token,
      body: {
        id: "proj-installer-manual-demo",
        customerName: "BHP/Mining",
        customerId: "cust-bhp-mining",
        jobNumber: TRAINING_JOB,
        purchaseOrderNumber: "PO-TRAIN-01",
        description: "Installer training demo job",
        startDate: "2026-01-01T00:00:00.000Z",
        finishDate: "2026-12-31T00:00:00.000Z",
        office: "Australia",
        officeId: "office-strata-newcastle",
        status: "Active",
        projectType: "Installation",
        isInstallationProject: true,
        workflowMode: "INSTALLATION_ONLY",
        productIds: ["prod-chambers"],
        teamMemberIds: [],
      },
    });
    console.log("  Created training project:", TRAINING_JOB);
  }
  return project;
}

async function findAssetByTag(admin, projectId, assetTag) {
  const assets = await api(`/project-assets/by-project/${projectId}`, { token: admin.token });
  return assets.find((a) => a.assetTag === assetTag);
}

async function ensureAsset(admin, project, { assetTag, assetName, location, assignedUserId }) {
  const existing = await findAssetByTag(admin, project.id, assetTag);
  if (existing) {
    const needsUpdate =
      existing.assignedUserId !== assignedUserId || existing.status !== "NotStarted";
    if (needsUpdate) {
      return api(`/project-assets/${existing.id}`, {
        method: "PUT",
        token: admin.token,
        body: { ...existing, assignedUserId, status: "NotStarted" },
      });
    }
    return existing;
  }
  return api("/project-assets", {
    method: "POST",
    token: admin.token,
    body: {
      projectId: project.id,
      productId: "prod-chambers",
      assetTag,
      assetName,
      location,
      assignedUserId,
      status: "NotStarted",
    },
  });
}

async function ensureTrainingWorkflow(admin) {
  const configs = await api("/workflow-configs/by-product/prod-chambers", { token: admin.token });
  let config = configs.find((c) => c.name === TRAINING_WORKFLOW_NAME);

  if (!config) {
    config = await api("/workflow-configs", {
      method: "POST",
      token: admin.token,
      body: {
        productId: "prod-chambers",
        name: TRAINING_WORKFLOW_NAME,
        displayName: "Installer manual demo (1 step)",
        configType: "Installation",
        workflowTypeId: "wftype-installation",
        stepsJson: buildTrainingStepsJson("prod-chambers"),
        mediaJson: "[]",
        featureSelectionsJson: "[]",
      },
    });
    console.log("  Created training workflow config");
  }

  if (config.status !== "Published") {
    config = await api(`/workflow-configs/${config.id}/publish`, {
      method: "POST",
      token: admin.token,
    });
    console.log("  Published training workflow");
  }
  return config;
}

async function assignWorkflow(admin, assetId, workflowConfigId, workflowTypeId) {
  const existing = await api(`/asset-workflow-assignments/by-asset/${assetId}`, {
    token: admin.token,
  }).catch(() => []);

  if (existing.some((a) => a.workflowConfigId === workflowConfigId && a.active)) return;

  await api("/asset-workflow-assignments", {
    method: "POST",
    token: admin.token,
    body: {
      assetId,
      workflowConfigId,
      workflowTypeId,
    },
  });
}

async function setupDemo() {
  console.log("Setting up demo data…");
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const installer = await ensureInstaller(admin);
  const project = await ensureProject(admin);
  const users = await api("/users", { token: admin.token });
  const pm = users.find((u) => u.role === "Project Manager");

  const trainingWorkflow = await ensureTrainingWorkflow(admin);

  const assetMine = await ensureAsset(admin, project, {
    assetTag: "IM-TRAIN-01",
    assetName: "Training Zone Controller",
    location: "North Pit",
    assignedUserId: installer.id,
  });
  const assetOther = await ensureAsset(admin, project, {
    assetTag: "IM-TRAIN-02",
    assetName: "Training RF Module",
    location: "South Pit",
    assignedUserId: pm?.id,
  });
  const assetDemo = await ensureAsset(admin, project, {
    assetTag: "IM-TRAIN-DEMO",
    assetName: "Sign-off Demo Asset",
    location: "Training Bay",
    assignedUserId: installer.id,
  });

  for (const asset of [assetMine, assetOther, assetDemo]) {
    await assignWorkflow(admin, asset.id, trainingWorkflow.id, trainingWorkflow.workflowTypeId);
  }

  console.log("  Demo assets ready:", assetMine.assetTag, assetOther.assetTag, assetDemo.assetTag);
  return {
    installerEmail: INSTALLER_EMAIL,
    installerPassword: INSTALLER_PASSWORD,
    assetMine,
    assetOther,
    assetDemo,
    project,
  };
}

async function dismissOnboarding(page) {
  for (let i = 0; i < 3; i++) {
    const skip = page.getByRole("button", { name: /skip for now/i }).first();
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(400);
    } else break;
  }
}

async function dismissNotifications(page) {
  const ack = page.getByRole("button", { name: /^acknowledge$/i }).first();
  if (await ack.isVisible().catch(() => false)) {
    await ack.click();
    await page.waitForTimeout(400);
  }
}

function assetRow(page, assetTag) {
  return page.locator("tr", { has: page.getByText(assetTag, { exact: true }) }).first();
}

function rowStartRunButton(row) {
  return row.locator("button").filter({ hasText: "Start Run" }).first();
}

async function loginPage(page, email, password) {
  await page.goto(WEB);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.locator(".app-shell").waitFor({ timeout: 60000 });
  await dismissOnboarding(page);
}

async function shot(page, name, opts = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name), ...opts });
  console.log("  📸", name);
}

async function fillVisibleInputs(page) {
  for (const input of await page.locator('input[type="text"]').all()) {
    if (await input.isVisible().catch(() => false)) {
      await input.fill("Training demo");
    }
  }
  for (const input of await page.locator('input[type="number"]').all()) {
    if (await input.isVisible().catch(() => false)) {
      await input.fill("1");
    }
  }
  for (const input of await page.locator('input[type="date"]').all()) {
    if (await input.isVisible().catch(() => false)) {
      await input.fill("2026-09-18");
    }
  }
  for (const cb of await page.locator('input[type="checkbox"]').all()) {
    if (await cb.isVisible().catch(() => false) && !(await cb.isChecked().catch(() => true))) {
      await cb.check().catch(() => {});
    }
  }
  for (const combo of await page.locator('[role="combobox"]').all()) {
    if (!(await combo.isVisible().catch(() => false))) continue;
    await combo.click().catch(() => {});
    const option = page.getByRole("option").first();
    if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
      await option.click();
    }
  }
}

async function startRunFromAssetsRow(page, assetTag) {
  await page.goto(`${WEB}/installations/assets`, { waitUntil: "domcontentloaded" });
  await dismissNotifications(page);
  await page.waitForTimeout(5000);
  const row = assetRow(page, assetTag);
  await row.waitFor({ timeout: 15000 });
  const startBtn = row.locator("button").filter({ hasText: /Start Run|Continue Run|Resume Run/ }).first();
  await startBtn.waitFor({ timeout: 30000 });
  await startBtn.click();
  await page.waitForTimeout(1000);
}

async function startRunFromDashboard(page, assetTag) {
  await page.goto(WEB);
  await page.waitForTimeout(2000);
  await dismissNotifications(page);
  const jobsSection = page.locator("div").filter({ has: page.getByText("My Jobs Today") }).first();
  await jobsSection.waitFor({ timeout: 15000 });
  const jobCards = jobsSection.locator("button").filter({ hasText: /Start Run|Continue Run|Resume Run/ });
  const cardCount = await jobCards.count();
  let clicked = false;
  for (let i = 0; i < cardCount; i++) {
    const btn = jobCards.nth(i);
    const cardText = await btn.locator("xpath=ancestor::*[contains(@class,'MuiPaper-root')][1]").innerText();
    if (cardText.includes(assetTag)) {
      await btn.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) throw new Error(`No dashboard job card found for ${assetTag}`);
  await page.waitForTimeout(2000);
}

async function confirmTakeoverIfShown(page, { confirm = false } = {}) {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible({ timeout: 2000 }).catch(() => false))) return false;
  const isTakeover = await dialog
    .getByText(/assigned to someone else|Unassigned asset/i)
    .isVisible()
    .catch(() => false);
  if (!isTakeover) return false;
  if (confirm) {
    await page.getByRole("button", { name: /Assign to me/i }).click();
    await page.waitForTimeout(1200);
  }
  return true;
}

async function openRunnerSetup(page) {
  await page.getByRole("dialog").filter({ hasText: "Run workflow" }).waitFor({ timeout: 25000 });
}

async function enterRunnerSteps(page) {
  const dialog = page.getByRole("dialog").filter({ hasText: "Run workflow" });
  const go = dialog.locator("button").filter({ hasText: /Start ->|Continue ->/ }).first();
  await go.waitFor({ timeout: 10000 });
  await go.click();
  await page.waitForTimeout(1500);
}

async function captureScreenshots(demo) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  await loginPage(page, demo.installerEmail, demo.installerPassword);

  // Capture Project Assets first (hydration is reliable immediately after login).
  await page.goto(`${WEB}/installations/assets`, { waitUntil: "domcontentloaded" });
  await dismissNotifications(page);
  await page.waitForTimeout(5000);
  await shot(page, "03-project-assets.png");

  const takeoverBtn = rowStartRunButton(assetRow(page, "IM-TRAIN-02"));
  await takeoverBtn.waitFor({ timeout: 30000 });
  await takeoverBtn.click();
  await page.waitForTimeout(800);
  if (await confirmTakeoverIfShown(page)) {
    await shot(page, "04-takeover-dialog.png");
    await page.getByRole("button", { name: /cancel/i }).click();
    await page.waitForTimeout(500);
  }

  await page.goto(WEB);
  await page.waitForTimeout(1500);
  await dismissNotifications(page);
  await shot(page, "01-dashboard-my-installs.png");

  const myJobs = page.getByText("My Jobs Today").first();
  if (await myJobs.isVisible().catch(() => false)) {
    await myJobs.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shot(page, "02-my-jobs-today.png");
  }

  await startRunFromDashboard(page, "IM-TRAIN-01");
  await confirmTakeoverIfShown(page, { confirm: true });
  await openRunnerSetup(page);
  await shot(page, "05-workflow-setup.png");

  await enterRunnerSteps(page);
  await fillVisibleInputs(page);
  await page.waitForTimeout(500);
  await shot(page, "06-workflow-running.png");

  await startRunFromDashboard(page, "IM-TRAIN-DEMO");
  await confirmTakeoverIfShown(page, { confirm: true });
  await openRunnerSetup(page);
  await enterRunnerSteps(page);
  await fillVisibleInputs(page);
  const completeBtn = page.getByRole("button", { name: /^Complete$|Preview complete/i }).first();
  if (await completeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await completeBtn.click();
    await page.waitForTimeout(1500);
  }
  if (await page.getByText("Workflow complete").first().isVisible({ timeout: 10000 }).catch(() => false)) {
    await shot(page, "07-workflow-summary-lock.png");
    const lockBtn = page.getByRole("button", { name: /^Lock run$/i }).first();
    if (await lockBtn.isVisible().catch(() => false)) {
      await lockBtn.click();
      await page.waitForTimeout(1500);
    }
  }
  if (await page.getByText("Field sign-off").first().isVisible({ timeout: 10000 }).catch(() => false)) {
    const nameField = page.getByLabel(/your name/i).first();
    if (await nameField.isVisible().catch(() => false)) {
      await nameField.fill(INSTALLER_NAME);
    }
    const confirmBox = page.getByRole("checkbox").first();
    if (await confirmBox.isVisible().catch(() => false)) {
      await confirmBox.check().catch(() => {});
    }
    await page.waitForTimeout(400);
    await shot(page, "08-installer-sign-off.png");
  }

  await browser.close();
}

async function main() {
  console.log("Installer manual — setup & capture");
  console.log(`  API: ${API}`);
  console.log(`  Web: ${WEB}`);
  const demo = await setupDemo();
  await captureScreenshots(demo);
  console.log(`\nDone — screenshots in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
