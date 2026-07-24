import { describe, expect, it } from "vitest";
import {
  deriveOfflineAssetStatusFromRun,
  isRunSignatureFinalized,
} from "./assetWorkflowRunService";

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

describe("isRunSignatureFinalized", () => {
  it("detects customerSignedAt and terminal signature statuses", () => {
    expect(isRunSignatureFinalized({ signatureStatus: "PendingCustomer", customerSignedAt: "2026-01-01T00:00:00.000Z" })).toBe(true);
    expect(isRunSignatureFinalized({ signatureStatus: "Signed" })).toBe(true);
    expect(isRunSignatureFinalized({ signatureStatus: "PendingInstaller" })).toBe(false);
  });
});
