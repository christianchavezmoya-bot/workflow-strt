import { describe, expect, it } from "vitest";
import { computeSelfDependencyRepairs, type PendingAction } from "./localDB";

function action(overrides: Partial<PendingAction> & { id: string; entityId: string }): PendingAction {
  return {
    url: "/asset-workflow-runs/run-1/time-entry",
    method: "POST",
    body: { action: "StartProductive" },
    entityType: "workflow-run",
    optimisticPatch: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    retries: 0,
    status: "pending",
    opType: "TIME_ENTRY",
    ...overrides,
  };
}

describe("computeSelfDependencyRepairs", () => {
  it("returns nothing when no row is self-dependent", () => {
    const rows = [
      action({ id: "a", entityId: "run-1", createdAt: "2026-01-01T00:00:00.000Z" }),
      action({ id: "b", entityId: "run-1", createdAt: "2026-01-01T00:05:00.000Z", dependsOnOpId: "a" }),
    ];
    expect(computeSelfDependencyRepairs(rows)).toEqual([]);
  });

  it("repairs Christian's exact reported case: reconstructs the earlier TIME_ENTRY as predecessor", () => {
    const rows = [
      action({ id: "earlier", entityId: "run-56bca5a8", createdAt: "2026-08-27T09:00:00.000Z" }),
      action({
        id: "f14a7efe-5874-4119-b212-0f5defd3e00a",
        entityId: "run-56bca5a8",
        createdAt: "2026-08-27T09:05:00.000Z",
        dependsOnOpId: "f14a7efe-5874-4119-b212-0f5defd3e00a",
      }),
    ];
    const repairs = computeSelfDependencyRepairs(rows);
    expect(repairs).toEqual([
      { id: "f14a7efe-5874-4119-b212-0f5defd3e00a", dependsOnOpId: "earlier" },
    ]);
  });

  it("falls back to a pending RUN_CREATE when no earlier same-opType row exists", () => {
    const rows = [
      action({ id: "run-create", entityId: "run-1", opType: "RUN_CREATE", createdAt: "2026-01-01T00:00:00.000Z" }),
      action({
        id: "time-entry",
        entityId: "run-1",
        createdAt: "2026-01-01T00:05:00.000Z",
        dependsOnOpId: "time-entry",
      }),
    ];
    expect(computeSelfDependencyRepairs(rows)).toEqual([{ id: "time-entry", dependsOnOpId: "run-create" }]);
  });

  it("falls back to no dependency when neither an earlier row nor a RUN_CREATE exists", () => {
    const rows = [
      action({ id: "only", entityId: "run-1", dependsOnOpId: "only" }),
    ];
    expect(computeSelfDependencyRepairs(rows)).toEqual([{ id: "only", dependsOnOpId: undefined }]);
  });

  it("never selects the self-dependent row itself as its own repaired predecessor", () => {
    const rows = [
      action({ id: "only", entityId: "run-1", opType: "RUN_CREATE", dependsOnOpId: "only" }),
    ];
    const [repair] = computeSelfDependencyRepairs(rows);
    expect(repair.dependsOnOpId).not.toBe(repair.id);
  });
});
