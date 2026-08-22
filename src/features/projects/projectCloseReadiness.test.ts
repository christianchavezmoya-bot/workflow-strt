import { describe, expect, it } from "vitest";
import {
  assetBlocksProjectClose,
  isProjectReadyToCloseFromAssets,
  isProjectReadyToCloseFromSummary,
  projectCloseBlockedReason,
} from "./projectCloseReadiness";

describe("projectCloseReadiness", () => {
  it("allows close when completed, field work done, and no pending signatures", () => {
    expect(isProjectReadyToCloseFromSummary(
      { status: "Completed" },
      { complete: 3, total: 3, pendingSignature: 0 },
    )).toBe(true);
  });

  it("blocks close when signatures are still pending", () => {
    expect(isProjectReadyToCloseFromSummary(
      { status: "Completed" },
      { complete: 3, total: 3, pendingSignature: 1 },
    )).toBe(false);
    expect(projectCloseBlockedReason(
      { status: "Completed" },
      { complete: 3, total: 3, pendingSignature: 1 },
    )).toMatch(/still need signature sign-off/i);
  });

  it("blocks assets with pending customer signature", () => {
    expect(assetBlocksProjectClose({
      status: "Complete",
      signatureStatus: "PendingCustomer",
    })).toBe(true);
  });

  it("allows closed assets and waived customer signatures", () => {
    expect(assetBlocksProjectClose({ status: "Closed", signatureStatus: "Signed" })).toBe(false);
    expect(assetBlocksProjectClose({ status: "Closed", signatureStatus: "WaivedCustomer" })).toBe(false);
  });

  it("evaluates per-asset readiness", () => {
    expect(isProjectReadyToCloseFromAssets(
      { status: "Completed" },
      [
        { status: "Closed", signatureStatus: "Signed" },
        { status: "Closed", signatureStatus: "WaivedCustomer" },
      ],
    )).toBe(true);

    expect(isProjectReadyToCloseFromAssets(
      { status: "Completed" },
      [{ status: "Complete", signatureStatus: "PendingCustomer" }],
    )).toBe(false);
  });
});
