/**
 * Rotation-invariant QR/barcode scanning, proven with REAL generated symbols decoded by the REAL
 * shipped decoder (no decoder mocks): every claimed format at 0°, 90°, 180° and 270°.
 *
 * Fixture rotation here uses its own straightforward implementation (`turn`), independent of the
 * production `rotateLuminance`, so a bug in the production rotation can't hide itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiFormatReader } from "@zxing/library";
import {
  _resetCameraCaptureServiceForTests,
  createScanBuffers,
  decodeBarcodeFromCanvas,
  decodeLuminanceAnyOrientation,
  rgbaToLuminanceInto,
  rotateLuminance,
  SUPPORTED_BARCODE_FORMATS,
  type BarcodeFormat,
} from "./cameraCaptureService";
import { encodeFixture, type LuminanceFixture } from "./barcodeFixtures.testutil";

/** Test-side reference rotation: clockwise quarter turns via explicit (x, y) arithmetic. */
function turn(f: LuminanceFixture, quarterTurns: number): LuminanceFixture {
  let { luminance, width, height } = f;
  for (let k = 0; k < quarterTurns; k += 1) {
    const out = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // Clockwise: new x = (oldHeight - 1 - y), new y = x, new width = oldHeight.
        out[x * height + (height - 1 - y)] = luminance[y * width + x];
      }
    }
    luminance = out;
    [width, height] = [height, width];
  }
  return { luminance, width, height };
}

const FIXTURES: ReadonlyArray<{ format: BarcodeFormat; bcid: string; text: string; expected: string; omniDirectional: boolean }> = [
  { format: "qr_code", bcid: "qrcode", text: "SN-ABC123456789", expected: "SN-ABC123456789", omniDirectional: true },
  { format: "code_128", bcid: "code128", text: "ASSET-00123456", expected: "ASSET-00123456", omniDirectional: false },
  { format: "code_39", bcid: "code39", text: "ABC123456", expected: "ABC123456", omniDirectional: false },
  { format: "ean_13", bcid: "ean13", text: "978020137962", expected: "9780201379624", omniDirectional: false },
  { format: "ean_8", bcid: "ean8", text: "9638507", expected: "96385074", omniDirectional: false },
  { format: "upc_a", bcid: "upca", text: "03600029145", expected: "036000291452", omniDirectional: false },
  { format: "data_matrix", bcid: "datamatrix", text: "DM-TEST-9988", expected: "DM-TEST-9988", omniDirectional: true },
  { format: "pdf417", bcid: "pdf417", text: "PDF417-TEST-123", expected: "PDF417-TEST-123", omniDirectional: false },
];

