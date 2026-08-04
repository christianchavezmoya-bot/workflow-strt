import { test, expect, type Page, type Response } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EMAIL = process.env.PM_SMOKE_EMAIL ?? "jose.lopez@strataworldwide.com";
const PASSWORD = process.env.PM_SMOKE_PASSWORD ?? "jose123!";
const JOB_NUMBER = process.env.PM_SMOKE_JOB ?? "JO00991";
const ASSET_TAG = process.env.PM_SMOKE_ASSET ?? "CAD-0039";
const ISSUE_ASSET_TAG = process.env.PM_SMOKE_ISSUE_ASSET ?? "CC-0012";

type ApiCall = { path: string; status: number; ms: number; method: string };
type PerfReport = {
  runAt: string;
  email: string;
  jobNumber: string;
  assetTag: string;
  issueAssetTag: string;
  steps: Record<string, number | string | null>;
  apiCalls: ApiCall[];
  slowestApi: ApiCall[];
  findings: string[];
  passed: boolean;
};

function attachApiRecorder(page: Page, bucket: ApiCall[]) {
  page.on("response", (res: Response) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    try {
      const parsed = new URL(url);
      const timing = res.request().timing();
      const ms = timing.responseEnd > 0 && timing.requestStart >= 0
        ? Math.round(timing.responseEnd - timing.requestStart)
        : -1;
      bucket.push({
        path: parsed.pathname.replace(/^\/api/, ""),
        status: res.status(),
        ms,
        method: res.request().method(),
      });
    } catch {
      /* ignore */
    }
  });
}

async function dismissOnboarding(page: Page) {
  for (let i = 0; i < 3; i += 1) {
    const welcome = page.getByRole("heading", { name: /welcome/i });
    const skipTour = page.getByRole("button", { name: /skip for now/i }).first();
    const hasDialog = await welcome.isVisible().catch(() => false)
      || await skipTour.isVisible().catch(() => false);
    if (!hasDialog) return;
    if (await skipTour.isVisible().catch(() => false)) {
      await skipTour.click();
      await page.waitForTimeout(400);
    } else {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  }
}

async function login(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 30_000 });
  await dismissOnboarding(page);
}

