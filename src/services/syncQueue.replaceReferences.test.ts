import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncQueueOp } from "./syncQueue";

const store = new Map<string, SyncQueueOp>();
const putMock = vi.fn(async (op: SyncQueueOp) => {
  store.set(op.id, op);
});
const getAllMock = vi.fn(async () => [...store.values()]);

vi.mock("./localDB", () => ({
  calcNextRetryAt: () => new Date().toISOString(),
  getDB: async () => ({
    transaction: () => ({
      store: {
        getAll: getAllMock,
        put: putMock,
      },
      done: Promise.resolve(),
    }),
  }),
}));

import { syncQueue } from "./syncQueue";

function seedOp(partial: Partial<SyncQueueOp> & Pick<SyncQueueOp, "id">): SyncQueueOp {
  const op: SyncQueueOp = {
    opType: "RUN_UPDATE",
    url: "/asset-workflow-runs/temp-run-1",
    method: "PUT",
    entityType: "workflow-run",
    entityId: "temp-run-1",
    body: {},
    optimisticPatch: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    retries: 0,
    status: "pending",
    idempotencyKey: `key-${partial.id}`,
    ...partial,
  };
  store.set(op.id, op);
  return op;
}

describe("syncQueue.replaceRunIdReferences", () => {
  beforeEach(() => {
    store.clear();
    putMock.mockClear();
    getAllMock.mockClear();
  });

  it("rewrites entityId, serverEntityId, and url for queued run operations", async () => {
    seedOp({
      id: "op-1",
      entityId: "temp-run-1",
      serverEntityId: "temp-run-1",
      url: "/asset-workflow-runs/temp-run-1/step-media",
    });
    seedOp({
      id: "op-2",
      entityType: "workflow-instruction",
      entityId: "other-entity",
      url: "/work-instructions/wi-1",
    });

    await syncQueue.replaceRunIdReferences("temp-run-1", "server-run-99");

    expect(putMock).toHaveBeenCalledTimes(1);
    const updated = putMock.mock.calls[0][0] as SyncQueueOp;
    expect(updated.entityId).toBe("server-run-99");
    expect(updated.serverEntityId).toBe("server-run-99");
    expect(updated.url).toBe("/asset-workflow-runs/server-run-99/step-media");
  });
});

describe("syncQueue.replaceEntityReferences", () => {
  beforeEach(() => {
    store.clear();
    putMock.mockClear();
    getAllMock.mockClear();
  });

  it("rewrites every queued op that references the temp entity id", async () => {
    seedOp({
      id: "op-a",
      opType: "WORK_INSTRUCTION_CREATE",
      entityType: "workflow-instruction",
      entityId: "temp-wi-1",
      url: "/work-instructions/temp-wi-1/publish",
    });
    seedOp({
      id: "op-b",
      entityId: "temp-wi-1",
      serverEntityId: "temp-wi-1",
      url: "/work-instructions",
      opType: "WORK_INSTRUCTION_UPDATE",
      entityType: "workflow-instruction",
    });

    await syncQueue.replaceEntityReferences("temp-wi-1", "server-wi-42");

    expect(putMock).toHaveBeenCalledTimes(2);
    const urls = putMock.mock.calls.map((call) => (call[0] as SyncQueueOp).url);
    expect(urls.every((url) => !url.includes("temp-wi-1"))).toBe(true);
    expect(urls.some((url) => url.includes("server-wi-42"))).toBe(true);
  });
});

describe("syncQueue.replaceEntityId", () => {
  beforeEach(() => {
    store.clear();
    putMock.mockClear();
    getAllMock.mockClear();
  });

  it("only updates ops whose entityId matches exactly", async () => {
    seedOp({ id: "op-1", entityId: "temp-asset-1", url: "/project-assets/temp-asset-1" });
    seedOp({ id: "op-2", entityId: "temp-asset-2", url: "/project-assets/temp-asset-2" });

    await syncQueue.replaceEntityId("temp-asset-1", "server-asset-1");

    expect(putMock).toHaveBeenCalledTimes(1);
    expect((putMock.mock.calls[0][0] as SyncQueueOp).entityId).toBe("server-asset-1");
  });
});
