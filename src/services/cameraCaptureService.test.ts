/**
 * Offline-hardening guarantees for camera-assisted capture.
 *
 * The central claim under test: OCR must be able to run the FIRST time a technician uses it on a
 * device with no Internet access. That requires (a) every Tesseract runtime asset to be served
 * from N-Go's own origin rather than jsDelivr, and (b) a failed initialisation to be retryable
 * rather than permanently poisoned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareFieldOcr } from "../utils/ocrFieldPipeline";
import type { GrayImage } from "../utils/ocrPreprocess";
import { blank, drawRun, toRgba } from "../utils/ocrSyntheticImages.testutil";
import {
  OCR_ASSET_PATHS,
  OCR_TIMEOUT_MS,
  SUPPORTED_BARCODE_FORMATS,
  _resetCameraCaptureServiceForTests,
  decodeBarcodeFromCanvas,
  detectWasmSimdSupport,
  getNativeBarcodeDetectorSupportedFormats,
  recognizeFieldValueFromCanvas,
  resolveOcrCorePath,
  runOcrPass,
  stopCameraStream,
} from "./cameraCaptureService";

const createWorker = vi.fn();
const setParameters = vi.fn();
const BrowserMultiFormatReader = vi.fn();

// Individual tests only describe the worker behaviour they care about (recognize/terminate); every
// fake worker also gets the shared setParameters spy so per-pass configuration can be asserted.
vi.mock("tesseract.js", () => ({
  createWorker: async (...args: unknown[]) => ({ setParameters, ...(await createWorker(...args)) }),
  OEM: { TESSERACT_ONLY: 0, LSTM_ONLY: 1, TESSERACT_LSTM_COMBINED: 2, DEFAULT: 3 },
}));

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    constructor() { return BrowserMultiFormatReader(); }
  },
}));

function fakeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

/** A worker whose successive recognize() calls return the given reads. */
function workerReading(...reads: Array<[string, number]>) {
  const recognize = vi.fn();
  reads.forEach(([text, confidence]) => recognize.mockResolvedValueOnce({ data: { text, confidence } }));
  recognize.mockResolvedValue({ data: { text: reads[reads.length - 1]?.[0] ?? "", confidence: reads[reads.length - 1]?.[1] ?? 0 } });
  return { recognize };
}

/** jsdom has no 2D canvas: a stub context that serves `band` as the captured pixels and accepts
 *  the line images the pipeline renders for Tesseract. */
