import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.WC_SMOKE_API ?? "http://localhost:4000/api";
const EMAIL = process.env.WC_SMOKE_EMAIL ?? "admin@commtrac.local";
const PASSWORD = process.env.WC_SMOKE_PASSWORD ?? "Admin123!";

const CAD_RUN_ID = "run-cad-0039-1";
const CAD_ASSET_ID = "asset-cad-0039";
const CC_RUN_ID = "run-cc-0012-1";
const CC_ASSET_ID = "asset-cc-0012";

type ConsistencyReport = {
  runAt: string;
  passed: boolean;
  checks: string[];
  failures: string[];
};

async function login(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(res.ok(), `login failed (${res.status()})`).toBeTruthy();
  const body = (await res.json()) as { token?: string };
  expect(body.token, "login response missing token").toBeTruthy();
  return body.token!;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function parseStepResults(stepResultsJson: string): Array<{ stepId: string; values: Record<string, string> }> {
  return JSON.parse(stepResultsJson) as Array<{ stepId: string; values: Record<string, string> }>;
}

test.describe("Workflow consistency smoke — API server truth", () => {
  test("step save persists; resolving all issues clears asset Issue status", async ({ request }) => {
    const checks: string[] = [];
    const failures: string[] = [];

    const token = await login(request);
    const headers = authHeaders(token);

    const cadRunRes = await request.get(`${API_BASE}/asset-workflow-runs/${CAD_RUN_ID}`, { headers });
    expect(cadRunRes.ok()).toBeTruthy();
    const cadRun = (await cadRunRes.json()) as { stepResultsJson: string; status: string };
    checks.push("CAD-0039 run readable");

    const ccAssetBefore = await request.get(`${API_BASE}/project-assets/${CC_ASSET_ID}`, { headers });
    expect(ccAssetBefore.ok()).toBeTruthy();
    const ccAssetBody = (await ccAssetBefore.json()) as { status: string };
    expect(ccAssetBody.status).toBe("Issue");
    checks.push("CC-0012 asset starts in Issue status");

    const ccRunRes = await request.get(`${API_BASE}/asset-workflow-runs/${CC_RUN_ID}`, { headers });
    expect(ccRunRes.ok()).toBeTruthy();
    const ccRun = (await ccRunRes.json()) as { issuesJson: string };
    checks.push("CC-0012 run readable with open issues");

    const stepResults = parseStepResults(cadRun.stepResultsJson);
    const newSerial = `SN-SMOKE-${Date.now()}`;
    stepResults[0] = {
      ...stepResults[0],
      values: { ...stepResults[0].values, "cap-serial": newSerial },
    };

    const saveRes = await request.put(`${API_BASE}/asset-workflow-runs/${CAD_RUN_ID}`, {
      headers,
      data: {
        stepResultsJson: JSON.stringify(stepResults),
        status: cadRun.status,
      },
    });
    expect(saveRes.ok(), `step save failed (${saveRes.status()})`).toBeTruthy();
    checks.push("CAD-0039 step-only save accepted");

    const cadRunAfter = await request.get(`${API_BASE}/asset-workflow-runs/${CAD_RUN_ID}`, { headers });
    expect(cadRunAfter.ok()).toBeTruthy();
    const cadAfterBody = (await cadRunAfter.json()) as { stepResultsJson: string };
    const afterSteps = parseStepResults(cadAfterBody.stepResultsJson);
    if (afterSteps[0]?.values["cap-serial"] !== newSerial) {
      failures.push("Step save did not persist serial on second GET");
    } else {
      checks.push("CAD-0039 step save visible on follow-up GET");
    }

    const issues = JSON.parse(ccRun.issuesJson) as Array<Record<string, unknown>>;
    const resolvedIssues = issues.map((issue) => ({
      ...issue,
      resolved: true,
      resolvedAt: new Date().toISOString(),
      resolutionNote: "Workflow consistency smoke resolve",
    }));

    const patchIssuesRes = await request.patch(`${API_BASE}/asset-workflow-runs/${CC_RUN_ID}/issues`, {
      headers,
      data: { issuesJson: JSON.stringify(resolvedIssues) },
    });
    expect(patchIssuesRes.ok(), `patch issues failed (${patchIssuesRes.status()})`).toBeTruthy();
    checks.push("CC-0012 issues patched to resolved");

    const ccAssetAfter = await request.get(`${API_BASE}/project-assets/${CC_ASSET_ID}`, { headers });
    expect(ccAssetAfter.ok()).toBeTruthy();
    const ccAfterBody = (await ccAssetAfter.json()) as { status: string };
    if (ccAfterBody.status === "Issue") {
      failures.push(`CC-0012 asset status still Issue after resolving all run issues (got ${ccAfterBody.status})`);
    } else if (ccAfterBody.status !== "InProgress") {
      failures.push(`CC-0012 asset status expected InProgress after resolve, got ${ccAfterBody.status}`);
    } else {
      checks.push("CC-0012 asset status cleared from Issue to InProgress");
    }

    const byAssetRes = await request.get(`${API_BASE}/asset-workflow-runs/by-asset/${CAD_ASSET_ID}`, { headers });
    expect(byAssetRes.ok()).toBeTruthy();
    const byAssetRuns = (await byAssetRes.json()) as Array<{ id: string }>;
    if (!byAssetRuns.some((r) => r.id === CAD_RUN_ID)) {
      failures.push("by-asset listing missing CAD-0039 active run");
    } else {
      checks.push("by-asset listing includes CAD-0039 run");
    }

    const report: ConsistencyReport = {
      runAt: new Date().toISOString(),
      passed: failures.length === 0,
      checks,
      failures,
    };
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));

    expect(failures, failures.join("\n")).toHaveLength(0);
  });
});

function writeReport(report: ConsistencyReport) {
  const dir = path.join(process.cwd(), "e2e-results");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "workflow-consistency-smoke-report.json"),
    JSON.stringify(report, null, 2),
  );
}
