import { describe, expect, it } from "vitest";
import { computeSourceCropRect, mapOcrTarget, ocrTargetBandRect } from "./cameraCropMath";

describe("computeSourceCropRect", () => {
  // Required test #30/#31: same aspect ratio — no letterboxing/clipping, scale is exactly 1:1.
  it("maps 1:1 when video and container share the same aspect ratio and size", () => {
    const result = computeSourceCropRect({
      videoIntrinsicSize: { width: 1000, height: 1000 },
      videoDisplayRect: { left: 0, top: 0, width: 1000, height: 1000 },
      overlayRect: { left: 400, top: 450, width: 200, height: 100 },
    });
    expect(result).toEqual({ x: 400, y: 450, width: 200, height: 100 });
  });

  // Required test #31: video wider than the container (portrait phone showing a landscape
  // sensor stream) — horizontal clipping under object-fit:cover.
  it("correctly crops when the video's intrinsic aspect ratio is wider than the container", () => {
    // 1920x1080 stream (16:9) displayed in a 400x600 (2:3) portrait container.
    // scale = max(400/1920, 600/1080) = max(0.2083, 0.5556) = 0.5556
    // displayed content: 1920*0.5556=1066.7 x 1080*0.5556=600 -> horizontally overflows.
    const result = computeSourceCropRect({
      videoIntrinsicSize: { width: 1920, height: 1080 },
      videoDisplayRect: { left: 0, top: 0, width: 400, height: 600 },
      // Overlay centered in the container, sized 300x100 CSS px.
      overlayRect: { left: 50, top: 250, width: 300, height: 100 },
    });
    const scale = Math.max(400 / 1920, 600 / 1080);
    const offsetX = (400 - 1920 * scale) / 2;
    const expectedX = (50 - offsetX) / scale;
    const expectedY = (250 - 0) / scale;
    expect(result.x).toBeCloseTo(expectedX, 5);
    expect(result.y).toBeCloseTo(expectedY, 5);
    expect(result.width).toBeCloseTo(300 / scale, 5);
    expect(result.height).toBeCloseTo(100 / scale, 5);
    // Sanity: the mapped rect must stay within the intrinsic frame.
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(1920);
  });

  // Required test #31/#32: video taller than the container — vertical clipping, representative
  // real portrait-phone dimensions (e.g. a 4:3 sensor stream in a narrow full-height preview).
  it("correctly crops when the video's intrinsic aspect ratio is taller than the container", () => {
    // 1080x1440 (3:4) stream in a 360x640 (9:16) container.
    // scale = max(360/1080, 640/1440) = max(0.3333, 0.4444) = 0.4444
    const result = computeSourceCropRect({
      videoIntrinsicSize: { width: 1080, height: 1440 },
      videoDisplayRect: { left: 0, top: 0, width: 360, height: 640 },
      overlayRect: { left: 40, top: 280, width: 280, height: 90 },
    });
    const scale = Math.max(360 / 1080, 640 / 1440);
    const offsetY = (640 - 1440 * scale) / 2;
    const expectedY = (280 - offsetY) / scale;
    expect(result.y).toBeCloseTo(expectedY, 5);
    expect(result.width).toBeCloseTo(280 / scale, 5);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.y + result.height).toBeLessThanOrEqual(1440);
  });

  // Required test #32: representative real portrait phone dimensions end-to-end, non-zero-origin
  // container (video isn't necessarily positioned at the page's own (0,0)).
  it("handles a realistic portrait-phone fixture with a non-zero video element position", () => {
    // A typical modern phone stream (e.g. 1280x720 landscape sensor) shown full-bleed in a
    // portrait viewport whose <video> element itself starts partway down the page (e.g. below
    // a header), with a long rectangular OCR target window centered in the lower-middle third.
    const result = computeSourceCropRect({
      videoIntrinsicSize: { width: 1280, height: 720 },
      videoDisplayRect: { left: 0, top: 56, width: 390, height: 700 },
      overlayRect: { left: 45, top: 420, width: 300, height: 70 },
    });
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(1280);
    expect(result.y + result.height).toBeLessThanOrEqual(720);
  });

  // Required test #30: target mapping — an overlay in the exact center of the container maps to
  // the exact center of the source frame (a strong, easy-to-reason-about correctness check).
  it("maps a centered overlay to a centered source region", () => {
    const result = computeSourceCropRect({
      videoIntrinsicSize: { width: 2000, height: 1000 },
      videoDisplayRect: { left: 100, top: 100, width: 800, height: 400 },
      // Overlay exactly centered: container center is (500, 300) relative to page;
      // an 200x100 overlay centered there spans left=400..600, top=250..350.
      overlayRect: { left: 400, top: 250, width: 200, height: 100 },
    });
    const centerX = result.x + result.width / 2;
    const centerY = result.y + result.height / 2;
    expect(centerX).toBeCloseTo(1000, 1); // horizontal center of a 2000-wide frame
    expect(centerY).toBeCloseTo(500, 1); // vertical center of a 1000-tall frame
  });

  // Required test #31: crop clamping — an overlay whose computed source rect would extend
  // beyond the intrinsic frame (e.g. rounding at an edge) is clamped, never negative/oversized.
  it("clamps the result to the video's intrinsic bounds", () => {
    const result = computeSourceCropRect({
      videoIntrinsicSize: { width: 500, height: 500 },
      videoDisplayRect: { left: 0, top: 0, width: 500, height: 500 },
      // Overlay positioned so it would compute to slightly outside the frame.
      overlayRect: { left: -20, top: -20, width: 100, height: 100 },
    });
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(500);
    expect(result.y + result.height).toBeLessThanOrEqual(500);

    const result2 = computeSourceCropRect({
      videoIntrinsicSize: { width: 500, height: 500 },
      videoDisplayRect: { left: 0, top: 0, width: 500, height: 500 },
      overlayRect: { left: 450, top: 450, width: 100, height: 100 },
    });
    expect(result2.x + result2.width).toBeLessThanOrEqual(500);
    expect(result2.y + result2.height).toBeLessThanOrEqual(500);
  });

  // Degenerate/defensive: never divide by zero if called before the stream/layout is ready.
  it("returns an empty rect rather than NaN/Infinity for zero-sized input", () => {
    const result = computeSourceCropRect({
      videoIntrinsicSize: { width: 0, height: 0 },
      videoDisplayRect: { left: 0, top: 0, width: 0, height: 0 },
      overlayRect: { left: 0, top: 0, width: 100, height: 50 },
    });
    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.width)).toBe(true);
  });

  it("device-pixel-ratio note: identical CSS-pixel inputs produce identical output regardless of any DPR the caller might apply elsewhere — DPR is not a parameter of this function by design", () => {
    const a = computeSourceCropRect({
      videoIntrinsicSize: { width: 1920, height: 1080 },
      videoDisplayRect: { left: 0, top: 0, width: 400, height: 225 },
      overlayRect: { left: 100, top: 80, width: 200, height: 60 },
    });
    const b = computeSourceCropRect({
      videoIntrinsicSize: { width: 1920, height: 1080 },
      videoDisplayRect: { left: 0, top: 0, width: 400, height: 225 },
      overlayRect: { left: 100, top: 80, width: 200, height: 60 },
    });
    expect(a).toEqual(b);
  });
});

