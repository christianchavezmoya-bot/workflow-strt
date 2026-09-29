/**
 * Offline-hardening guarantees for camera-assisted capture.
 *
 * The central claim under test: OCR must be able to run the FIRST time a technician uses it on a
 * device with no Internet access. That requires (a) every Tesseract runtime asset to be served
 * from N-Go's own origin rather than jsDelivr, and (b) a failed initialisation to be retryable
 * rather than permanently poisoned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OCR_ASSET_PATHS,
  OCR_TIMEOUT_MS,
  SUPPORTED_BARCODE_FORMATS,
  _resetCameraCaptureServiceForTests,
  decodeBarcodeFromCanvas,
  detectWasmSimdSupport,
  getNativeBarcodeDetectorSupportedFormats,
  recognizeTextFromCanvas,
  resolveOcrCorePath,
  stopCameraStream,
} from "./cameraCaptureService";

const createWorker = vi.fn();
const BrowserMultiFormatReader = vi.fn();

vi.mock("tesseract.js", () => ({
  createWorker: (...args: unknown[]) => createWorker(...args),
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

beforeEach(() => {
  vi.clearAllMocks();
  _resetCameraCaptureServiceForTests();
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
    const recognize = vi.fn().mockResolvedValue({ data: { text: "SN-123 " } });
    createWorker.mockResolvedValue({ recognize });

    const text = await recognizeTextFromCanvas(fakeCanvas());
    expect(text).toBe("SN-123");

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
    createWorker.mockResolvedValue({ recognize: vi.fn().mockResolvedValue({ data: { text: "x" } }) });
    await recognizeTextFromCanvas(fakeCanvas());
    const serialized = JSON.stringify(createWorker.mock.calls[0]);
    expect(serialized).not.toContain("jsdelivr");
    expect(serialized).not.toContain("unpkg");
    expect(serialized).not.toContain("cdn.");
  });

  it("returns raw recognized text with no character substitution", async () => {
    createWorker.mockResolvedValue({
      recognize: vi.fn().mockResolvedValue({ data: { text: "  O0O l1I-Z2  " } }),
    });
    expect(await recognizeTextFromCanvas(fakeCanvas())).toBe("O0O l1I-Z2");
  });

  it("reuses a successfully initialised worker instead of spawning one per capture", async () => {
    createWorker.mockResolvedValue({ recognize: vi.fn().mockResolvedValue({ data: { text: "a" } }) });
    await recognizeTextFromCanvas(fakeCanvas());
    await recognizeTextFromCanvas(fakeCanvas());
    expect(createWorker).toHaveBeenCalledTimes(1);
  });
});

describe("initialisation failures are recoverable, not permanently cached", () => {
  it("a failed worker initialisation can be retried successfully on a later attempt", async () => {
    createWorker.mockRejectedValueOnce(new Error("offline: asset unreachable"));
    await expect(recognizeTextFromCanvas(fakeCanvas())).rejects.toThrow();

    createWorker.mockResolvedValueOnce({
      recognize: vi.fn().mockResolvedValue({ data: { text: "recovered" } }),
    });
    await expect(recognizeTextFromCanvas(fakeCanvas())).resolves.toBe("recovered");
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("a worker that fails mid-recognition is discarded so the next attempt re-initialises", async () => {
    createWorker.mockResolvedValueOnce({
      recognize: vi.fn().mockRejectedValue(new Error("worker died")),
    });
    await expect(recognizeTextFromCanvas(fakeCanvas())).rejects.toThrow();

    createWorker.mockResolvedValueOnce({
      recognize: vi.fn().mockResolvedValue({ data: { text: "second try" } }),
    });
    await expect(recognizeTextFromCanvas(fakeCanvas())).resolves.toBe("second try");
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

    const attempt = recognizeTextFromCanvas(fakeCanvas());
    const assertion = expect(attempt).rejects.toThrow(/Timed out/);
    await vi.advanceTimersByTimeAsync(OCR_TIMEOUT_MS + 1000);
    await assertion;
  });

  it("rejects when recognition itself never settles", async () => {
    vi.useFakeTimers();
    createWorker.mockResolvedValue({ recognize: () => new Promise(() => {}) });

    const attempt = recognizeTextFromCanvas(fakeCanvas());
    const assertion = expect(attempt).rejects.toThrow(/Timed out/);
    await vi.advanceTimersByTimeAsync(OCR_TIMEOUT_MS + 1000);
    await assertion;
  });

  it("terminates a worker that arrives after the attempt already timed out, instead of leaking it", async () => {
    vi.useFakeTimers();
    const terminate = vi.fn().mockResolvedValue(undefined);
    let settleWorker: ((w: unknown) => void) | undefined;
    createWorker.mockReturnValue(new Promise((res) => { settleWorker = res; }));

    const attempt = recognizeTextFromCanvas(fakeCanvas());
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
