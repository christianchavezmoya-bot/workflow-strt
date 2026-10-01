import { describe, expect, it, vi } from "vitest";
import {
  applyZoom,
  clampZoom,
  formatZoom,
  liveVideoTrack,
  readCurrentZoom,
  readZoomRange,
  touchDistance,
  zoomForPinch,
  type ZoomableTrack,
} from "./cameraZoom";

function track(caps: unknown, settings: unknown = {}, apply = vi.fn().mockResolvedValue(undefined)): ZoomableTrack {
  return { readyState: "live", getCapabilities: () => caps, getSettings: () => settings, applyConstraints: apply };
}

describe("readZoomRange — capability detection, never platform assumptions", () => {
  it("reads min/max/step when the camera exposes zoom", () => {
    expect(readZoomRange(track({ zoom: { min: 1, max: 10, step: 0.1 } }))).toEqual({ min: 1, max: 10, step: 0.1 });
  });

  it("treats a missing/zero step as continuous", () => {
    expect(readZoomRange(track({ zoom: { min: 1, max: 5 } }))).toEqual({ min: 1, max: 5, step: 0 });
  });

  it.each([
    ["no zoom key", {}],
    ["empty range", { zoom: { min: 1, max: 1 } }],
    ["inverted range", { zoom: { min: 4, max: 2 } }],
    ["non-numeric", { zoom: { min: "1", max: "4" } }],
    ["non-finite", { zoom: { min: 1, max: Infinity } }],
  ])("returns null when zoom is unusable (%s)", (_, caps) => {
    expect(readZoomRange(track(caps))).toBeNull();
  });

  it("returns null when getCapabilities is absent (e.g. older WebKit) or throws", () => {
    expect(readZoomRange({ applyConstraints: vi.fn() })).toBeNull();
    expect(readZoomRange({ applyConstraints: vi.fn(), getCapabilities: () => { throw new Error("nope"); } })).toBeNull();
    expect(readZoomRange(null)).toBeNull();
  });
});

describe("clampZoom", () => {
  const range = { min: 1, max: 5, step: 0.5 };
  it("clamps to min/max", () => {
    expect(clampZoom(0.2, range)).toBe(1);
    expect(clampZoom(99, range)).toBe(5);
  });
  it("snaps to the capability step relative to min", () => {
    expect(clampZoom(2.2, range)).toBe(2);
    expect(clampZoom(2.3, range)).toBe(2.5);
    expect(clampZoom(1.3, { min: 1, max: 5, step: 0.1 })).toBe(1.3); // no float noise
  });
  it("leaves continuous ranges unsnapped", () => {
    expect(clampZoom(2.37, { min: 1, max: 5, step: 0 })).toBe(2.37);
  });
  it("treats NaN as min", () => {
    expect(clampZoom(Number.NaN, range)).toBe(1);
  });
});

describe("pinch → zoom", () => {
  const range = { min: 1, max: 4, step: 0.1 };
  it("scales the starting zoom by the change in finger distance", () => {
    expect(zoomForPinch(1, 100, 200, range)).toBe(2);
    expect(zoomForPinch(2, 200, 100, range)).toBe(1);
    expect(zoomForPinch(1.5, 100, 150, range)).toBe(2.3); // 2.25 snapped to 0.1 step
  });
  it("clamps at the camera's limits", () => {
    expect(zoomForPinch(3, 100, 400, range)).toBe(4);
    expect(zoomForPinch(1, 100, 10, range)).toBe(1);
  });
  it("is safe for degenerate distances", () => {
    expect(zoomForPinch(2, 0, 100, range)).toBe(2);
  });
  it("measures finger distance", () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 })).toBe(50);
  });
});

describe("readCurrentZoom", () => {
  const range = { min: 1, max: 4, step: 0 };
  it("uses the track's current setting (clamped)", () => {
    expect(readCurrentZoom(track({}, { zoom: 2.5 }), range)).toBe(2.5);
    expect(readCurrentZoom(track({}, { zoom: 9 }), range)).toBe(4);
  });
  it("falls back to min when the setting is missing", () => {
    expect(readCurrentZoom(track({}, {}), range)).toBe(1);
  });
});

describe("applyZoom", () => {
  it("applies zoom through applyConstraints", async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    await expect(applyZoom(track({}, {}, apply), 2)).resolves.toBe(true);
    expect(apply).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] });
  });
  it("resolves false — never throws — when the camera rejects the constraint", async () => {
    const apply = vi.fn().mockRejectedValue(new Error("OverconstrainedError"));
    await expect(applyZoom(track({}, {}, apply), 2)).resolves.toBe(false);
  });
});

describe("liveVideoTrack", () => {
  it("returns the live video track, or null for an ended/absent stream", () => {
    const live = { readyState: "live" };
    const ended = { readyState: "ended" };
    expect(liveVideoTrack({ getVideoTracks: () => [ended, live], getTracks: () => [] } as unknown as MediaStream)).toBe(live);
    expect(liveVideoTrack({ getTracks: () => [ended] } as unknown as MediaStream)).toBeNull();
    expect(liveVideoTrack(null)).toBeNull();
  });
});

describe("formatZoom", () => {
  it("shows one decimal with a multiplication sign", () => {
    expect(formatZoom(1)).toBe("1.0×");
    expect(formatZoom(1.84)).toBe("1.8×");
  });
});
