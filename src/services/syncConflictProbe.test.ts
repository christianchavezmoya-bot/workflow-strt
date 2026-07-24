import { describe, expect, it } from "vitest";
import type { PendingAction } from "./localDB";

function isBusinessRule(action: PendingAction): boolean {
  return action.conflictKind === "business_rule" || action.conflictHttpStatus === 422 || action.conflictHttpStatus === 400;
}

function summary(action: PendingAction): string {
  if (action.conflictMessage) return action.conflictMessage;
  if (action.lastError) return action.lastError;
  if (isBusinessRule(action)) {
    return "The server rejected this queued action. Fix the underlying issue, then remove it from the queue or retry.";
  }
  return "Someone else edited this record while you were offline.";
}

describe("conflict presentation helpers", () => {
  const base: PendingAction = {
    id: "a1",
    url: "/asset-workflow-runs/r1/complete",
    method: "POST",
    body: {},
    entityType: "workflow-run",
    entityId: "r1",
    optimisticPatch: {},
    createdAt: new Date().toISOString(),
    retries: 0,
    status: "failed",
    conflictDetected: true,
  };

  it("classifies 422 as business rule", () => {
    expect(isBusinessRule({ ...base, conflictHttpStatus: 422, conflictKind: "business_rule" })).toBe(true);
    expect(isBusinessRule({ ...base, conflictKind: "concurrency" })).toBe(false);
  });

  it("prefers conflictMessage in summary", () => {
    expect(summary({ ...base, conflictMessage: "Blocking issues remain" })).toBe("Blocking issues remain");
  });
});
