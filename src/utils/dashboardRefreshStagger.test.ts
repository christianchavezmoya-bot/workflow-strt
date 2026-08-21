import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runStaggeredDashboardLiveRefresh } from "./dashboardRefreshStagger";

describe("runStaggeredDashboardLiveRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts workspace immediately and staggers heavier tasks", async () => {
    const order: string[] = [];
    const promise = runStaggeredDashboardLiveRefresh({
      workspace: async () => { order.push("workspace"); },
      attention: async () => { order.push("attention"); },
      listOpen: async () => { order.push("open"); },
      workload: async () => { order.push("workload"); },
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["workspace"]);

    await vi.advanceTimersByTimeAsync(400);
    expect(order).toContain("attention");

    await vi.advanceTimersByTimeAsync(400);
    expect(order).toContain("open");

    await vi.advanceTimersByTimeAsync(400);
    await promise;
    expect(order).toEqual(["workspace", "attention", "open", "workload"]);
  });
});