test.describe("PM field smoke — JO00991 capture + issues", () => {
  test("login, capture edits, resolve blocking issue with perf metrics", async ({ page }) => {
    const apiCalls: ApiCall[] = [];
    const findings: string[] = [];
    attachApiRecorder(page, apiCalls);

    const report: PerfReport = {
      runAt: new Date().toISOString(),
      email: EMAIL,
      jobNumber: JOB_NUMBER,
      assetTag: ASSET_TAG,
      issueAssetTag: ISSUE_ASSET_TAG,
      steps: {},
      apiCalls: [],
      slowestApi: [],
      findings: [],
      passed: false,
    };

    const markUnacceptable = (msg: string, ms?: number) => {
      findings.push(ms != null ? `${msg} (${ms} ms)` : msg);
    };

    // ── Login ──
    const loginStart = Date.now();
    await login(page);
    report.steps.loginMs = Date.now() - loginStart;
    if ((report.steps.loginMs as number) > 5000) {
      markUnacceptable("Login took longer than 5s — feels sluggish for a professional app", report.steps.loginMs as number);
    }

    // ── Assets page ──
    const assetsNavStart = Date.now();
    await page.goto("/installations/assets");
    await expect(page.locator(".app-content")).toBeVisible({ timeout: 30_000 });
    await dismissOnboarding(page);
    report.steps.assetsShellMs = Date.now() - assetsNavStart;

    // Wait for project dropdown
    const projectSelect = page.locator('[role="combobox"]').filter({ has: page.locator('text=Project') }).first();
    if (await projectSelect.count() === 0) {
      await expect(page.getByText("Project").first()).toBeVisible({ timeout: 30_000 });
    }
    const projectCombo = page.locator('div.MuiFormControl-root').filter({ hasText: /^Project/ }).getByRole("combobox").first();
    await expect(projectCombo).toBeVisible({ timeout: 30_000 });

    const projectPickStart = Date.now();
    await projectCombo.click();
    const jobOption = page.getByRole("option", { name: new RegExp(JOB_NUMBER, "i") });
    const hasJob = await jobOption.count();
    if (hasJob === 0) {
      findings.push(`Project ${JOB_NUMBER} not found in dropdown — cannot run field scenario in this environment`);
      report.findings = findings;
      report.apiCalls = apiCalls;
      report.slowestApi = [...apiCalls].sort((a, b) => b.ms - a.ms).slice(0, 15);
      writeReport(report);
      test.skip(true, `Project ${JOB_NUMBER} not available`);
      return;
    }
    await jobOption.first().click();
    report.steps.projectSelectMs = Date.now() - projectPickStart;
    if ((report.steps.projectSelectMs as number) > 5000) {
      markUnacceptable("Project dropdown open/select took >5s — MUI select feels stuck", report.steps.projectSelectMs as number);
    } else if ((report.steps.projectSelectMs as number) > 2000) {
      markUnacceptable("Project dropdown open/select took >2s — noticeable delay before data load starts", report.steps.projectSelectMs as number);
    } else if (process.env.PM_SMOKE_STRICT === "1" && (report.steps.projectSelectMs as number) > 300) {
      markUnacceptable("Project dropdown open/select took >300ms (Phase 2 target)", report.steps.projectSelectMs as number);
    }

    const assetsLoadApiStart = apiCalls.length;
    const assetsLoadStart = Date.now();
    await page.waitForFunction(() => {
      const spinner = document.querySelector(".MuiCircularProgress-root");
      const table = document.querySelector("table");
      const empty = document.body.textContent?.includes("No assets added");
      const capture = document.body.textContent?.includes("Capture");
      return Boolean(table || empty || capture || !spinner);
    }, undefined, { timeout: 120_000 }).catch(() => {});
    report.steps.assetsContentMs = Date.now() - assetsLoadStart;

    const assetsLoadApiCalls = apiCalls.slice(assetsLoadApiStart);
    const byProductDuringProjectLoad = assetsLoadApiCalls.filter(
      (c) => c.method === "GET" && c.path.includes("/project-assets/by-product/"),
    );
    report.steps.assetsLoadByProductCount = byProductDuringProjectLoad.length;
    if (byProductDuringProjectLoad.length > 0) {
      markUnacceptable(`Project-scoped assets load still triggered ${byProductDuringProjectLoad.length} by-product call(s) (Phase 2)`);
    }

    if ((report.steps.assetsContentMs as number) > 8000) {
      markUnacceptable("Assets page content took >8s after project select — unacceptable for daily PM use", report.steps.assetsContentMs as number);
    } else if ((report.steps.assetsContentMs as number) > 3000) {
      markUnacceptable("Assets page content took >3s — noticeable delay on large jobs", report.steps.assetsContentMs as number);
    }

    const emptyBanner = page.getByText(/No assets added/i);
    if (await emptyBanner.count()) {
      markUnacceptable('Assets page shows "No assets added" — false empty or slow load (known JO00991 issue class)');
    }

    // ── Capture view ──
    const captureToggleStart = Date.now();
    const captureBtn = page.getByRole("button", { name: "Capture", exact: true });
    await expect(captureBtn).toBeVisible({ timeout: 15_000 });
    await captureBtn.click();
    await expect(page.locator("table")).toBeVisible({ timeout: 60_000 });
    report.steps.captureViewMs = Date.now() - captureToggleStart;

    if ((report.steps.captureViewMs as number) > 5000) {
      markUnacceptable("Switching to Capture view took >5s — spreadsheet render too slow", report.steps.captureViewMs as number);
    }

    // Filter to asset (capture view has its own search field)
    const searchField = page.getByPlaceholder(/Search asset, feature/i);
    await expect(searchField).toBeVisible({ timeout: 10_000 });
    await searchField.fill("");
    // Hyphenated tags fail word-start search (Phase 5); use prefix until fixed.
    const searchTerm = ASSET_TAG.includes("-") ? ASSET_TAG.split("-")[0] : ASSET_TAG;
    await searchField.fill(searchTerm);
    await page.waitForTimeout(600);

    await expect(page.getByText(ASSET_TAG, { exact: true }).first()).toBeVisible({ timeout: 20_000 }).catch(() => {});
    const assetRow = page.locator("tbody tr").filter({ hasText: ASSET_TAG }).first();
    if (await assetRow.count() === 0) {
      findings.push(`Asset ${ASSET_TAG} not visible in capture table after search`);
    } else {
      // Edit up to 3 editable cells in that row
      const inputs = assetRow.locator("input:not([type='checkbox']):not([disabled])");
      const inputCount = await inputs.count();
      const edits = Math.min(3, inputCount);
      report.steps.captureEditableInputs = edits;
      const captureApiStartIndex = apiCalls.length;

      for (let i = 0; i < edits; i += 1) {
        const input = inputs.nth(i);
        const keyStart = Date.now();
        const stamp = `e2e-${Date.now()}-${i}`;
        await input.click();
        await input.fill(stamp);
        const keyMs = Date.now() - keyStart;
        report.steps[`captureKeystroke${i + 1}Ms`] = keyMs;
        if (keyMs > 300) {
          markUnacceptable(`Capture cell ${i + 1} keystroke/fill felt laggy (>300ms)`, keyMs);
        }

        const saveStart = Date.now();
        await input.blur();
        // wait for saving spinner to clear or PATCH to finish
        await page.waitForFunction(() => {
          const spinners = document.querySelectorAll(".MuiCircularProgress-root");
          return spinners.length === 0;
        }, undefined, { timeout: 30_000 }).catch(() => {});
        const saveMs = Date.now() - saveStart;
        report.steps[`captureSave${i + 1}Ms`] = saveMs;
        if (saveMs > 2500) {
          markUnacceptable(`Capture cell ${i + 1} save on blur took >2.5s — too slow for spreadsheet editing`, saveMs);
        } else if (process.env.PM_SMOKE_STRICT === "1" && saveMs > 100) {
          markUnacceptable(`Capture cell ${i + 1} save on blur took >100ms (Phase 1 target)`, saveMs);
        }
      }

      const captureApiCalls = apiCalls.slice(captureApiStartIndex);
      const capturePatches = captureApiCalls.filter(
        (c) => c.method === "PATCH" && (c.path.includes("capture-cell") || c.path.includes("step-results")),
      );
      report.steps.capturePatchCount = capturePatches.length;
      const usedCaptureCell = capturePatches.some((c) => c.path.includes("capture-cell"));
      const usedFullStepResults = capturePatches.some((c) => c.path.includes("step-results"));
      report.steps.captureUsedCellEndpoint = usedCaptureCell;
      if (edits > 0 && !usedCaptureCell) {
        markUnacceptable("Capture edits did not use PATCH capture-cell endpoint");
      }
      if (usedFullStepResults) {
        markUnacceptable("Capture edits still used full step-results PATCH (288KB blob path)");
      }
      const refetchAfterBlur = captureApiCalls.filter(
        (c) => c.method === "GET" && (c.path.includes("by-project") || c.path.includes("by-product")),
      );
      if (refetchAfterBlur.length > 0) {
        markUnacceptable(`Capture blur triggered ${refetchAfterBlur.length} by-project/by-product refetch(es)`);
      }
    }

    // ── Issues page ──
    const issuesNavStart = Date.now();
    await page.goto("/issues");
    await expect(page.getByRole("heading", { name: /issues board/i })).toBeVisible({ timeout: 30_000 });
    report.steps.issuesShellMs = Date.now() - issuesNavStart;

    const issuesLoadStart = Date.now();
    await page.waitForFunction(() => {
      const spinner = document.querySelector(".MuiCircularProgress-root");
      const rows = document.querySelectorAll("table tbody tr");
      return rows.length > 0 || !spinner;
    }, undefined, { timeout: 60_000 }).catch(() => {});
    report.steps.issuesContentMs = Date.now() - issuesLoadStart;

    if ((report.steps.issuesContentMs as number) > 5000) {
      markUnacceptable("Issues board load took >5s", report.steps.issuesContentMs as number);
    }

    const issueRow = page.locator("tr", { hasText: ISSUE_ASSET_TAG }).first();
    if (await issueRow.count() === 0) {
      findings.push(`No issue row found for asset tag ${ISSUE_ASSET_TAG}`);
    } else {
      const expandStart = Date.now();
      await issueRow.click();
      const note = page.getByPlaceholder(/Describe what was done/i);
      await expect(note).toBeVisible({ timeout: 10_000 });
      report.steps.issueExpandMs = Date.now() - expandStart;

      await note.fill(`E2E resolved ${new Date().toISOString()}`);
      const closeStart = Date.now();
      await page.getByRole("button", { name: /^Close Issue$/i }).click();
      await page.waitForFunction(() => {
        const closing = document.body.textContent?.includes("Closing…");
        return !closing;
      }, undefined, { timeout: 30_000 }).catch(() => {});
      report.steps.issueCloseMs = Date.now() - closeStart;

      if ((report.steps.issueCloseMs as number) > 3000) {
        markUnacceptable("Close Issue save took >3s", report.steps.issueCloseMs as number);
      }
    }

    report.apiCalls = apiCalls;
    report.slowestApi = [...apiCalls].sort((a, b) => b.ms - a.ms).slice(0, 20);

    const dashboardWorkspaceCalls = apiCalls.filter(
      (c) => c.method === "GET" && c.path.includes("dashboard-workspace"),
    );
    report.steps.dashboardWorkspaceCount = dashboardWorkspaceCalls.length;
    if (dashboardWorkspaceCalls.length > 0) {
      markUnacceptable(`PM smoke triggered ${dashboardWorkspaceCalls.length} dashboard-workspace fetch(es) (Phase 4)`);
    }

    const inspectionImport500s = apiCalls.filter(
      (c) => c.path.includes("/inspection-imports") && c.status >= 500,
    );
    report.steps.inspectionImport500Count = inspectionImport500s.length;
    if (inspectionImport500s.length > 0) {
      markUnacceptable(`PM smoke saw ${inspectionImport500s.length} inspection-imports HTTP 500 (Phase 4)`);
    }

    report.steps.totalApiCallCount = apiCalls.length;
    if (process.env.PM_SMOKE_STRICT === "1" && apiCalls.length >= 40) {
      markUnacceptable(`Total API calls ${apiCalls.length} — Phase 4 target is < 40`);
    }

    for (const call of report.slowestApi) {
      if (call.ms > 2000 && call.ms > 0) {
        findings.push(`Slow API: ${call.method} ${call.path} → ${call.ms} ms (${call.status})`);
      }
    }

    report.findings = findings;
    report.passed = findings.length === 0;
    writeReport(report);

    console.log(JSON.stringify(report, null, 2));
    if (process.env.PM_SMOKE_STRICT === "1") {
      expect(findings, findings.join("\n")).toHaveLength(0);
    }
  });
});

function writeReport(report: PerfReport) {
  const dir = path.join(process.cwd(), "e2e-results");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "pm-field-smoke-report.json"), JSON.stringify(report, null, 2));
}
