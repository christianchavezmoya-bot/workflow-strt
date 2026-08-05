import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../types/projectAsset";
import type { WorkflowConfig } from "../types/workflowConfig";
import type { WorkflowAssignment } from "../types/workflowType";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import { buildStandaloneCaptureJobColumns, type CaptureAssetJobColumnContext } from "./captureAssetJobColumns";

const asset = {
  id: "a1",
  projectId: "p1",
  productId: "prod1",
  assetTag: "CAD-0053",
  status: "InProgress",
  featureValuesJson: "[]",
  issuesJson: "[]",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  productConfigId: "wc-aim",
  workflowSummary: { hasWorkflow: true },
} as ProjectAsset;

const aimConfig: WorkflowConfig = {
  id: "wc-aim",
  productId: "prod1",
  name: "AIM-100 Install",
  displayName: "AIM-100 Install - 4 steps data collection",
  version: 1,
  status: "Published",
  configType: "Install",
  stepsJson: "[]",
  mediaJson: "[]",
  featureSelectionsJson: "[]",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function ctx(
  overrides: Partial<CaptureAssetJobColumnContext> = {},
): CaptureAssetJobColumnContext {
  return {
    projectMap: new Map(),
    userMap: new Map(),
    assignmentsMap: {},
    runsMap: {},
    workflowConfigMap: new Map([["wc-aim", aimConfig]]),
    ...overrides,
  };
}

function workflowColumnValue(
  testAsset: ProjectAsset,
  context: CaptureAssetJobColumnContext,
): string {
  const columns = buildStandaloneCaptureJobColumns(context);
  const workflowCol = columns.find((column) => column.id === "workflow");
  return workflowCol?.valueFor(testAsset) ?? "";
}

describe("buildStandaloneCaptureJobColumns workflow column", () => {
  it("resolves workflow name from run config when assignments are empty", () => {
    const run: AssetWorkflowRun = {
      id: "run-1",
      assetId: "a1",
      workflowConfigId: "wc-aim",
      workflowVersion: 1,
      status: "InProgress",
      isLocked: false,
      startedAt: "2026-01-01",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      stepResultsJson: "[]",
      workflowSnapshotJson: "{}",
      issuesJson: "[]",
      timeTrackingJson: "[]",
      productiveSeconds: 0,
      downtimeSeconds: 0,
      downtimeEvents: 0,
      runNumber: 1,
      signatureStatus: "None",
    };
    expect(workflowColumnValue(asset, ctx({ runsMap: { a1: [run] } }))).toBe(
      "AIM-100 Install - 4 steps data collection",
    );
  });

  it("dedupes repeated assignment names for the same config", () => {
    const duplicateAssignments: WorkflowAssignment[] = [
      {
        id: "as1",
        assetId: "a1",
        workflowConfigId: "wc-aim",
        workflowTypeId: "wt1",
        workflowTypeName: "Install",
        workflowConfigName: "AIM-100 Install - 4 steps data collection",
        active: true,
        assignedAt: "2026-01-01",
      },
      {
        id: "as2",
        assetId: "a1",
        workflowConfigId: "wc-aim",
        workflowTypeId: "wt1",
        workflowTypeName: "Install",
        workflowConfigName: "AIM-100 Install - 4 steps data collection",
        active: false,
        assignedAt: "2026-01-01",
      },
      {
        id: "as3",
        assetId: "a1",
        workflowConfigId: "wc-aim",
        workflowTypeId: "wt1",
        workflowTypeName: "Install",
        workflowConfigName: "AIM-100 Install - 4 steps data collection",
        active: false,
        assignedAt: "2026-01-01",
      },
    ];
    expect(
      workflowColumnValue(asset, ctx({ assignmentsMap: { a1: duplicateAssignments } })),
    ).toBe("AIM-100 Install - 4 steps data collection");
  });

  it('falls back to "No workflow" when nothing is configured', () => {
    const bare = {
      ...asset,
      productConfigId: undefined,
      workflowSummary: { hasWorkflow: false },
    } as ProjectAsset;
    expect(workflowColumnValue(bare, ctx())).toBe("No workflow");
  });
});
