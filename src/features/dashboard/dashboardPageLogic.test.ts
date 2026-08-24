import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../../types/projectAsset";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import { getWorkflowDisplayState, type WorkflowDisplayState } from "../../utils/workflowDisplayState";
import {
  assetLikelyHasWorkflow,
  compactNativeActionLabel,
  dashboardStatusChip,
  fmtDate,
  formatMyJobsStepCompletionLabel,
  formatStepCompletionPercent,
  historyChipColor,
  isActiveAsset,
  isClosedAsset,
  isDashboardVisibleProjectStatus,
  isOpenInspectionStatus,
  isWaitingForSignature,
  myJobsAssetIdsKey,
  myJobsCardActionFromDisplayState,
  mergeMissingMediaFlagIntoCardAction,
  myJobsCardHelperTextFromDisplayState,
  pendingSignatureStageLabel,
  pendingSignatureStageText,
  pickActiveRunForAttention,
  workflowModeChipColor,
  workflowModeLabel,
} from "./dashboardPageLogic";

function asset(overrides: Partial<ProjectAsset> = {}): ProjectAsset {
  return {
    id: "asset-1",
    projectId: "project-1",
    productId: "product-1",
    assetTag: "TAG-001",
    assetName: "Asset",
    status: "InProgress",
    ...overrides,
  } as ProjectAsset;
}

function run(overrides: Partial<AssetWorkflowRun> = {}): AssetWorkflowRun {
  return {
    id: "run-1",
    assetId: "asset-1",
    workflowConfigId: "cfg-1",
    status: "InProgress",
    isLocked: false,
    stepResultsJson: "[]",
    issuesJson: "[]",
    ...overrides,
  } as AssetWorkflowRun;
}

describe("pickActiveRunForAttention", () => {
  it("returns null when a locked run is awaiting signature", () => {
    const runs = [
      run({ id: "run-open", isLocked: false }),
      run({ id: "run-pending", isLocked: true, signatureStatus: "PendingCustomer", status: "Complete" }),
    ];
    expect(pickActiveRunForAttention(runs)).toBeNull();
  });

  it("ignores offline-run ghost when locked completion exists for same config", () => {
    const runs = [
      run({ id: "offline-run-temp", isLocked: false, workflowConfigId: "cfg-1" }),
      run({ id: "run-done", isLocked: true, workflowConfigId: "cfg-1", status: "Complete" }),
    ];
    expect(pickActiveRunForAttention(runs)).toBeNull();
  });

  it("returns the unlocked run when no signature gate applies", () => {
    const open = run({ id: "run-open", isLocked: false });
    expect(pickActiveRunForAttention([open])).toEqual(open);
  });
});

describe("dashboardStatusChip", () => {
  it("shows red In Progress when hasOpenIssues is explicitly true", () => {
    expect(dashboardStatusChip({ status: "InProgress", hasOpenIssues: true })).toEqual({
      label: "In Progress",
      color: "error",
    });
  });

  it("maps Issue status to In Progress with error color by default", () => {
    expect(dashboardStatusChip({ status: "Issue" })).toEqual({
      label: "In Progress",
      color: "error",
    });
  });

  it("shows Missing for missing evidence", () => {
    expect(dashboardStatusChip({ status: "Complete", evidenceStatus: "MissingData" })).toEqual({
      label: "Missing",
      color: "error",
    });
  });

  it("shows Paused by user for paused run status", () => {
    expect(dashboardStatusChip({ runStatus: "Paused", status: "InProgress" })).toEqual({
      label: "Paused by user",
      color: "warning",
    });
  });

  it("shows Pending sign for pending asset status", () => {
    expect(dashboardStatusChip({ status: "Pending" })).toEqual({
      label: "Pending sign",
      color: "info",
    });
  });
});

describe("pending signature helpers", () => {
  it("labels installer and customer stages", () => {
    expect(pendingSignatureStageLabel("PendingInstaller")).toBe("Installer sign-off");
    expect(pendingSignatureStageLabel("PendingCustomer")).toBe("Customer sign-off");
    expect(pendingSignatureStageText("PendingInstaller")).toBe("Awaiting installer sign-off");
    expect(isWaitingForSignature("PendingCustomer")).toBe(true);
    expect(isWaitingForSignature("Signed")).toBe(false);
  });
});

describe("myJobsAssetIdsKey", () => {
  it("sorts ids for stable cache keys", () => {
    expect(
      myJobsAssetIdsKey([{ id: "b" }, { id: "a" }, { id: "c" }]),
    ).toBe("a,b,c");
  });
});

describe("assetLikelyHasWorkflow", () => {
  it("detects workflow from summary fields or cached asset metadata", () => {
    expect(assetLikelyHasWorkflow({ totalSteps: 0 })).toBe(false);
    expect(assetLikelyHasWorkflow({ totalSteps: 3 })).toBe(true);
    expect(assetLikelyHasWorkflow({ workflowSummary: { hasWorkflow: true } })).toBe(true);
    expect(assetLikelyHasWorkflow({ totalSteps: 0 }, asset({ productConfigId: "pc-1" }))).toBe(true);
  });
});

