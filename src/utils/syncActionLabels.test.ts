import { describe, expect, it } from "vitest";
import type { PendingAction } from "../services/localDB";
import {
  describeSyncOpType,
  formatPendingActionLabel,
  formatPendingActionTechnicalDetail,
} from "./syncActionLabels";

function action(overrides: Partial<PendingAction>): PendingAction {
  return {
    id: "test-id",
    url: "/asset-workflow-runs/run-1",
    method: "POST",
    body: {},
    entityType: "workflow-run",
    entityId: "run-1",
    optimisticPatch: {},
    createdAt: new Date().toISOString(),
    retries: 0,
    status: "pending",
    ...overrides,
  };
}

describe("describeSyncOpType", () => {
  it("maps signature roles to readable labels", () => {
    expect(describeSyncOpType(action({
      opType: "SIGNATURE_SUBMIT",
      url: "/signature-events?runId=abc",
      body: { signerRole: "Installer" },
    }))).toBe("Installer sign-off");

    expect(describeSyncOpType(action({
      opType: "SIGNATURE_SUBMIT",
      url: "/signature-events?runId=abc",
      body: { signerRole: "Customer" },
    }))).toBe("Customer sign-off");
  });

  it("maps run lifecycle ops", () => {
    expect(describeSyncOpType(action({ opType: "RUN_COMPLETE" }))).toBe("Complete run");
    expect(describeSyncOpType(action({ opType: "RUN_CREATE" }))).toBe("Start workflow run");
  });
});

describe("formatPendingActionLabel", () => {
  it("shows asset tag and job number instead of UUID fragments", () => {
    const label = formatPendingActionLabel(
      action({ opType: "SIGNATURE_SUBMIT", body: { signerRole: "Installer" } }),
      { assetTag: "CAD-0038", jobNumber: "JO00991", runStatus: "InProgress" },
    );
    expect(label.title).toBe("CAD-0038 · JO00991");
    expect(label.subtitle).toBe("Installer sign-off · InProgress");
    expect(label.subtitle).not.toContain("POST");
    expect(label.subtitle).not.toContain("/signature-events");
  });

  it("falls back to operation name when asset context is missing", () => {
    const label = formatPendingActionLabel(
      action({ opType: "RUN_COMPLETE" }),
      {},
    );
    expect(label.title).toBe("Workflow run");
    expect(label.subtitle).toBe("Complete run");
  });
});

describe("formatPendingActionTechnicalDetail", () => {
  it("keeps API path available for diagnostics only", () => {
    expect(formatPendingActionTechnicalDetail(action({
      url: "/signature-events?runId=569e0a31-d8ac-4ff0-9307-1234567890ab",
    }))).toContain("POST /signature-events");
  });
});
