import { describe, expect, it } from "vitest";
import type { RunTimeEntry } from "../types/assetWorkflowRun";
import { buildTimelineModel, formatDuration } from "./timelineModel";

function entry(
  partial: Pick<RunTimeEntry, "id" | "category" | "startedAtUtc" | "endedAtUtc"> & Partial<RunTimeEntry>,
): RunTimeEntry {
  return {
    reason: null,
    ...partial,
  };
}

describe("buildTimelineModel (Model B)", () => {
  it("proportions only active work; pauses are break gaps not segments", () => {
    const model = buildTimelineModel(
      [
        entry({
          id: "1",
          category: "productive",
          startedAtUtc: "2026-08-01T09:00:00.000Z",
          endedAtUtc: "2026-08-01T10:00:00.000Z", // 1h
        }),
        entry({
          id: "2",
          category: "downtime",
          startedAtUtc: "2026-08-01T10:00:00.000Z",
          endedAtUtc: "2026-08-01T10:30:00.000Z", // 30m
        }),
        // overnight pause (gap)
        entry({
          id: "3",
          category: "productive",
          startedAtUtc: "2026-08-02T09:00:00.000Z",
          endedAtUtc: "2026-08-02T09:30:00.000Z", // 30m
        }),
      ],
      "2026-08-02T12:00:00.000Z",
    );

    expect(model.productiveSeconds).toBe(5400); // 1h + 30m
    expect(model.downtimeSeconds).toBe(1800); // 30m
    expect(model.activeSeconds).toBe(7200); // 2h
    expect(model.hasMultiDayBreak).toBe(true);

    const kinds = model.items.map((i) => i.kind);
    expect(kinds).toEqual(["productive", "downtime", "break", "productive"]);

    const breakItem = model.items.find((i) => i.kind === "break");
    expect(breakItem?.fraction).toBe(0);
    expect(breakItem?.seconds).toBeGreaterThan(60);

    // Active segments share proportion of ACTIVE time only (not overnight gap).
    const productive = model.items.filter((i) => i.kind === "productive");
    expect(productive[0].fraction).toBeCloseTo(3600 / 7200, 5);
    expect(productive[1].fraction).toBeCloseTo(1800 / 7200, 5);
  });

  it("ignores tiny gaps under the break threshold", () => {
    const model = buildTimelineModel(
      [
        entry({
          id: "1",
          category: "productive",
          startedAtUtc: "2026-08-01T09:00:00.000Z",
          endedAtUtc: "2026-08-01T09:10:00.000Z",
        }),
        entry({
          id: "2",
          category: "productive",
          startedAtUtc: "2026-08-01T09:10:30.000Z", // 30s gap
          endedAtUtc: "2026-08-01T09:20:00.000Z",
        }),
      ],
      "2026-08-01T12:00:00.000Z",
    );
    expect(model.items.every((i) => i.kind !== "break")).toBe(true);
  });

  it("closes open entries at nowIso for display", () => {
    const model = buildTimelineModel(
      [
        entry({
          id: "1",
          category: "productive",
          startedAtUtc: "2026-08-01T09:00:00.000Z",
          endedAtUtc: null,
        }),
      ],
      "2026-08-01T09:05:00.000Z",
    );
    expect(model.productiveSeconds).toBe(300);
    expect(model.items[0].endUtc).toBe("2026-08-01T09:05:00.000Z");
  });
});

describe("formatDuration", () => {
  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(90)).toBe("1m");
    expect(formatDuration(3665)).toBe("1h 01m");
  });
});
