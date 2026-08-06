import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  _resetRunHydrationQueueForTests,
  enqueueProjectRunHydration,
  registerRunHydrationExecutor,
  RunHydrationPriority,
  RUN_DETAIL_CHUNK_SIZE,
} from "./runHydrationQueue";

describe("runHydrationQueue", () => {
  beforeEach(() => {
    _resetRunHydrationQueueForTests();
  });

  it("runs chunks serially in priority order", async () => {
    const order: string[] = [];
    registerRunHydrationExecutor(async (projectId, assetIds) => {
      order.push(`${projectId}:${assetIds.join(",")}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    const ids = Array.from({ length: RUN_DETAIL_CHUNK_SIZE + 3 }, (_, i) => `a${i}`);
    await Promise.all([
      enqueueProjectRunHydration("p-urgent", ["u1", "u2"], RunHydrationPriority.urgent),
      enqueueProjectRunHydration("p-low", ids, RunHydrationPriority.low),
    ]);

    expect(order[0]).toBe("p-urgent:u1,u2");
    expect(order.length).toBe(3);
    expect(order[1]?.startsWith("p-low:")).toBe(true);
    expect(order[2]?.startsWith("p-low:")).toBe(true);
  });

  it("dedupes identical pending chunks", async () => {
    let calls = 0;
    registerRunHydrationExecutor(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await Promise.all([
      enqueueProjectRunHydration("p1", ["a1", "a2"], RunHydrationPriority.normal),
      enqueueProjectRunHydration("p1", ["a1", "a2"], RunHydrationPriority.normal),
    ]);

    expect(calls).toBe(1);
  });
});
