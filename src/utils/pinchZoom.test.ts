import { describe, expect, it } from "vitest";
import {
  clampZoom,
  formatZoomPercent,
  nextPinchZoom,
  nextWheelZoom,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  stepZoom,
  toggleZoom,
  touchDistance,
} from "./pinchZoom";

describe("touchDistance", () => {
  it("measures the spread between two fingers", () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5);
  });

  it("is zero when both fingers are in the same place", () => {
    expect(touchDistance({ clientX: 7, clientY: 7 }, { clientX: 7, clientY: 7 })).toBe(0);
  });
});

describe("clampZoom", () => {
  it("keeps values inside the preview bounds", () => {
    expect(clampZoom(99)).toBe(PREVIEW_ZOOM_MAX);
    expect(clampZoom(0.01)).toBe(PREVIEW_ZOOM_MIN);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it("falls back to the minimum for non-finite input", () => {
    expect(clampZoom(Number.NaN)).toBe(PREVIEW_ZOOM_MIN);
  });
});

describe("nextPinchZoom", () => {
  it("scales proportionally to the change in finger spread", () => {
    expect(nextPinchZoom(1, 100, 200)).toBe(2);
    expect(nextPinchZoom(2, 200, 100)).toBe(1);
  });

  it("returns to the starting zoom when the spread returns to its start", () => {
    expect(nextPinchZoom(1.4, 150, 150)).toBe(1.4);
  });

  it("respects the bounds", () => {
    expect(nextPinchZoom(1, 10, 10_000)).toBe(PREVIEW_ZOOM_MAX);
    expect(nextPinchZoom(1, 10_000, 1)).toBe(PREVIEW_ZOOM_MIN);
  });

  it("ignores a zero starting distance instead of dividing by it", () => {
    expect(nextPinchZoom(1.2, 0, 50)).toBe(1.2);
  });
});

describe("nextWheelZoom", () => {
  it("zooms in when the wheel scrolls up", () => {
    expect(nextWheelZoom(1, -100)).toBeGreaterThan(1);
  });

  it("zooms out when the wheel scrolls down", () => {
    expect(nextWheelZoom(1, 100)).toBeLessThan(1);
  });

  it("stays within bounds for very large deltas", () => {
    expect(nextWheelZoom(1, -100_000)).toBe(PREVIEW_ZOOM_MAX);
    expect(nextWheelZoom(1, 100_000)).toBe(PREVIEW_ZOOM_MIN);
  });
});

describe("toggleZoom", () => {
  it("magnifies when at fit", () => {
    expect(toggleZoom(1)).toBe(2);
  });

  it("returns to fit when already magnified", () => {
    expect(toggleZoom(3)).toBe(1);
  });

  it("magnifies when zoomed out below fit", () => {
    expect(toggleZoom(0.6)).toBe(2);
  });
});

describe("stepZoom", () => {
  it("moves one step in each direction", () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.15);
    expect(stepZoom(1, -1)).toBeCloseTo(0.85);
  });

  it("cannot step past the bounds", () => {
    expect(stepZoom(PREVIEW_ZOOM_MAX, 1)).toBe(PREVIEW_ZOOM_MAX);
    expect(stepZoom(PREVIEW_ZOOM_MIN, -1)).toBe(PREVIEW_ZOOM_MIN);
  });
});

describe("formatZoomPercent", () => {
  it("renders a whole percentage", () => {
    expect(formatZoomPercent(1)).toBe("100%");
    expect(formatZoomPercent(2.355)).toBe("236%");
  });
});
