import { describe, expect, it } from "vitest";
import { computeLiveRunSeconds } from "./RunnerLiveDuration";

describe("computeLiveRunSeconds", () => {
  it("adds elapsed seconds only for the active tracking category", () => {
    const tickNow = Date.parse("2026-08-21T10:00:10.000Z");
    const startedAt = "2026-08-21T10:00:00.000Z";
    expect(computeLiveRunSeconds(30, "productive", "productive", startedAt, tickNow)).toBe(40);
    expect(computeLiveRunSeconds(30, "productive", "downtime", startedAt, tickNow)).toBe(30);
  });

  it("returns base seconds when tracking is idle", () => {
    expect(computeLiveRunSeconds(12, null, "productive", "2026-08-21T10:00:00.000Z", Date.now())).toBe(12);
  });
});
