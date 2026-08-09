import { describe, expect, it } from "vitest";
import { runPool } from "./asyncPool";

describe("runPool", () => {
  it("runs all items with bounded concurrency", async () => {
    const order: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    await runPool([0, 1, 2, 3, 4], 2, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(item);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });

    expect(order.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
