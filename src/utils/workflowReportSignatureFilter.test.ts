import { describe, expect, it } from "vitest";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import {
  classifyWorkflowReportSignature,
  matchesWorkflowReportSignatureFilter,
} from "./workflowReportSignatureFilter";

function run(partial: Partial<AssetWorkflowRun> & Pick<AssetWorkflowRun, "status">): AssetWorkflowRun {
  return {
    id: "run-1",
    assetId: "asset-1",
    workflowConfigId: "cfg-1",
    workflowVersion: 1,
    workflowSnapshotJson: '{"steps":[]}',
    isLocked: partial.isLocked ?? false,
    stepResultsJson: "[]",
    issuesJson: "[]",
    timeTrackingJson: "[]",
    productiveSeconds: 0,
    downtimeSeconds: 0,
    downtimeEvents: 0,
    runNumber: 1,
    startedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    signatureStatus: partial.signatureStatus ?? "None",
    ...partial,
  };
}

describe("classifyWorkflowReportSignature", () => {
  it("detects no-workflow placeholder runs", () => {
    expect(
      classifyWorkflowReportSignature(run({ id: "", status: "InProgress", workflowSnapshotJson: "{}" })),
    ).toBe("no-workflow");
  });

  it("detects in-progress runs", () => {
    expect(classifyWorkflowReportSignature(run({ status: "InProgress", isLocked: false }))).toBe("in-progress");
  });

  it("detects completed runs without signatures", () => {
    expect(
      classifyWorkflowReportSignature(run({ status: "Complete", isLocked: true, signatureStatus: "PendingInstaller" })),
    ).toBe("completed-no-signatures");
  });

  it("detects installer-signed completed runs", () => {
    expect(
      classifyWorkflowReportSignature(
        run({
          status: "Complete",
          isLocked: true,
          signatureStatus: "PendingCustomer",
          installerSignedAt: "2026-01-02T00:00:00Z",
        }),
      ),
    ).toBe("completed-installer-signed");
  });

  it("detects fully signed completed runs", () => {
    expect(
      classifyWorkflowReportSignature(
        run({
          status: "Complete",
          isLocked: true,
          signatureStatus: "Signed",
          installerSignedAt: "2026-01-02T00:00:00Z",
          customerSignedAt: "2026-01-03T00:00:00Z",
        }),
      ),
    ).toBe("completed-all-signatures");
  });
});

describe("matchesWorkflowReportSignatureFilter", () => {
  it("matches signature subsets", () => {
    expect(matchesWorkflowReportSignatureFilter("completed-installer-signed", "all")).toBe(true);
    expect(matchesWorkflowReportSignatureFilter("in-progress", "completed-installer-signed")).toBe(false);
    expect(matchesWorkflowReportSignatureFilter("completed-installer-signed", "completed-installer-signed")).toBe(true);
  });
});
