import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeOcrScale,
  normalizeOcrCandidate,
  normalizePolarity,
  OCR_MAX_SCALE,
  OCR_MAX_WIDTH_PX,
  OCR_MIN_HEIGHT_PX,
  preprocessCanvasForOcr,
  preprocessOcrPixels,
  stretchContrast,
  toGrayscale,
} from "./ocrPreprocess";

// Pure pixel-pipeline tests. These pin the deterministic preprocessing only — they deliberately
// make no claim about what Tesseract will read, which varies by engine build/platform.

function rgba(pixels: Array<[number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => out.set([r, g, b, 255], i * 4));
  return out;
}

/** A synthetic label band: `textFraction` of pixels are "ink", the rest background. */
function band(background: number, ink: number, textFraction = 0.2, size = 500): Uint8ClampedArray {
  const inkCount = Math.round(size * textFraction);
  return rgba(Array.from({ length: size }, (_, i) => {
    const v = i < inkCount ? ink : background;
    return [v, v, v] as [number, number, number];
  }));
}

function gray(out: Uint8ClampedArray): number[] {
  const g: number[] = [];
  for (let i = 0; i < out.length; i += 4) g.push(out[i]);
  return g;
}

describe("computeOcrScale", () => {
  it("upscales a small crop band so text reaches a readable height, capped at OCR_MAX_SCALE", () => {
    expect(computeOcrScale(400, OCR_MIN_HEIGHT_PX / 2)).toBe(2);
    expect(computeOcrScale(300, 20)).toBe(OCR_MAX_SCALE);
  });

  it("never downscales a crop that is already tall enough", () => {
    expect(computeOcrScale(800, OCR_MIN_HEIGHT_PX * 2)).toBe(1);
  });

  it("bounds the working width so recognition time stays predictable", () => {
    const scale = computeOcrScale(1200, 40);
    expect(1200 * scale).toBeLessThanOrEqual(OCR_MAX_WIDTH_PX);
    expect(scale).toBeGreaterThanOrEqual(1);
  });

  it("is safe for degenerate sizes", () => {
    expect(computeOcrScale(0, 0)).toBe(1);
  });
});

describe("pixel pipeline", () => {
  it("grayscale uses fixed integer luma weights (identical on every platform)", () => {
    expect(Array.from(toGrayscale(rgba([[255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]]))))
      .toEqual([255, 0, 76, 149, 28]);
  });

  it("stretches a low-contrast (washed-out) label to full range", () => {
    const out = stretchContrast(toGrayscale(band(170, 110)));
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
  });

  it("leaves a near-flat image alone rather than amplifying sensor noise into fake strokes", () => {
    const flat = toGrayscale(band(130, 136));
    expect(Array.from(stretchContrast(flat))).toEqual(Array.from(flat));
  });

  it("keeps dark-on-light as is and inverts light-on-dark, so Tesseract always sees dark text", () => {
    const darkOnLight = new Uint8ClampedArray([0, 255, 255, 255]);
    expect(Array.from(normalizePolarity(darkOnLight))).toEqual([0, 255, 255, 255]);
    const lightOnDark = new Uint8ClampedArray([255, 0, 0, 0]);
    expect(Array.from(normalizePolarity(lightOnDark))).toEqual([0, 255, 255, 255]);
  });

  it("dark print on a grey label and white print on a black label both come out as black-on-white", () => {
    const a = gray(preprocessOcrPixels(band(180, 60)));
    const b = gray(preprocessOcrPixels(band(20, 230)));
    for (const g of [a, b]) {
      expect(g[0]).toBe(0); // ink
      expect(g[g.length - 1]).toBe(255); // background
    }
  });

  it("is deterministic: the same input always yields byte-identical output", () => {
    const input = band(175, 70, 0.3);
    const first = preprocessOcrPixels(input);
    const second = preprocessOcrPixels(new Uint8ClampedArray(input));
    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it("does not mutate its input and outputs opaque RGBA of the same size", () => {
    const input = band(175, 70);
    const snapshot = Array.from(input);
    const out = preprocessOcrPixels(input);
    expect(Array.from(input)).toEqual(snapshot);
    expect(out.length).toBe(input.length);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });
});

describe("preprocessCanvasForOcr", () => {
  it("falls back to the original crop when no 2D context is available — never blocks OCR", () => {
    const src = document.createElement("canvas");
    src.width = 100;
    src.height = 30;
    // jsdom has no 2D canvas; the real runtime path is covered on-device.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(preprocessCanvasForOcr(src)).toBe(src);
  });

  it("upscales the crop, runs the pixel pipeline on it, and pads it with a white quiet zone", () => {
    const src = document.createElement("canvas");
    src.width = 200;
    src.height = 40; // → scale = OCR_MAX_SCALE (3): 600×120
    const scaledPixels = band(20, 230, 0.2, 600 * 120); // white print on a dark label
    const drawImage = vi.fn();
    const putImageData = vi.fn();
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      putImageData,
      fillRect,
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(scaledPixels) }),
    } as unknown as CanvasRenderingContext2D);

    const out = preprocessCanvasForOcr(src);

    expect(out).not.toBe(src);
    expect(drawImage).toHaveBeenCalledWith(src, 0, 0, 600, 120); // only the given crop, upscaled
    expect(out.width).toBe(600 + 32);
    expect(out.height).toBe(120 + 32);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 632, 152);
    const [image, x, y] = putImageData.mock.calls[0] as [{ data: Uint8ClampedArray }, number, number];
    expect([x, y]).toEqual([16, 16]);
    expect(Array.from(image.data)).toEqual(Array.from(preprocessOcrPixels(scaledPixels)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe("normalizeOcrCandidate — whitespace only, never content", () => {
  it.each([
    ["324775\n", "324775"],
    ["  J000376  ", "J000376"],
    ["\nV1.2.3\n\n", "V1.2.3"],
    ["DR040\t", "DR040"],
    ["ABC-123", "ABC-123"],
    ["ABC\n123", "ABC 123"],
    ["SN   0042", "SN 0042"],
  ])("%j → %j", (raw, expected) => {
    expect(normalizeOcrCandidate(raw)).toBe(expected);
  });

  it("device regression `3247751 ;`: keeps every non-whitespace character — correction is the technician's", () => {
    expect(normalizeOcrCandidate("3247751 ;\n")).toBe("3247751 ;");
  });

  it("never substitutes look-alike characters", () => {
    expect(normalizeOcrCandidate(" O0O l1I-Z2 ")).toBe("O0O l1I-Z2");
  });
});
