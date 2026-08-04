import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../types/projectAsset";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import { reconcileWorkspaceItemWithLocal, type DashboardWorkspaceAssetItem } from "./projectAssetService";

function workspaceItem(overrides: Partial<DashboardWorkspaceAssetItem> = {}): DashboardWorkspaceAssetItem {
  return {
    id: "asset-1",
    projectId: "p1",
    jobNumber: "JO1",
    assetTag: "CAD-0057",
    status: "InProgress",
    historyStatus: "InProgress",
    completedSteps: 5,
    totalSteps: 8,
    missingItems: 0,
    workflowMode: "INSTALLATION_ONLY",
    isDeleted: false,
    hasOpenIssues: false,
    runStatus: "Paused",
    ...overrides,
  };
}

function localAsset(overrides: Partial<ProjectAsset> = {}): ProjectAsset {
  return {
    id: "asset-1",
    projectId: "p1",
    productId: "prod-1",
    assetTag: "CAD-0057",
    status: "InProgress",
    workflowSummary: {
      hasWorkflow: true,
      evidenceStatus: "InProgress",
      requiredItems: 8,
      completedItems: 5,
      missingItems: 0,
      latestRunStatus: "InProgress",
    },
    ...overrides,
  } as ProjectAsset;
}

describe("reconcileWorkspaceItemWithLocal", () => {
  it("prefers server runStatus over stale local summary when run is not dirty", () => {
    const item = workspaceItem({ runStatus: "Paused" });
    const asset = localAsset();
    const run = { id: "run-1", status: "InProgress", dirty: false } as AssetWorkflowRun & { dirty?: boolean };

    const next = reconcileWorkspaceItemWithLocal(item, asset, run);
    expect(next.runStatus).toBe("Paused");
  });

  it("prefers dirty local run status over server workspace", () => {
    const item = workspaceItem({ runStatus: "InProgress" });
    const asset = localAsset();
    const run = { id: "run-1", status: "Paused", dirty: true } as AssetWorkflowRun & { dirty?: boolean };

    const next = reconcileWorkspaceItemWithLocal(item, asset, run);
    expect(next.runStatus).toBe("Paused");
  });

  it("prefers server signatureStatus when local run is clean", () => {
    const item = workspaceItem({ signatureStatus: "PendingInstaller" });
    const asset = {
      ...localAsset(),
      workflowSummary: {
        hasWorkflow: true,
        evidenceStatus: "Running" as const,
        requiredItems: 8,
        completedItems: 5,
        missingItems: 0,
        latestRunStatus: "InProgress",
        latestRunLocked: false,
        hasOpenIssues: false,
        signatureStatus: "None",
      },
    } as ProjectAsset;

    const next = reconcileWorkspaceItemWithLocal(item, asset, undefined);
    expect(next.signatureStatus).toBe("PendingInstaller");
  });
});
