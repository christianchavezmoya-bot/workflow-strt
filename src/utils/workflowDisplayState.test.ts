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
});
