#!/usr/bin/env node
/**
 * Seed JO00991 + CAD-0039 + CC-0012 for PM field Playwright smoke.
 * Usage: node scripts/seed-pm-smoke-data.mjs
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const dbPath = path.join(process.cwd(), "server/Commtrac.Api/commtrac.db");
const PRODUCT_ID = "00c3d07c-a925-4551-bc9b-ea8495acf3e5";
const FEATURE_ID = "088aa75d-fd13-4d99-bf18-07c4c95c21c9";

const stepsJson = JSON.stringify([
  {
    id: "step-capture-1",
    title: "Front Camera 1",
    stepFeatureId: FEATURE_ID,
    captureFields: [
      { id: "cap-serial", key: "serialNo", label: "Serial", type: "text", featureId: FEATURE_ID },
      { id: "cap-firmware", key: "firmware", label: "Firmware", type: "text", featureId: FEATURE_ID },
      { id: "cap-ip", key: "ipAddress", label: "IP Address", type: "text", featureId: FEATURE_ID },
    ],
  },
]);

const snapshotJson = JSON.stringify({ stepsJson });
const stepResultsJson = JSON.stringify([
  {
    stepId: "step-capture-1",
    values: { "cap-serial": "SN-OLD-1", "cap-firmware": "v1.0.0", "cap-ip": "10.0.0.39" },
    completedAt: "2026-08-01T00:00:00.000Z",
  },
]);

const ccIssueJson = JSON.stringify([
  {
    id: "issue-cc-0012-1",
    description: "Hydraulic leak blocking commissioning",
    issueType: "blocking",
    isBlocking: true,
    severity: "high",
    reportedAt: "2026-08-01T10:00:00.000Z",
    resolved: false,
  },
]);

function sql(strings, ...values) {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), "");
}

function run(query) {
  execFileSync("sqlite3", [dbPath, query], { stdio: "pipe" });
}

run(sql`
DELETE FROM AssetWorkflowRuns WHERE Id = 'run-cad-0039-1';
DELETE FROM AssetWorkflowAssignments WHERE Id IN ('assign-cad-0039','assign-cc-0012');
DELETE FROM ProjectAssets WHERE Id LIKE 'asset-filler-%';
DELETE FROM ProjectAssets WHERE Id IN ('asset-cad-0039','asset-cc-0012');
DELETE FROM WorkflowConfigs WHERE Id = 'wfconfig-smoke-1';
DELETE FROM Projects WHERE Id = 'proj-jo00991';
`);

run(sql`
INSERT INTO Projects (
  Id, CustomerName, CustomerId, JobNumber, Description, StartDate, FinishDate,
  Office, Region, ProjectType, Status, ApprovalDecision, IsInstallationProject,
  InstallationMode, ProjectManager, ContractValue, ProbabilityStage, ProductIds,
  ProductFeatureValuesJson, PurchaseOrderNumber, TeamMemberIdsJson, MinimumCompletionPercent,
  TimeZoneId, WorkflowMode, IsDeleted
) VALUES (
  'proj-jo00991', 'Yancoal', 'CUST-YANCOAL', 'JO00991', 'PM smoke test project',
  '2026-01-01', '2026-12-31', 'Australia', 'NSW', 'External', 'In Progress', 'Approved',
  1, 'Single Installation', 'Jose Lopez', 500000, 'Signed',
  '["${PRODUCT_ID}"]', '{}', '', '[]', 100,
  'Australia/Sydney', 'INSTALLATION_ONLY', 0
);
`);

run(sql`
INSERT INTO WorkflowConfigs (
  Id, ProductId, Name, DisplayName, ConfigType, WorkflowTypeId, Status, Version,
  StepsJson, MediaJson, FeatureSelectionsJson, CreatedAt, UpdatedAt
) VALUES (
  'wfconfig-smoke-1', '${PRODUCT_ID}', 'Smoke Install', 'Smoke Install', 'Installation',
  'wftype-installation', 'Published', 1,
  '${stepsJson.replace(/'/g, "''")}', '[]', '[]', datetime('now'), datetime('now')
);
`);

run(sql`
INSERT INTO ProjectAssets (
  Id, ProjectId, ProductId, AssetTag, AssetName, SerialNumber, Status,
  FeatureValuesJson, IssuesJson, AsBuiltJson, CreatedAt, UpdatedAt, IsDeleted
) VALUES
  ('asset-cad-0039', 'proj-jo00991', '${PRODUCT_ID}', 'CAD-0039', 'Shuttle Car', 'SN-CAD-0039', 'InProgress', '{}', '[]', '{}', datetime('now'), datetime('now'), 0),
  ('asset-cc-0012', 'proj-jo00991', '${PRODUCT_ID}', 'CC-0012', 'Continuous Miner', 'SN-CC-0012', 'Issue', '{}', '${ccIssueJson.replace(/'/g, "''")}', '{}', datetime('now'), datetime('now'), 0);
`);

run(sql`
INSERT INTO AssetWorkflowAssignments (Id, AssetId, WorkflowConfigId, WorkflowTypeId, Active, AssignedBy, AssignedAt) VALUES
  ('assign-cad-0039', 'asset-cad-0039', 'wfconfig-smoke-1', 'wftype-installation', 1, 'seed', datetime('now')),
  ('assign-cc-0012', 'asset-cc-0012', 'wfconfig-smoke-1', 'wftype-installation', 1, 'seed', datetime('now'));
`);

run(sql`
INSERT INTO AssetWorkflowRuns (
  Id, AssetId, WorkflowConfigId, WorkflowVersion, WorkflowSnapshotJson, Status, IsLocked,
  StepResultsJson, IssuesJson, TimeTrackingJson, SignatureStatus, RunNumber,
  StartedAt, CreatedAt, UpdatedAt
) VALUES (
  'run-cad-0039-1', 'asset-cad-0039', 'wfconfig-smoke-1', 1,
  '${snapshotJson.replace(/'/g, "''")}', 'InProgress', 0,
  '${stepResultsJson.replace(/'/g, "''")}', '[]', '[]', 'None', 1,
  datetime('now'), datetime('now'), datetime('now')
);
`);

for (let n = 1; n <= 150; n += 1) {
  const id = `asset-filler-${String(n).padStart(4, "0")}`;
  const tag = `FILL-${String(n).padStart(4, "0")}`;
  run(sql`
    INSERT INTO ProjectAssets (
      Id, ProjectId, ProductId, AssetTag, AssetName, Status,
      FeatureValuesJson, IssuesJson, AsBuiltJson, CreatedAt, UpdatedAt, IsDeleted
    ) VALUES (
      '${id}', 'proj-jo00991', '${PRODUCT_ID}', '${tag}', 'Filler ${n}', 'NotStarted',
      '{}', '[]', '{}', datetime('now'), datetime('now'), 0
    );
  `);
}

const summary = execFileSync("sqlite3", [dbPath, `
  SELECT 'project=' || JobNumber || ' assets=' || (SELECT COUNT(*) FROM ProjectAssets WHERE ProjectId='proj-jo00991')
  FROM Projects WHERE Id='proj-jo00991';
`], { encoding: "utf8" });
console.log("Seeded:", summary.trim());
