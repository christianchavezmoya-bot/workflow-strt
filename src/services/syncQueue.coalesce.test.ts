import { beforeEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn();
const getMock = vi.fn();

vi.mock("./localDB", () => ({
  calcNextRetryAt: () => new Date().toISOString(),
  getDB: async () => ({
    get: getMock,
    put: putMock,
    getAll: async () => [],
  }),
}));

import { syncQueue } from "./syncQueue";

describe("syncQueue.updateQueuedOp", () => {
  beforeEach(() => {
    putMock.mockReset();
    getMock.mockReset();
  });

  it("preserves createdAt when coalescing a queued run update", async () => {
    const originalCreatedAt = "2026-01-01T00:00:00.000Z";
    getMock.mockResolvedValue({
      id: "op-1",
      opType: "RUN_UPDATE",
      url: "/asset-workflow-runs/run-1",
      method: "PUT",
      entityType: "workflow-run",
      entityId: "run-1",
      body: { stepResultsJson: "[]" },
      optimisticPatch: {},
      createdAt: originalCreatedAt,
      retries: 0,
      status: "pending",
      idempotencyKey: "key",
    });

    await syncQueue.updateQueuedOp("op-1", {
      body: { stepResultsJson: "[{\"stepId\":\"s1\"}]" },
      optimisticPatch: { stepResultsJson: "[{\"stepId\":\"s1\"}]" },
    });

    expect(putMock).toHaveBeenCalledWith(
      "pending_actions",
      expect.objectContaining({ createdAt: originalCreatedAt }),
    );
  });
});