beforeEach(() => {
  _resetCameraCaptureServiceForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe("rotateLuminance — exact quarter-turn geometry", () => {
  // 3 wide × 2 high:
  //   1 2 3
  //   4 5 6
  const src = Uint8ClampedArray.from([1, 2, 3, 4, 5, 6]);

  it("90° clockwise: width/height swap, pixels mapped exactly", () => {
    const r = rotateLuminance(src, 3, 2, 1);
    expect([r.width, r.height]).toEqual([2, 3]);
    // 4 1
    // 5 2
    // 6 3
    expect(Array.from(r.data)).toEqual([4, 1, 5, 2, 6, 3]);
  });

  it("180°: same size, reversed", () => {
    const r = rotateLuminance(src, 3, 2, 2);
    expect([r.width, r.height]).toEqual([3, 2]);
    expect(Array.from(r.data)).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it("270° clockwise (90° counter-clockwise): width/height swap", () => {
    const r = rotateLuminance(src, 3, 2, 3);
    expect([r.width, r.height]).toEqual([2, 3]);
    // 3 6
    // 2 5
    // 1 4
    expect(Array.from(r.data)).toEqual([3, 6, 2, 5, 1, 4]);
  });

  it("matches an independent reference rotation for odd dimensions, at every quarter turn", () => {
    const w = 7;
    const h = 5;
    const data = Uint8ClampedArray.from({ length: w * h }, (_, i) => (i * 37) % 251);
    for (const q of [0, 1, 2, 3]) {
      const ours = rotateLuminance(data, w, h, q);
      const ref = turn({ luminance: data, width: w, height: h }, q);
      expect([ours.width, ours.height]).toEqual([ref.width, ref.height]);
      expect(Array.from(ours.data)).toEqual(Array.from(ref.luminance));
    }
  });

  it("no clipping, no stretching: every pixel survives exactly once, in a same-area image", () => {
    const w = 9;
    const h = 4;
    const data = Uint8ClampedArray.from({ length: w * h }, (_, i) => i);
    const r = rotateLuminance(data, w, h, 1);
    expect(r.data.length).toBe(w * h);
    expect(Array.from(r.data).sort((a, b) => a - b)).toEqual(Array.from(data));
  });

  it("four quarter turns (or 90° then 270°) restore the original", () => {
    const data = Uint8ClampedArray.from({ length: 11 * 3 }, (_, i) => (i * 13) % 200);
    let cur: { data: Uint8ClampedArray; width: number; height: number } = { data, width: 11, height: 3 };
    for (let k = 0; k < 4; k += 1) cur = rotateLuminance(cur.data, cur.width, cur.height, 1);
    expect(Array.from(cur.data)).toEqual(Array.from(data));
    const a = rotateLuminance(data, 11, 3, 1);
    const b = rotateLuminance(a.data, a.width, a.height, 3);
    expect(Array.from(b.data)).toEqual(Array.from(data));
  });

  it("writes into a supplied buffer of the right size instead of allocating", () => {
    const dest = new Uint8ClampedArray(6);
    expect(rotateLuminance(src, 3, 2, 1, dest).data).toBe(dest);
    expect(rotateLuminance(src, 3, 2, 1, new Uint8ClampedArray(5)).data).not.toBe(dest); // wrong size → new
  });
});

describe("rgbaToLuminanceInto", () => {
  it("uses ZXing's (R + 2G + B) / 4 weighting and reuses the session buffer", () => {
    const buffers = createScanBuffers();
    const rgba = Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255, 100, 200, 40, 255]);
    const first = rgbaToLuminanceInto(rgba, 3, 1, buffers);
    expect(Array.from(first)).toEqual([255, 0, (100 + 400 + 40) >> 2]);
    expect(rgbaToLuminanceInto(rgba, 3, 1, buffers)).toBe(first);
  });
});

describe("every claimed format decodes at 0°, 90°, 180° and 270° — real symbols, real decoder", () => {
  it("covers exactly the claimed format set", () => {
    expect(FIXTURES.map((f) => f.format).sort()).toEqual([...SUPPORTED_BARCODE_FORMATS].sort());
  });

  for (const fx of FIXTURES) {
    for (const quarter of [0, 1, 2, 3]) {
      it(`${fx.format} at ${quarter * 90}°`, async () => {
        const fixture = turn(encodeFixture(fx.bcid, fx.text), quarter);
        const result = await decodeLuminanceAnyOrientation(fixture.luminance, fixture.width, fixture.height, createScanBuffers());
        expect(result?.value).toBe(fx.expected); // orientation never alters the decoded string
        expect(result?.format).toBe(fx.format);
        // Only vertical LINEAR/PDF417 codes need the turned attempt; QR/Data Matrix never do,
        // and 180° is read by the upright attempt (ZXing scans rows both ways).
        const sideways = quarter === 1 || quarter === 3;
        expect(result?.rotated).toBe(sideways && !fx.omniDirectional);
      });
    }
  }
});

describe("bounded work per frame", () => {
  it("an upright (or upside-down) code costs ONE decode; a vertical one TWO; nothing in view TWO", async () => {
    const spy = vi.spyOn(MultiFormatReader.prototype, "decodeWithState");
    const code = encodeFixture("code128", "ASSET-00123456");

    await decodeLuminanceAnyOrientation(code.luminance, code.width, code.height, createScanBuffers());
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    const upsideDown = turn(code, 2);
    await decodeLuminanceAnyOrientation(upsideDown.luminance, upsideDown.width, upsideDown.height, createScanBuffers());
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    const vertical = turn(code, 1);
    await decodeLuminanceAnyOrientation(vertical.luminance, vertical.width, vertical.height, createScanBuffers());
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockClear();
    const empty = new Uint8ClampedArray(300 * 200).fill(255);
    expect(await decodeLuminanceAnyOrientation(empty, 300, 200, createScanBuffers())).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2); // never more than two attempts per frame
  });

  it("a QR code is found by the first attempt in any orientation (no added latency)", async () => {
    const spy = vi.spyOn(MultiFormatReader.prototype, "decodeWithState");
    for (const q of [0, 1, 2, 3]) {
      spy.mockClear();
      const qr = turn(encodeFixture("qrcode", "SN-ABC123456789"), q);
      await decodeLuminanceAnyOrientation(qr.luminance, qr.width, qr.height, createScanBuffers());
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});

describe("buffers are reused across continuous scanning", () => {
  it("repeated vertical-barcode frames keep ONE luminance and ONE rotated buffer — no growth", async () => {
    const buffers = createScanBuffers();
    const vertical = turn(encodeFixture("code39", "ABC123456"), 3);
    await decodeLuminanceAnyOrientation(vertical.luminance, vertical.width, vertical.height, buffers);
    const rotatedBuffer = buffers.rotated;
    expect(rotatedBuffer).not.toBeNull();
    for (let i = 0; i < 20; i += 1) {
      const r = await decodeLuminanceAnyOrientation(vertical.luminance, vertical.width, vertical.height, buffers);
      expect(r?.value).toBe("ABC123456");
    }
    expect(buffers.rotated).toBe(rotatedBuffer);
  });
});

describe("through the real canvas path (decodeBarcodeFromCanvas)", () => {
  /** jsdom has no 2D canvas: a stub context serving the fixture as RGBA. */
  function canvasShowing(f: LuminanceFixture) {
    const rgba = new Uint8ClampedArray(f.width * f.height * 4);
    for (let p = 0; p < f.luminance.length; p += 1) rgba.set([f.luminance[p], f.luminance[p], f.luminance[p], 255], p * 4);
    const getImageData = vi.fn(() => ({ data: rgba, width: f.width, height: f.height }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ getImageData } as unknown as CanvasRenderingContext2D);
    const canvas = document.createElement("canvas");
    canvas.width = f.width;
    canvas.height = f.height;
    return { canvas, getImageData };
  }

  it.each([0, 1, 2, 3])("a Code 128 label at %i quarter turns decodes, reading the pixels once per frame", async (q) => {
    const { canvas, getImageData } = canvasShowing(turn(encodeFixture("code128", "ASSET-00123456"), q));
    const buffers = createScanBuffers();
    const result = await decodeBarcodeFromCanvas(canvas, buffers);
    expect(result).toMatchObject({ value: "ASSET-00123456", format: "code_128" });
    expect(getImageData).toHaveBeenCalledTimes(1);
    expect(buffers.luminance).not.toBeNull();
  });

  it("a released (0×0) canvas — e.g. a session closed mid-decode — is a harmless miss", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    canvas.height = 0;
    await expect(decodeBarcodeFromCanvas(canvas)).resolves.toBeNull();
  });
});

describe("native BarcodeDetector path", () => {
  it("is used as-is when available — no rotation work, and ONE detector reused across frames", async () => {
    const detect = vi.fn().mockResolvedValue([]);
    const ctor = vi.fn(function BarcodeDetectorStub(this: { detect: typeof detect }) { this.detect = detect; });
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = Object.assign(ctor, {
      getSupportedFormats: vi.fn().mockResolvedValue(["qr_code", "code_128"]),
    });
    const zxing = vi.spyOn(MultiFormatReader.prototype, "decodeWithState");
    const canvas = document.createElement("canvas");
    for (let i = 0; i < 5; i += 1) await decodeBarcodeFromCanvas(canvas);
    expect(detect).toHaveBeenCalledTimes(5);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(zxing).not.toHaveBeenCalled();
  });
});