function stubCanvas2d(band: GrayImage) {
  const rgba = toRgba(band);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getImageData: () => ({ data: rgba, width: band.width, height: band.height }),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const canvas = document.createElement("canvas");
  canvas.width = band.width;
  canvas.height = band.height;
  return canvas;
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetCameraCaptureServiceForTests();
  setParameters.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("OCR asset paths are N-Go-controlled, not a third-party CDN", () => {
  const allPaths = Object.values(OCR_ASSET_PATHS);

  it("no OCR asset path references jsDelivr", () => {
    for (const path of allPaths) expect(path).not.toContain("jsdelivr");
  });

  it("no OCR asset path references unpkg", () => {
    for (const path of allPaths) expect(path).not.toContain("unpkg");
  });

  it("no OCR asset path is an absolute URL to any external host", () => {
    for (const path of allPaths) {
      expect(path.startsWith("/")).toBe(true);
      expect(path).not.toMatch(/^https?:\/\//);
      expect(path).not.toMatch(/^\/\//);
    }
  });

  it("the worker, core and language paths all live under our own /tesseract/ directory", () => {
    expect(OCR_ASSET_PATHS.worker).toBe("/tesseract/worker.min.js");
    expect(OCR_ASSET_PATHS.coreBaseline).toBe("/tesseract/tesseract-core-lstm.wasm.js");
    expect(OCR_ASSET_PATHS.coreSimd).toBe("/tesseract/tesseract-core-simd-lstm.wasm.js");
    expect(OCR_ASSET_PATHS.langDir).toBe("/tesseract/lang");
  });

  it("resolves a single explicit core FILE, never a directory (which would let tesseract request an unpackaged relaxed-SIMD build)", () => {
    const corePath = resolveOcrCorePath();
    expect(corePath.endsWith(".wasm.js")).toBe(true);
    expect([OCR_ASSET_PATHS.coreBaseline, OCR_ASSET_PATHS.coreSimd]).toContain(corePath);
    expect(corePath).not.toContain("relaxedsimd");
  });

  it("picks the SIMD core when the engine validates SIMD, and the baseline core when it does not", () => {
    const validate = vi.spyOn(WebAssembly, "validate");
    validate.mockReturnValue(true);
    expect(detectWasmSimdSupport()).toBe(true);
    expect(resolveOcrCorePath()).toBe(OCR_ASSET_PATHS.coreSimd);

    validate.mockReturnValue(false);
    expect(detectWasmSimdSupport()).toBe(false);
    expect(resolveOcrCorePath()).toBe(OCR_ASSET_PATHS.coreBaseline);
  });

  it("treats a throwing WebAssembly.validate as 'no SIMD' rather than crashing the capture flow", () => {
    vi.spyOn(WebAssembly, "validate").mockImplementation(() => { throw new Error("nope"); });
    expect(detectWasmSimdSupport()).toBe(false);
    expect(resolveOcrCorePath()).toBe(OCR_ASSET_PATHS.coreBaseline);
  });
});

describe("Tesseract worker is created against the local assets", () => {
  it("passes our self-hosted worker/core/lang paths and the LSTM-only engine mode", async () => {
    createWorker.mockResolvedValue(workerReading(["SN-123 ", 91]));

    expect(await runOcrPass(fakeCanvas(), "7")).toEqual({ text: "SN-123 ", confidence: 91 });

    expect(createWorker).toHaveBeenCalledTimes(1);
    const [lang, oem, options] = createWorker.mock.calls[0] as [string, number, Record<string, unknown>];
    expect(lang).toBe("eng");
    expect(oem).toBe(1); // OEM.LSTM_ONLY — matches the *-lstm core and 4.0.0_best_int model
    expect(options.workerPath).toBe(OCR_ASSET_PATHS.worker);
    expect(options.langPath).toBe(OCR_ASSET_PATHS.langDir);
    // Deliberately uncompressed on every platform: Android's AAPT2 build tool silently gunzips
    // any `.gz`-suffixed asset and strips the extension, so `gzip: true` (which makes tesseract
    // request `eng.traineddata.gz`) 404s on Android specifically — proven against a real built
    // APK. gzip: false makes every platform ship and request the same plain `eng.traineddata`.
    expect(options.gzip).toBe(false);
    expect(String(options.corePath)).not.toContain("jsdelivr");
    expect(String(options.corePath)).not.toContain("unpkg");
  });

  it("never mentions an external CDN host in any option passed to createWorker", async () => {
    createWorker.mockResolvedValue(workerReading(["x", 90]));
    await runOcrPass(fakeCanvas(), "7");
    const serialized = JSON.stringify(createWorker.mock.calls[0]);
    expect(serialized).not.toContain("jsdelivr");
    expect(serialized).not.toContain("unpkg");
    expect(serialized).not.toContain("cdn.");
  });

  it("reuses a successfully initialised worker instead of spawning one per pass", async () => {
    createWorker.mockResolvedValue(workerReading(["a", 90]));
    await runOcrPass(fakeCanvas(), "7");
    await runOcrPass(fakeCanvas(), "13");
    expect(createWorker).toHaveBeenCalledTimes(1);
  });
});

describe("identifier OCR profile", () => {
  it("turns off the English word lists at init (identifiers aren't prose) — and sets no whitelist", async () => {
    createWorker.mockResolvedValue(workerReading(["S4912/89", 90]));
    await runOcrPass(fakeCanvas(), "7");
    const config = createWorker.mock.calls[0][3] as Record<string, string>;
    expect(config).toEqual({ load_system_dawg: "0", load_freq_dawg: "0" });
    const params = setParameters.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty("tessedit_char_whitelist");
    expect(params).not.toHaveProperty("tessedit_char_blacklist");
  });

  it("sets the requested segmentation mode per pass, with a fixed DPI", async () => {
    createWorker.mockResolvedValue(workerReading(["x", 90]));
    await runOcrPass(fakeCanvas(), "7");
    await runOcrPass(fakeCanvas(), "8");
    await runOcrPass(fakeCanvas(), "13");
    expect(setParameters.mock.calls.map((c) => (c[0] as Record<string, unknown>).tessedit_pageseg_mode)).toEqual(["7", "8", "13"]);
    expect(setParameters.mock.calls.every((c) => (c[0] as Record<string, unknown>).user_defined_dpi === "300")).toBe(true);
  });

  it("a failed setParameters drops the worker so the next attempt re-initialises", async () => {
    createWorker.mockResolvedValue(workerReading(["ok", 90]));
    setParameters.mockRejectedValueOnce(new Error("config failed"));
    await expect(runOcrPass(fakeCanvas(), "7")).rejects.toThrow();
    await expect(runOcrPass(fakeCanvas(), "7")).resolves.toEqual({ text: "ok", confidence: 90 });
    expect(createWorker).toHaveBeenCalledTimes(2);
  });
});

describe("recognizeFieldValueFromCanvas — isolated line, bounded passes, deterministic choice", () => {
  function band() {
    const img = blank(900, 220);
    drawRun(img, { x: 300, centerY: 110, count: 6, charH: 48 }); // a centred value
    return img;
  }

  it("stops after ONE pass when the first read is clean and confident", async () => {
    const worker = workerReading(["324775\n", 93]);
    createWorker.mockResolvedValue(worker);
    const result = await recognizeFieldValueFromCanvas(stubCanvas2d(band()));
    expect(result).toEqual({ status: "ok", text: "324775", confidence: 93, lowConfidence: false });
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    expect((setParameters.mock.calls[0][0] as Record<string, unknown>).tessedit_pageseg_mode).toBe("7");
  });

  it("runs the bounded plan (≤4 passes) when the first read is doubtful, and picks the clean candidate", async () => {
    const worker = workerReading(["3247751 ;", 62], ["324775", 78], ["324775", 74]);
    createWorker.mockResolvedValue(worker);
    const result = await recognizeFieldValueFromCanvas(stubCanvas2d(band()));
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.text).toBe("324775");
    expect(worker.recognize.mock.calls.length).toBeGreaterThan(1);
    expect(worker.recognize.mock.calls.length).toBeLessThanOrEqual(4);
    // Never general automatic page layout.
    expect(setParameters.mock.calls.every((c) => ["7", "8", "13"].includes((c[0] as Record<string, string>).tessedit_pageseg_mode))).toBe(true);
  });

  it("returns the chosen engine text EXACTLY (whitespace-normalized) — never corrected", async () => {
    createWorker.mockResolvedValue(workerReading(["S49l2/89", 40], ["S49l2/89", 38], ["S49l2/89", 35]));
    const result = await recognizeFieldValueFromCanvas(stubCanvas2d(band()));
    // Even with passes agreeing, a weak read is flagged for careful review — but not changed.
    expect(result).toMatchObject({ status: "ok", text: "S49l2/89", lowConfidence: true });
  });

  it("reports clipped / no-text from geometry WITHOUT running the OCR engine", async () => {
    const clipped = blank(900, 220);
    drawRun(clipped, { x: -15, centerY: 110, count: 8, charH: 48 });
    expect(await recognizeFieldValueFromCanvas(stubCanvas2d(clipped))).toEqual({ status: "clipped" });
    vi.restoreAllMocks();
    expect(await recognizeFieldValueFromCanvas(stubCanvas2d(blank(900, 220)))).toEqual({ status: "no-text" });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("no-text when every pass reads nothing alphanumeric", async () => {
    createWorker.mockResolvedValue(workerReading([" ; ", 30], ["", 0], ["'", 10]));
    expect(await recognizeFieldValueFromCanvas(stubCanvas2d(band()))).toEqual({ status: "no-text" });
  });

  it("follows the guide it is given (the line on the guide, not the band centre)", async () => {
    const img = blank(900, 220);
    drawRun(img, { x: 300, centerY: 50, count: 3, charH: 40 }); // short line, aimed at
    drawRun(img, { x: 200, centerY: 165, count: 9, charH: 40 }); // long line below
    const worker = workerReading(["C25", 95]);
    createWorker.mockResolvedValue(worker);
    await recognizeFieldValueFromCanvas(stubCanvas2d(img), { guideY: 50 });
    const expected = prepareFieldOcr(toRgba(img), img.width, img.height, 50);
    if (expected.status !== "ok") throw new Error("fixture should isolate a line");
    const sent = worker.recognize.mock.calls[0][0] as HTMLCanvasElement;
    expect(sent.width).toBe(expected.variants[0].image.width); // the 3-character line's image
    const other = prepareFieldOcr(toRgba(img), img.width, img.height, 165);
    if (other.status !== "ok") throw new Error("fixture should isolate a line");
    expect(sent.width).not.toBe(other.variants[0].image.width);
  });

  it("a failure on the FIRST pass is an error; a failure on a later pass keeps earlier reads", async () => {
    createWorker.mockResolvedValueOnce({ recognize: vi.fn().mockRejectedValue(new Error("worker died")) });
    await expect(recognizeFieldValueFromCanvas(stubCanvas2d(band()))).rejects.toThrow();

    const recognize = vi.fn()
      .mockResolvedValueOnce({ data: { text: "324775", confidence: 70 } })
      .mockRejectedValueOnce(new Error("worker died"));
    createWorker.mockResolvedValueOnce({ recognize });
    await expect(recognizeFieldValueFromCanvas(stubCanvas2d(band()))).resolves.toMatchObject({ status: "ok", text: "324775" });
  });
});

describe("initialisation failures are recoverable, not permanently cached", () => {
  it("a failed worker initialisation can be retried successfully on a later attempt", async () => {
    createWorker.mockRejectedValueOnce(new Error("offline: asset unreachable"));
    await expect(runOcrPass(fakeCanvas(), "7")).rejects.toThrow();

    createWorker.mockResolvedValueOnce(workerReading(["recovered", 90]));
    await expect(runOcrPass(fakeCanvas(), "7")).resolves.toMatchObject({ text: "recovered" });
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("a worker that fails mid-recognition is discarded so the next attempt re-initialises", async () => {
    createWorker.mockResolvedValueOnce({
      recognize: vi.fn().mockRejectedValue(new Error("worker died")),
    });
    await expect(runOcrPass(fakeCanvas(), "7")).rejects.toThrow();

    createWorker.mockResolvedValueOnce(workerReading(["second try", 90]));
    await expect(runOcrPass(fakeCanvas(), "7")).resolves.toMatchObject({ text: "second try" });
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("a failed ZXing lazy-load does not poison later scan attempts", async () => {
    // First attempt: constructing the reader blows up (simulates a failed chunk load).
    BrowserMultiFormatReader.mockImplementationOnce(() => { throw new Error("chunk load failed"); });
    await expect(decodeBarcodeFromCanvas(fakeCanvas())).resolves.toBeNull();

    // Second attempt: the module loads fine and a code is found — proving the cache was cleared.
    BrowserMultiFormatReader.mockImplementationOnce(() => ({
      decodeFromCanvas: () => ({
        getText: () => "ASSET-42",
        getBarcodeFormat: () => "CODE_128",
      }),
    }));
    await expect(decodeBarcodeFromCanvas(fakeCanvas())).resolves.toEqual({
      value: "ASSET-42",
      format: "code_128",
    });
  });
});

describe("OCR is time-bounded so the dialog can never hang on 'Reading…'", () => {
  it("rejects rather than waiting forever when worker initialisation never settles", async () => {
    vi.useFakeTimers();
    createWorker.mockReturnValue(new Promise(() => { /* never settles — unreachable asset */ }));

    const attempt = runOcrPass(fakeCanvas(), "7");
    const assertion = expect(attempt).rejects.toThrow(/Timed out/);
    await vi.advanceTimersByTimeAsync(OCR_TIMEOUT_MS + 1000);
    await assertion;
  });

  it("rejects when recognition itself never settles", async () => {
    vi.useFakeTimers();
    createWorker.mockResolvedValue({ recognize: () => new Promise(() => {}) });

    const attempt = runOcrPass(fakeCanvas(), "7");
    const assertion = expect(attempt).rejects.toThrow(/Timed out/);
    await vi.advanceTimersByTimeAsync(OCR_TIMEOUT_MS + 1000);
    await assertion;
  });

  it("terminates a worker that arrives after the attempt already timed out, instead of leaking it", async () => {
    vi.useFakeTimers();
    const terminate = vi.fn().mockResolvedValue(undefined);
    let settleWorker: ((w: unknown) => void) | undefined;
    createWorker.mockReturnValue(new Promise((res) => { settleWorker = res; }));

    const attempt = runOcrPass(fakeCanvas(), "7");
    const assertion = expect(attempt).rejects.toThrow(/Timed out/);
    await vi.advanceTimersByTimeAsync(OCR_TIMEOUT_MS + 1000);
    await assertion;

    // The worker finally finishes initialising, long after nothing is waiting for it.
    settleWorker?.({ recognize: vi.fn(), terminate });
    await vi.advanceTimersByTimeAsync(0);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("uses a timeout long enough for a real first-run model load but short enough to be a UI escape hatch", () => {
    expect(OCR_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    expect(OCR_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });
});

describe("native BarcodeDetector capability probing", () => {
  afterEach(() => {
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });

  it("returns null when the API is absent, so callers fall back to the bundled decoder", async () => {
    expect(await getNativeBarcodeDetectorSupportedFormats()).toBeNull();
  });

  it("intersects the browser's real reported formats with the ones we claim", async () => {
    const getSupportedFormats = vi.fn().mockResolvedValue(["qr_code", "code_128", "aztec"]);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector =
      Object.assign(function BarcodeDetectorStub() {}, { getSupportedFormats });

    expect(await getNativeBarcodeDetectorSupportedFormats()).toEqual(["qr_code", "code_128"]);
  });

  it("probes the capability once and caches it, rather than re-querying on every scanned frame", async () => {
    const getSupportedFormats = vi.fn().mockResolvedValue(["qr_code"]);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector =
      Object.assign(function BarcodeDetectorStub() {}, { getSupportedFormats });

    await getNativeBarcodeDetectorSupportedFormats();
    await getNativeBarcodeDetectorSupportedFormats();
    await getNativeBarcodeDetectorSupportedFormats();
    expect(getSupportedFormats).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed probe, so a transient error cannot permanently disable the native path", async () => {
    const getSupportedFormats = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(["qr_code"]);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector =
      Object.assign(function BarcodeDetectorStub() {}, { getSupportedFormats });

    expect(await getNativeBarcodeDetectorSupportedFormats()).toBeNull();
    expect(await getNativeBarcodeDetectorSupportedFormats()).toEqual(["qr_code"]);
  });
});

describe("claimed format list", () => {
  it("does not advertise upc_e, which the shipped fallback decoder cannot read", () => {
    expect(SUPPORTED_BARCODE_FORMATS).not.toContain("upc_e");
  });

  it("advertises exactly the eight formats proven in barcodeFormatSupport.test.ts", () => {
    expect([...SUPPORTED_BARCODE_FORMATS].sort()).toEqual([
      "code_128", "code_39", "data_matrix", "ean_13", "ean_8", "pdf417", "qr_code", "upc_a",
    ]);
  });
});

describe("stream lifecycle", () => {
  it("stops every track and tolerates a null stream / an already-stopped track", () => {
    const stop = vi.fn();
    const throwingStop = vi.fn(() => { throw new Error("already stopped"); });
    expect(() => stopCameraStream(null)).not.toThrow();
    expect(() =>
      stopCameraStream({ getTracks: () => [{ stop }, { stop: throwingStop }] } as unknown as MediaStream),
    ).not.toThrow();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(throwingStop).toHaveBeenCalledTimes(1);
  });
});