describe("myJobs card mapping from display state", () => {
  it("maps resolve-blocking action to error button and helper text", () => {
    const displayState = {
      action: {
        kind: "resolve-blocking" as const,
        label: "Resolve Blocking Issue",
        tooltip: "Resolve the blocking issue(s) before sign-off",
        color: "error" as const,
      },
      gates: { blockingIssueCount: 2, missingMediaCount: 0, openIssueCount: 2 },
      status: { label: "In Progress", key: "Issue" as const, color: "error" as const },
    } as WorkflowDisplayState;

    const action = myJobsCardActionFromDisplayState(displayState);
    expect(action.actionKind).toBe("resolve-blocking");
    expect(action.buttonColor).toBe("error");
    expect(myJobsCardHelperTextFromDisplayState(displayState)).toBe("2 blocking issues");
  });

  it("maps display state from getWorkflowDisplayState for continue runs", () => {
    const displayState = getWorkflowDisplayState(asset({ status: "InProgress" }), [run()], {
      hasRunnableWorkflowSource: true,
    });
    const action = myJobsCardActionFromDisplayState(displayState);
    expect(action.actionKind).toBe("default");
    expect(action.buttonLabel).toBe("Continue Run");
    expect(action.buttonColor).toBe("primary");
  });

  it("compacts native action labels", () => {
    expect(compactNativeActionLabel("Add Missing Photos")).toBe("Add Photos");
    expect(compactNativeActionLabel("Resolve 2 Blocking Issues")).toBe("Resolve Issues");
  });
});

describe("formatStepCompletionPercent", () => {
  it("returns null for zero total steps", () => {
    expect(formatStepCompletionPercent(1, 0)).toBeNull();
    expect(formatMyJobsStepCompletionLabel(1, 0)).toBeNull();
  });

  it("caps percent at 100", () => {
    expect(formatStepCompletionPercent(12, 10)).toBe("100% complete");
    expect(formatMyJobsStepCompletionLabel(12, 10)).toBe("100% completed");
  });
});

describe("workflowModeLabel and historyChipColor", () => {
  it("maps project workflow modes", () => {
    expect(workflowModeLabel("INSPECTION_ONLY")).toBe("Inspection");
    expect(workflowModeChipColor("MIXED")).toBe("warning");
    expect(workflowModeLabel(undefined)).toBe("Installation");
  });

  it("maps history chip colors", () => {
    expect(historyChipColor("Field Work Complete")).toBe("success");
    expect(historyChipColor("Cancelled")).toBe("warning");
    expect(historyChipColor("Closed")).toBe("info");
  });
});

describe("isDashboardVisibleProjectStatus", () => {
  it("hides cancelled, closed, and archived projects", () => {
    expect(isDashboardVisibleProjectStatus("Active")).toBe(true);
    expect(isDashboardVisibleProjectStatus("Cancelled")).toBe(false);
    expect(isDashboardVisibleProjectStatus(" closed ")).toBe(false);
    expect(isDashboardVisibleProjectStatus("Archived")).toBe(false);
  });
});

describe("status normalisation helpers", () => {
  it("treats spaced and underscored variants consistently", () => {
    expect(isActiveAsset("Not Started")).toBe(true);
    expect(isOpenInspectionStatus("on_hold")).toBe(true);
    expect(isClosedAsset("Closed")).toBe(true);
  });
});

describe("mergeMissingMediaFlagIntoCardAction", () => {
  it("overrides display-state action when local flag exists", () => {
    const base = {
      actionKind: "default" as const,
      chipLabel: "Complete",
      chipColor: "success" as const,
      buttonLabel: "Run Details",
      buttonColor: "inherit" as const,
      helperText: "Field work complete",
      widgets: [],
    };
    const merged = mergeMissingMediaFlagIntoCardAction(base, {
      id: "f1",
      runId: "r1",
      assetId: "a1",
      assetTag: "RC013",
      jobNumber: "J1",
      workflowName: "Install",
      technicianUserId: "u1",
      technicianName: "Tech",
      completedAt: new Date().toISOString(),
      missingSteps: [{
        stepId: "s1",
        stepOrder: 1,
        stepTitle: "Photo",
        inputId: "i1",
        inputLabel: "Photo",
        inputType: "photo",
        captured: 0,
      }],
      totalExpected: 1,
      totalCaptured: 0,
    }, true);
    expect(merged.actionKind).toBe("missing-media");
    expect(merged.widgets).toEqual([{ kind: "missing-photo", count: 1, color: "warning" }]);
  });
});

describe("fmtDate", () => {
  it("returns dash for empty input", () => {
    expect(fmtDate(null)).toBe("-");
    expect(fmtDate(undefined)).toBe("-");
  });

  it("formats valid ISO dates", () => {
    const formatted = fmtDate("2026-08-17T10:00:00.000Z");
    expect(formatted).not.toBe("-");
    expect(formatted).toBeTruthy();
  });
});
