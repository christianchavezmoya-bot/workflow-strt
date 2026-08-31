import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the SYNC ROOT CAUSE — SELF-DEPENDENCY DEADLOCK finding:
 * a second offline TIME_ENTRY action for the same run could end up with
 * dependsOnOpId === its own id, permanently deadlocking flush(). See
 * assetWorkflowRunService.enqueueTimeEntry() and syncQueue.enqueue().
 *
 * Uses an in-memory fake "pending_actions" store (not mocked get/put stubs) so
 * enqueue()'s internal listAll()/getAll() sees rows written by earlier calls in
 * the same test — required to faithfully reproduce the real interaction between
 * enqueueTimeEntry's dependency lookup and enqueue's idempotency-key upsert.
 */

type FakeRow = Record<string, unknown> & { id: string };

let store: Map<string, FakeRow>;

function createFakeDb() {
  return {
    async get(_store: string, id: string) {
      return store.get(id);
    },
    async put(_store: string, value: FakeRow) {
      store.set(value.id, value);
      return value.id;
    },
    async getAll(_store: string) {
      return [...store.values()];
    },
    async delete(_store: string, id: string) {
      store.delete(id);
    },
  };
}

vi.mock("./localDB", () => ({
  calcNextRetryAt: () => new Date().toISOString(),
  getDB: async () => createFakeDb(),
}));

import { syncQueue, type SyncQueueOp } from "./syncQueue";

/**
 * enqueue() stamps createdAt with wall-clock now(), and the dependency-selection sort
 * breaks ties by insertion order — real user actions are always spaced apart, but a
 * fast synchronous test can land two enqueue() calls in the same millisecond, so tests
 * that assert ordering across 3+ calls tick the clock forward between them.
 */
async function tick(ms = 2): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mirrors assetWorkflowRunService.enqueueTimeEntry()'s prior-TIME_ENTRY selection exactly. */
async function computeDependsOnPriorTimeEntry(entityId: string): Promise<string | undefined> {
  return (await syncQueue.listByEntityId(entityId))
    .filter((op) => op.opType === "TIME_ENTRY" && op.status !== "uploading")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;
}

async function enqueueTimeEntryLike(entityId: string, action: string, startedAtUtc: string): Promise<SyncQueueOp> {
  const dependsOnOpId = await computeDependsOnPriorTimeEntry(entityId);
  return syncQueue.enqueue({
    opType: "TIME_ENTRY",
    url: `/asset-workflow-runs/${entityId}/time-entry`,
    method: "POST",
    entityType: "workflow-run",
    entityId,
    body: { action, startedAtUtc, endedAtUtc: null },
    dependsOnOpId,
  });
}

describe("TIME_ENTRY queue chaining (self-dependency regression)", () => {
  beforeEach(() => {
    store = new Map();
  });

  it("first TIME_ENTRY cannot depend on itself", async () => {
    const op = await enqueueTimeEntryLike("run-1", "StartProductive", "2026-01-01T00:00:00.000Z");
    expect(op.dependsOnOpId).toBeUndefined();
    expect(op.dependsOnOpId).not.toBe(op.id);
  });

  it("a second TIME_ENTRY action for the same run creates its own row, chained to the first", async () => {
    const first = await enqueueTimeEntryLike("run-1", "StartProductive", "2026-01-01T00:00:00.000Z");
    await tick();
    const second = await enqueueTimeEntryLike("run-1", "StopDowntime", "2026-01-01T00:05:00.000Z");

    expect(second.id).not.toBe(first.id);
    expect(second.dependsOnOpId).toBe(first.id);
    expect(second.dependsOnOpId).not.toBe(second.id);

    const all = await syncQueue.listByEntityId("run-1");
    expect(all.filter((o) => o.opType === "TIME_ENTRY")).toHaveLength(2);
  });

  it("three sequential TIME_ENTRY actions form a linear chain, never self-referencing", async () => {
    const t1 = await enqueueTimeEntryLike("run-2", "StartProductive", "2026-01-01T00:00:00.000Z");
    await tick();
    const t2 = await enqueueTimeEntryLike("run-2", "StartDowntime", "2026-01-01T00:05:00.000Z");
    await tick();
    const t3 = await enqueueTimeEntryLike("run-2", "StopDowntime", "2026-01-01T00:10:00.000Z");

    expect(t1.dependsOnOpId).toBeUndefined();
    expect(t2.dependsOnOpId).toBe(t1.id);
    expect(t3.dependsOnOpId).toBe(t2.id);

    const all = await syncQueue.listByEntityId("run-2");
    expect(all).toHaveLength(3);
    for (const op of all) expect(op.dependsOnOpId).not.toBe(op.id);
  });

  it("RUN_COMPLETE depends on the actual final TIME_ENTRY, not a collapsed/self-referential row", async () => {
    await enqueueTimeEntryLike("run-3", "StartProductive", "2026-01-01T00:00:00.000Z");
    await tick();
    const lastTimeEntry = await enqueueTimeEntryLike("run-3", "StopAll", "2026-01-01T00:05:00.000Z");

    const dependsOnOpId = await computeDependsOnPriorTimeEntry("run-3");
    const runComplete = await syncQueue.enqueue({
      opType: "RUN_COMPLETE",
      url: "/asset-workflow-runs/run-3/complete",
      method: "POST",
      entityType: "workflow-run",
      entityId: "run-3",
      body: {},
      dependsOnOpId,
    });

    expect(runComplete.dependsOnOpId).toBe(lastTimeEntry.id);
    expect(runComplete.dependsOnOpId).not.toBe(runComplete.id);
  });

  it("never persists a self-referential dependsOnOpId even when the idempotency key collides (defensive guard)", async () => {
    const first = await syncQueue.enqueue({
      opType: "TIME_ENTRY",
      url: "/asset-workflow-runs/run-4/time-entry",
      method: "POST",
      entityType: "workflow-run",
      entityId: "run-4",
      body: { action: "StartProductive", startedAtUtc: "2026-01-01T00:00:00.000Z", endedAtUtc: null },
    });

    // Exact duplicate body => same idempotency key => legitimate coalesce path — but the
    // caller (simulating a stale queue read) passes the existing row's own id as its dependency.
    const second = await syncQueue.enqueue({
      opType: "TIME_ENTRY",
      url: "/asset-workflow-runs/run-4/time-entry",
      method: "POST",
      entityType: "workflow-run",
      entityId: "run-4",
      body: { action: "StartProductive", startedAtUtc: "2026-01-01T00:00:00.000Z", endedAtUtc: null },
      dependsOnOpId: first.id,
    });

    expect(second.id).toBe(first.id);
    const persisted = [...store.values()].find((row) => row.id === first.id);
    expect(persisted?.dependsOnOpId).toBeUndefined();
  });
});
