import { describe, expect, it } from "vitest";
import {
  cropGray,
  decidePolarity,
  flattenBackground,
  grayToRgba,
  normalizeOcrCandidate,
  normalizePolarity,
  padGray,
  resizeGray,
  rotateGray,
  stretchContrast,
  toGrayscale,
  type GrayImage,
} from "./ocrPreprocess";
import { blank, fillRect, inkRows } from "./ocrSyntheticImages.testutil";

// Pure pixel operations. These pin deterministic preprocessing only — they deliberately make no
// claim about what Tesseract will read, which varies by engine build/platform.

function rgba(pixels: Array<[number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => out.set([r, g, b, 255], i * 4));
  return out;
}

function band(background: number, ink: number, textFraction = 0.2, size = 500): Uint8ClampedArray {
  const inkCount = Math.round(size * textFraction);
  return Uint8ClampedArray.from({ length: size }, (_, i) => (i < inkCount ? ink : background));
}

describe("grayscale", () => {
  it("uses fixed integer luma weights (identical on every platform)", () => {
    expect(Array.from(toGrayscale(rgba([[255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]]))))
      .toEqual([255, 0, 76, 149, 28]);
  });

  it("round-trips to opaque RGBA", () => {
    const out = grayToRgba({ data: Uint8ClampedArray.from([10, 200]), width: 2, height: 1 });
    expect(Array.from(out)).toEqual([10, 10, 10, 255, 200, 200, 200, 255]);
  });
});

describe("contrast", () => {
  it("stretches a low-contrast (washed-out) label to full range", () => {
    const out = stretchContrast(band(170, 110));
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
  });

  it("leaves a near-flat image alone rather than amplifying sensor noise into fake strokes", () => {
    const flat = band(130, 136);
    expect(Array.from(stretchContrast(flat))).toEqual(Array.from(flat));
  });

  it("illumination flattening removes a glare gradient without erasing the text", () => {
    const img = blank(200, 40);
    for (let y = 0; y < 40; y += 1) for (let x = 0; x < 200; x += 1) img.data[y * 200 + x] = 120 + x * 0.6; // shadow → glare
    fillRect(img, 20, 10, 10, 20, 60);
    fillRect(img, 170, 10, 10, 20, 150); // same ink, in the bright region
    const out = flattenBackground(img, 30);
    const bgLeft = out.data[5 * 200 + 5];
    const bgRight = out.data[5 * 200 + 195];
    expect(Math.abs(bgLeft - bgRight)).toBeLessThan(40); // background evened out
    expect(out.data[20 * 200 + 25]).toBeLessThan(bgLeft - 60); // left text still dark
    expect(out.data[20 * 200 + 175]).toBeLessThan(bgRight - 60); // right text still dark
  });
});

describe("polarity", () => {
  it("keeps dark-on-light and inverts light-on-dark, by which level dominates the band", () => {
    expect(Array.from(normalizePolarity(Uint8ClampedArray.from([0, 255, 255, 255])))).toEqual([0, 255, 255, 255]);
    expect(Array.from(normalizePolarity(Uint8ClampedArray.from([255, 0, 0, 0])))).toEqual([0, 255, 255, 255]);
  });

  it("a large dark logo on a light label doesn't flip it (majority, not mean)", () => {
    expect(decidePolarity(band(240, 10, 0.45)).invert).toBe(false);
  });

  it("reports how sure it is — a half-dark / half-light band is a coin toss", () => {
    expect(decidePolarity(band(240, 20, 0.1)).confidence).toBeGreaterThan(0.7);
    expect(decidePolarity(band(240, 20, 0.5)).confidence).toBeLessThan(0.1);
  });
});

describe("geometry", () => {
  const ramp: GrayImage = { data: Uint8ClampedArray.from({ length: 16 }, (_, i) => i * 10), width: 4, height: 4 };

  it("crops a clamped integer rect", () => {
    const c = cropGray(ramp, { x: 1, y: 1, width: 2, height: 2 });
    expect([c.width, c.height]).toEqual([2, 2]);
    expect(Array.from(c.data)).toEqual([50, 60, 90, 100]);
    const clamped = cropGray(ramp, { x: -5, y: 2, width: 100, height: 100 });
    expect([clamped.width, clamped.height]).toEqual([4, 2]);
  });

  it("upscales smoothly and downscales by area-averaging", () => {
    const up = resizeGray({ data: Uint8ClampedArray.from([0, 200]), width: 2, height: 1 }, 4, 1);
    expect(up.width).toBe(4);
    expect(up.data[0]).toBe(0);
    expect(up.data[3]).toBe(200);
    expect(up.data[1]).toBeGreaterThan(0);
    const down = resizeGray({ data: Uint8ClampedArray.from([0, 100, 200, 100]), width: 4, height: 1 }, 2, 1);
    expect(Array.from(down.data)).toEqual([50, 150]);
  });

  it("pads with a uniform quiet zone", () => {
    const p = padGray({ data: Uint8ClampedArray.from([7]), width: 1, height: 1 }, 2);
    expect([p.width, p.height]).toEqual([5, 5]);
    expect(p.data[2 * 5 + 2]).toBe(7);
    expect(Array.from(p.data).filter((v) => v === 255)).toHaveLength(24);
  });

  it("deskew: rotating a line tilted by θ by −θ makes it horizontal", () => {
    const img = blank(300, 120);
    const theta = (6 * Math.PI) / 180;
    for (let x = 30; x < 270; x += 1) fillRect(img, x, 60 + Math.tan(theta) * (x - 150) - 2, 1, 4);
    expect(inkRows(img).length).toBeGreaterThan(20); // tilted: spans many rows
    const fixed = rotateGray(img, -theta, 150, 60);
    expect(inkRows(fixed).length).toBeLessThanOrEqual(7); // level: a few rows only
  });

  it("rotation is deterministic and fills uncovered corners with paper", () => {
    const img = blank(50, 50, 100);
    const a = rotateGray(img, 0.2, 25, 25);
    const b = rotateGray(img, 0.2, 25, 25);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(a.data[0]).toBe(255);
  });
});

describe("normalizeOcrCandidate — whitespace only, never content", () => {
  it.each([
    ["324775\n", "324775"],
    ["  J000376  ", "J000376"],
    ["\nV1.2.3\n\n", "V1.2.3"],
    ["DR040\t", "DR040"],
    ["ABC-123", "ABC-123"],
    ["S4912/89", "S4912/89"],
    ["19.0006X", "19.0006X"],
    ["ABC\n123", "ABC 123"],
    ["317931   3824", "317931 3824"],
  ])("%j → %j", (raw, expected) => {
    expect(normalizeOcrCandidate(raw)).toBe(expected);
  });

  it("device regression `3247751 ;`: keeps every non-whitespace character — correction is the technician's", () => {
    expect(normalizeOcrCandidate("3247751 ;\n")).toBe("3247751 ;");
  });

  it("never substitutes look-alike characters", () => {
    expect(normalizeOcrCandidate(" O0O l1I-Z2 S5 B8 ")).toBe("O0O l1I-Z2 S5 B8");
  });
});
