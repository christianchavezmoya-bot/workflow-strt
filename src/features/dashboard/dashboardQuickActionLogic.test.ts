import { describe, expect, it } from "vitest";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { OpenIssueRecord } from "../../services/assetWorkflowRunService";
import {
  canStartDirectlyFromDashboard,
  computeQuickActionAttention,
  getMyJobsCardActionFallback,
  type QuickActionAsset,
} from "./dashboardQuickActionLogic";

function asset(overrides: Partial<QuickActionAsset> = {}): QuickActionAsset {
  return {
    id: "asset-1",
    projectId: "project-1",
    assignedUserId: "user-1",
    assetTag: "TAG-001",
    assetName: "Asset",
    jobNumber: "JOB-1",
    status: "NotStarted",
    historyStatus: "current",
    workflowMode: "INSTALLATION",
    isDeleted: false,
    hasOpenIssues: false,
    totalSteps: 0,
    completedSteps: 0,
    missingItems: 0,
    ...overrides,
  };
}

function run(overrides: Partial<AssetWorkflowRun> = {}): AssetWorkflowRun {
  return {
    id: "run-1",
    assetId: "asset-1",
    workflowConfigId: "cfg-1",
    status: "InProgress",
    isLocked: false,
    startedAt: "2026-01-01T10:00:00Z",
    stepResultsJson: "[]",
    issuesJson: "[]",
    ...overrides,
  } as AssetWorkflowRun;
}

describe("canStartDirectlyFromDashboard", () => {
  const baseParams = {
    userId: "user-1",
    openIssues: [] as OpenIssueRecord[],
    pendingSigs: [],
    missingMediaFlags: [],
    technicianName: "Tech",
  };

  it("returns true for assigned self with single assignment and no blockers", () => {
    expect(canStartDirectlyFromDashboard({
      ...baseParams,
      asset: asset(),
      assignments: [{ id: "a1", workflowConfigId: "cfg-1" } as never],
      runs: [],
      productWorkflow: null,
    })).toBe(true);
  });

  it("returns false when assigned to another user", () => {
    expect(canStartDirectlyFromDashboard({
      ...baseParams,
      asset: asset({ assignedUserId: "other-user" }),
      assignments: [{ id: "a1", workflowConfigId: "cfg-1" } as never],
      runs: [],
      productWorkflow: null,
    })).toBe(false);
  });

  it("returns false when a blocking issue exists", () => {
    expect(canStartDirectlyFromDashboard({
      ...baseParams,
      asset: asset(),
      assignments: [{ id: "a1", workflowConfigId: "cfg-1" } as never],
      runs: [],
      productWorkflow: null,
      openIssues: [{
        assetId: "asset-1",
        isBlocking: true,
        issueId: "issue-1",
      } as OpenIssueRecord],
    })).toBe(false);
  });

  it("returns true for product workflow fallback when unassigned configs but product config exists", () => {
    expect(canStartDirectlyFromDashboard({
      ...baseParams,
      asset: asset(),
      assignments: [],
      runs: [],
      productWorkflow: { configId: "cfg-product", configName: "Install" },
    })).toBe(true);
  });
});

describe("computeQuickActionAttention", () => {
  it("returns empty attention when asset is null", () => {
    expect(computeQuickActionAttention({
      asset: null,
      runs: [],
      openIssues: [],
      pendingSigs: [],
      missingMediaFlags: [],
      technicianName: "Tech",
    })).toEqual({
      blockingIssues: [],
      highObservations: [],
      pendingSignature: null,
      missingMedia: null,
      activeRun: null,
      latestRun: null,
    });
  });

  it("surfaces active unlocked run", () => {
    const active = run({ id: "run-active", isLocked: false });
    const attention = computeQuickActionAttention({
      asset: asset(),
      runs: [active],
      openIssues: [],
      pendingSigs: [],
      missingMediaFlags: [],
      technicianName: "Tech",
    });
    expect(attention.activeRun?.id).toBe("run-active");
  });
});

describe("getMyJobsCardActionFallback", () => {
  it("routes missing media to missing-media action kind", () => {
    const action = getMyJobsCardActionFallback({
      asset: asset({ missingItems: 2, totalSteps: 5, completedSteps: 5 }),
      isNativePlatform: true,
      pendingSigs: [],
      missingMediaFlags: [],
    });
    expect(action.actionKind).toBe("missing-media");
    expect(action.buttonLabel).toBe("Add Photos");
  });
});
