import { describe, expect, it } from "vitest";
import {
  assertNoBlockingIssuesForComplete,
  deriveOfflineAssetStatusFromRun,
  filterPendingSignaturesForInstallerView,
  isAssetSignatureStatusFinalized,
  isRunSignatureFinalized,
  type PendingSignatureRecord,
} from "./assetWorkflowRunService";

const sampleSig = (signatureStatus: string): PendingSignatureRecord => ({
  runId: "run-1",
  assetId: "asset-1",
  assetTag: "CAD-1",
  assetName: "CAD-1",
  projectId: "p1",
  jobNumber: "JO1",
  customerName: "Customer",
  completedAt: "2026-01-01T00:00:00.000Z",
  completedBy: "Tech",
  signatureStatus,
});

const lockedCompleteRun = {
  status: "Complete" as const,
  isLocked: true,
  issuesJson: "[]",
};

describe("deriveOfflineAssetStatusFromRun", () => {
  it("returns Pending when locked run awaits installer signature", () => {
    expect(deriveOfflineAssetStatusFromRun({
      ...lockedCompleteRun,
      signatureStatus: "PendingInstaller",
    })).toBe("Pending");
  });

  it("returns Pending when installer signed but customer has not", () => {
    expect(deriveOfflineAssetStatusFromRun({
      ...lockedCompleteRun,
      signatureStatus: "PendingCustomer",
      installerSignedAt: "2026-01-01T00:00:00.000Z",
    })).toBe("Pending");
  });

  it("returns Complete when signature timestamps show dual sign even if signatureStatus is stale", () => {
    expect(deriveOfflineAssetStatusFromRun({
      ...lockedCompleteRun,
      signatureStatus: "PendingInstaller",
      installerSignedAt: "2026-01-01T00:00:00.000Z",
      customerSignedAt: "2026-01-02T00:00:00.000Z",
    })).toBe("Complete");
  });

  it("returns Complete for finalized signature statuses", () => {
    expect(deriveOfflineAssetStatusFromRun({
      ...lockedCompleteRun,
      signatureStatus: "Signed",
    })).toBe("Complete");
  });

  it("trusts installerSignedAt over stale PendingInstaller status", () => {
    expect(deriveOfflineAssetStatusFromRun({
      ...lockedCompleteRun,
      signatureStatus: "PendingInstaller",
      installerSignedAt: "2026-01-01T00:00:00.000Z",
    })).toBe("Pending");
  });
});

describe("filterPendingSignaturesForInstallerView", () => {
  it("keeps installer sign-off only", () => {
    const filtered = filterPendingSignaturesForInstallerView([
      sampleSig("PendingInstaller"),
      sampleSig("PendingCustomer"),
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.signatureStatus).toBe("PendingInstaller");
  });
});

describe("isRunSignatureFinalized", () => {
  it("detects customerSignedAt and terminal signature statuses", () => {
    expect(isRunSignatureFinalized({ signatureStatus: "PendingCustomer", customerSignedAt: "2026-01-01T00:00:00.000Z" })).toBe(true);
    expect(isRunSignatureFinalized({ signatureStatus: "Signed" })).toBe(true);
    expect(isRunSignatureFinalized({ signatureStatus: "PendingInstaller" })).toBe(false);
  });
});

describe("isAssetSignatureStatusFinalized", () => {
  it("detects terminal workspace signature statuses", () => {
    expect(isAssetSignatureStatusFinalized("Signed")).toBe(true);
    expect(isAssetSignatureStatusFinalized("Declined")).toBe(true);
    expect(isAssetSignatureStatusFinalized("PendingInstaller")).toBe(false);
    expect(isAssetSignatureStatusFinalized(undefined)).toBe(false);
  });
});

describe("assertNoBlockingIssuesForComplete", () => {
  it("throws when unresolved blocking issues remain", () => {
    const issues = JSON.stringify([
      { id: "1", description: "block", issueType: "blocking", severity: "high", isBlocking: true, resolved: false, reportedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(() => assertNoBlockingIssuesForComplete(issues)).toThrow(/blocking issue/);
  });

  it("passes when blocking issues are resolved", () => {
    const issues = JSON.stringify([
      { id: "1", description: "fixed", issueType: "blocking", severity: "high", isBlocking: true, resolved: true, reportedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(() => assertNoBlockingIssuesForComplete(issues)).not.toThrow();
  });
});
