import { describe, expect, it } from "vitest";
import {
  getWorkflowDisplayState,
  myJobsCardChipFromDisplayState,
} from "./workflowDisplayState";
import type { ProjectAsset } from "../types/projectAsset";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";

function asset(overrides: Partial<ProjectAsset> = {}): ProjectAsset {
  return {
    id: "asset-1",
    projectId: "project-1",
    productId: "product-1",
    assetTag: "CAD-0054",
    assetName: "Asset",
    status: "Pending",
    ...overrides,
  } as ProjectAsset;
}

function lockedRun(overrides: Partial<AssetWorkflowRun> = {}): AssetWorkflowRun {
  return {
    id: "run-1",
    assetId: "asset-1",
    status: "Complete",
    isLocked: true,
    signatureStatus: "Signed",
    customerSignedAt: "2026-08-03T00:00:00.000Z",
    startedAt: "2026-08-03T00:00:00.000Z",
    completedAt: "2026-08-03T01:00:00.000Z",
    stepResultsJson: "[]",
    issuesJson: "[]",
    ...overrides,
  } as AssetWorkflowRun;
}

function slimRun(overrides: Partial<AssetWorkflowRun> = {}): AssetWorkflowRun {
  return lockedRun({
    signatureStatus: "None",
    customerSignedAt: undefined,
    isLocked: false,
    status: "InProgress",
    stepResultsJson: "[]",
    workflowSnapshotJson: "{}",
    issuesJson: "[]",
    ...overrides,
  });
}

describe("myJobsCardChipFromDisplayState", () => {
  it("does not show Pending sign when run signatures are finalized but asset status is stale", () => {
    const displayState = getWorkflowDisplayState(asset({ status: "Pending" }), [lockedRun()], {
      hasRunnableWorkflowSource: true,
    });
    const chip = myJobsCardChipFromDisplayState(displayState);
    expect(chip.label).not.toBe("Pending sign");
    expect(["Complete", "Field Work Complete"]).toContain(chip.label);
    expect(chip.color).toBe("success");
  });

  it("shows Pending sign while awaiting installer sign-off", () => {
    const displayState = getWorkflowDisplayState(
      asset({ status: "Pending" }),
      [lockedRun({ signatureStatus: "PendingInstaller", customerSignedAt: undefined })],
      { hasRunnableWorkflowSource: true },
    );
    const chip = myJobsCardChipFromDisplayState(displayState);
    expect(chip.label).toBe("Pending sign");
    expect(chip.color).toBe("info");
  });
});

describe("getWorkflowDisplayState slim-run + summary fallback", () => {
  it("shows Add Missing Photos from server workflowSummary when run blobs are placeholders", () => {
    const displayState = getWorkflowDisplayState(
      asset({
        status: "Pending",
        workflowSummary: {
          hasWorkflow: true,
          evidenceStatus: "MissingData",
          requiredItems: 3,
          completedItems: 1,
          missingItems: 2,
          latestRunLocked: true,
          hasOpenIssues: false,
        },
      }),
      [lockedRun({
        signatureStatus: "PendingInstaller",
        customerSignedAt: undefined,
        stepResultsJson: "[]",
        workflowSnapshotJson: "{}",
      })],
      { hasRunnableWorkflowSource: true },
    );
    expect(displayState.action?.kind).toBe("add-missing-photos");
    expect(displayState.action?.label).toBe("Add Missing Photos");
    expect(displayState.gates.missingMediaCount).toBe(2);
  });

  it("shows Resolve Blocking Issue from workflowSummary when slim run hides issuesJson", () => {
    const displayState = getWorkflowDisplayState(
      asset({
        status: "InProgress",
        workflowSummary: {
          hasWorkflow: true,
          evidenceStatus: "Complete",
          requiredItems: 3,
          completedItems: 3,
          missingItems: 0,
          latestRunLocked: true,
          hasOpenIssues: true,
        },
      }),
      [slimRun({ isLocked: true, status: "Complete" })],
      { hasRunnableWorkflowSource: true },
    );
    expect(displayState.action?.kind).toBe("resolve-blocking");
    expect(displayState.gates.blockingIssueCount).toBe(1);
  });

  it("prefers an active in-progress run over stale locked summary", () => {
    const displayState = getWorkflowDisplayState(
      asset({
        status: "InProgress",
        workflowSummary: {
          hasWorkflow: true,
          evidenceStatus: "MissingData",
          requiredItems: 3,
          completedItems: 1,
          missingItems: 2,
          latestRunLocked: true,
          hasOpenIssues: false,
        },
      }),
      [
        slimRun({ id: "run-new", startedAt: "2026-08-04T00:00:00.000Z" }),
        lockedRun({ id: "run-old", startedAt: "2026-08-03T00:00:00.000Z" }),
      ],
      { hasRunnableWorkflowSource: true },
    );
    expect(displayState.status.label).toBe("In Progress");
    expect(displayState.action?.kind).toBe("continue");
  });

  it("shows Add Missing Photos from summary when the only run is an unlocked slim placeholder", () => {
    const displayState = getWorkflowDisplayState(
      asset({
        status: "InProgress",
        workflowSummary: {
          hasWorkflow: true,
          evidenceStatus: "MissingData",
          requiredItems: 3,
          completedItems: 3,
          missingItems: 2,
          latestRunLocked: false,
          hasOpenIssues: false,
        },
      }),
      [slimRun()],
      { hasRunnableWorkflowSource: true },
    );
    expect(displayState.action?.kind).toBe("add-missing-photos");
    expect(displayState.gates.missingMediaCount).toBe(2);
  });

  it("shows Resolve Blocking Issue from summary when the only run is an unlocked slim placeholder", () => {
    const displayState = getWorkflowDisplayState(
      asset({
        status: "InProgress",
        workflowSummary: {
          hasWorkflow: true,
          evidenceStatus: "Complete",
          requiredItems: 3,
          completedItems: 3,
          missingItems: 0,
          latestRunLocked: false,
          hasOpenIssues: true,
        },
      }),
      [slimRun()],
      { hasRunnableWorkflowSource: true },
    );
    expect(displayState.action?.kind).toBe("resolve-blocking");
    expect(displayState.gates.blockingIssueCount).toBe(1);
  });

  it("prefers Add Missing Photos over Resolve Blocking Issue when both apply (action cascade)", () => {
    const displayState = getWorkflowDisplayState(
      asset({
        status: "InProgress",
        workflowSummary: {
          hasWorkflow: true,
          evidenceStatus: "MissingData",
          requiredItems: 3,
          completedItems: 3,
          missingItems: 1,
          latestRunLocked: false,
          hasOpenIssues: true,
        },
      }),
      [slimRun()],
      { hasRunnableWorkflowSource: true },
    );
    expect(displayState.action?.kind).toBe("add-missing-photos");
    expect(displayState.gates.missingMediaCount).toBe(1);
    expect(displayState.gates.blockingIssueCount).toBe(1);
  });
});