describe("OCR target band → source pixels", () => {
  it("is a wide, not-thin band centred on the preview", () => {
    const band = ocrTargetBandRect({ left: 0, top: 0, width: 360, height: 480 });
    expect(band.width).toBeCloseTo(360 * 0.9, 5);
    expect(band.height).toBeCloseTo(480 * 0.24, 5);
    expect(band.height).toBeGreaterThanOrEqual(480 * 0.2); // room for full glyphs + curvature
    expect(band.top + band.height / 2).toBeCloseTo(240, 5);
    expect(band.left).toBeCloseTo(18, 5);
  });

  it.each([
    ["portrait phone, landscape sensor (16:9) in a 3:4 preview", { width: 1920, height: 1080 }],
    ["portrait phone, portrait sensor (9:16)", { width: 1080, height: 1920 }],
    ["4:3 sensor", { width: 1440, height: 1080 }],
    ["high-resolution 4K sensor", { width: 3840, height: 2160 }],
  ])("%s: crop matches the on-screen band under object-fit:cover, guide at its centre", (_, size) => {
    const video = { left: 12, top: 80, width: 360, height: 480 };
    const band = ocrTargetBandRect(video);
    const { crop, guideY } = mapOcrTarget({ videoIntrinsicSize: size, videoDisplayRect: video, overlayRect: band });

    const scale = Math.max(video.width / size.width, video.height / size.height);
    expect(crop.width).toBeCloseTo(band.width / scale, 4);
    expect(crop.height).toBeCloseTo(band.height / scale, 4);
    // Horizontally/vertically centred in the source (the band is centred in the preview).
    expect(crop.x + crop.width / 2).toBeCloseTo(size.width / 2, 4);
    expect(crop.y + crop.height / 2).toBeCloseTo(size.height / 2, 4);
    expect(guideY).toBeCloseTo(crop.height / 2, 4);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y + crop.height).toBeLessThanOrEqual(size.height);
  });

  it("scales with source resolution: the same on-screen band captures proportionally more pixels at 4K", () => {
    const video = { left: 0, top: 0, width: 360, height: 480 };
    const band = ocrTargetBandRect(video);
    const hd = mapOcrTarget({ videoIntrinsicSize: { width: 1920, height: 1080 }, videoDisplayRect: video, overlayRect: band });
    const uhd = mapOcrTarget({ videoIntrinsicSize: { width: 3840, height: 2160 }, videoDisplayRect: video, overlayRect: band });
    expect(uhd.crop.width / hd.crop.width).toBeCloseTo(2, 5);
    expect(uhd.crop.height / hd.crop.height).toBeCloseTo(2, 5);
  });

  it("near a source boundary: clamps the crop and keeps the guide where it really is", () => {
    // Band pushed so its top half falls above the displayed content (e.g. a layout shift).
    const video = { left: 0, top: 0, width: 400, height: 400 };
    const size = { width: 1000, height: 1000 };
    const overlay = { left: 20, top: -40, width: 360, height: 100 }; // guide at CSS y=10
    const { crop, guideY } = mapOcrTarget({ videoIntrinsicSize: size, videoDisplayRect: video, overlayRect: overlay });
    expect(crop.y).toBe(0);
    expect(crop.height).toBeCloseTo(60 / 0.4, 5); // only the on-frame part (150px)
    expect(guideY).toBeCloseTo(10 / 0.4, 5); // 25px from the top — NOT crop.height / 2
  });
});
