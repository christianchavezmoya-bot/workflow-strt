/**
 * Platform-neutral camera-assisted field capture: QR/barcode decoding and targeted-region OCR.
 *
 * OBSERVABILITY/PRIVACY NOTE: every function here processes frames entirely in the browser/
 * WebView. Nothing is ever uploaded to a third-party/cloud recognition service — barcode
 * decoding uses the browser's built-in BarcodeDetector where available, falling back to the
 * bundled (lazy-loaded) @zxing/library decoder; OCR uses the bundled (lazy-loaded) tesseract.js,
 * which runs its recognition entirely as local WASM.
 *
 * OFFLINE NOTE: tesseract.js defaults its worker/core/language paths to jsDelivr, which would
 * make the FIRST OCR use on a device require Internet access. N-Go is offline-first, so we
 * instead serve all three from our own origin (see OCR_ASSET_PATHS below and
 * scripts/sync-ocr-assets.mjs, which copies them into public/tesseract/ at install/build time).
 * On Capacitor these ship inside the installed app bundle, so OCR works with no network at all
 * from first use. There is no runtime dependency on jsDelivr, unpkg, or any other external host.
 *
 * Both decoder libraries are still dynamically imported ONLY when actually needed — code lazy-
 * loading (keeping them out of the initial JS bundle) and asset availability (packaging the WASM
 * and model with the app) are independent concerns, and this file preserves both.
 *
 * This runs identically on Capacitor iOS, Capacitor Android, and mobile web (Safari/Chrome) —
 * Capacitor apps render inside a real WKWebView/Chrome WebView, both of which support
 * getUserMedia once camera permission is granted (already declared natively for the existing
 * photo-capture flow — see ios/App/App/Info.plist, android/app/src/main/AndroidManifest.xml).
 * There is no separate "native adapter" needed for the camera stream itself; only capability
 * detection distinguishes environments, never isMobileNativePlatform() alone (mobile web is a
 * first-class target, not a fallback).
 */

import type { PSM } from "tesseract.js";
import { debugLog } from "../utils/appEnvironment";
import { releaseCanvas } from "../utils/fieldCaptureDiagnostics";
import { planOcrPasses, prepareFieldOcr, type OcrPsm } from "../utils/ocrFieldPipeline";
import { grayToRgba, type GrayImage } from "../utils/ocrPreprocess";
import {
  isConfidentEnough,
  LOW_CONFIDENCE_SCORE,
  scoreOcrCandidate,
  selectOcrCandidate,
  type OcrPassResult,
} from "../utils/ocrResultSelection";

export type BarcodeFormat =
  | "qr_code"
  | "code_128"
  | "code_39"
  | "ean_13"
  | "ean_8"
  | "upc_a"
  | "data_matrix"
  | "pdf417";

/**
 * The formats this feature claims to support. Every entry here is proven by a real
 * encode-then-decode round trip against the ZXing fallback decoder in
 * src/services/barcodeFormatSupport.test.ts — nothing is listed on the strength of
 * documentation alone.
 *
 * DELIBERATELY ABSENT: `upc_e`. @zxing/library@0.23.0 ships a UPCEReader and wires it into
 * MultiFormatReader, but it fails to decode a structurally valid 51-module UPC-E symbol at every
 * scale/quiet-zone/orientation we tried (including calling UPCEReader directly). Rather than
 * claim support we cannot demonstrate, UPC-E is excluded. Note UPC-A is unaffected and remains
 * supported. If a future ZXing release decodes UPC-E, add it back together with its fixture test.
 */
export const SUPPORTED_BARCODE_FORMATS: BarcodeFormat[] = [
  "qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "data_matrix", "pdf417",
];

// ── Self-hosted OCR asset paths ─────────────────────────────────────────────────────────────

/**
 * Root-relative paths, resolved by tesseract.js against `window.location.href`, so they land on
 * N-Go's own origin in every environment: `https://www.strata-ngo.com/tesseract/...` on web,
 * `capacitor://localhost/tesseract/...` on iOS, `http://localhost/tesseract/...` on Android.
 *
 * These MUST stay in sync with scripts/sync-ocr-assets.mjs, which is what puts the files there.
 */
export const OCR_ASSET_PATHS = {
  worker: "/tesseract/worker.min.js",
  /** Baseline build — correct on every WASM-capable device, just slower than the SIMD build. */
  coreBaseline: "/tesseract/tesseract-core-lstm.wasm.js",
  /** SIMD build — materially faster recognition; only requested when SIMD actually validates. */
  coreSimd: "/tesseract/tesseract-core-simd-lstm.wasm.js",
  /** A DIRECTORY: tesseract.js fetches `${langPath}/eng.traineddata` from it (uncompressed —
   *  see the `gzip: false` note on the createWorker() call below for why). */
  langDir: "/tesseract/lang",
} as const;

/**
 * Minimal, dependency-free WebAssembly SIMD probe. The byte sequence is the standard SIMD
 * detection module — it is exactly the one `wasm-feature-detect` uses for its `simd()` check
 * (verified against the copy tesseract.js already installs, rather than transcribed from
 * documentation), and it validates only if the engine understands the v128 SIMD opcodes.
 *
 * We do this ourselves rather than letting tesseract.js pick a core build, because tesseract's
 * own selection also considers relaxed-SIMD and would then request a `relaxedsimd` file that we
 * deliberately do not package — which offline would be an unrecoverable 404 rather than a
 * slower-but-working fallback.
 */
export function detectWasmSimdSupport(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
      253, 15, 253, 98, 11,
    ]));
  } catch {
    return false;
  }
}

/** The single core build this device will ever request. Never a directory, never relaxed-SIMD. */
export function resolveOcrCorePath(): string {
  return detectWasmSimdSupport() ? OCR_ASSET_PATHS.coreSimd : OCR_ASSET_PATHS.coreBaseline;
}

/** Hard ceiling on a single OCR attempt (worker spawn + core/model load + recognize). Without
 *  this, an unreachable or truncated asset can leave the capture dialog showing "Reading…"
 *  forever, with the technician's only escape being Cancel. */
export const OCR_TIMEOUT_MS = 45_000;

export interface BarcodeDecodeResult {
  value: string;
  format: string;
  /** Found only after turning the crop 90° (a vertical code). Diagnostics only. */
  rotated?: boolean;
}

// ── Capability detection ────────────────────────────────────────────────────────────────────

/** True when this environment can plausibly support a live camera preview at all. */
export function isCameraCaptureSupported(): boolean {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  // getUserMedia requires a secure context (HTTPS, or localhost/*.test for dev) — an insecure
  // context must fail closed to manual entry, never throw an unhandled error later.
  if (typeof window !== "undefined" && "isSecureContext" in window && !window.isSecureContext) {
    return false;
  }
  return true;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string; format: string }>>;
};

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return ctor ?? null;
}

/**
 * Runtime capability check — never assumes BarcodeDetector supports our claimed formats just
 * because it exists. Queries BarcodeDetector.getSupportedFormats() (a static method) and
 * intersects with SUPPORTED_BARCODE_FORMATS. Returns the actually-usable subset, or null if the
 * API isn't present at all (caller should fall back to the bundled decoder).
 *
 * The answer is cached: the scan loop calls decodeBarcodeFromCanvas() several times a second,
 * and re-running this capability query per frame is pure waste. Only a SUCCESSFUL probe is
 * cached, so a transient failure doesn't permanently disable the native path.
 */
let nativeFormatsCache: { value: BarcodeFormat[] | null } | null = null;

export async function getNativeBarcodeDetectorSupportedFormats(): Promise<BarcodeFormat[] | null> {
  if (nativeFormatsCache) return nativeFormatsCache.value;
  const Ctor = getBarcodeDetectorCtor();
  const getSupportedFormats = (
    Ctor as unknown as { getSupportedFormats?: () => Promise<string[]> } | null
  )?.getSupportedFormats;
  if (!Ctor || typeof getSupportedFormats !== "function") {
    nativeFormatsCache = { value: null };
    return null;
  }
  try {
    const supported = await getSupportedFormats();
    const value = SUPPORTED_BARCODE_FORMATS.filter((f) => supported.includes(f));
    nativeFormatsCache = { value };
    return value;
  } catch {
    return null; // not cached — a later frame may succeed
  }
}

// ── Camera stream lifecycle ─────────────────────────────────────────────────────────────────

export async function startCameraStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
}

/** Stops every track — the single place a stream is ever released, called from every real exit
 *  path (Use Value, Cancel, unmount, navigation away, error) so there is exactly one place that
 *  could leak a stream, and exactly one place to test that it doesn't. Retake/Scan Again keep a
 *  still-live stream open (no repeat permission prompt) and only call this to replace a stream
 *  whose tracks have already ended. */
export function stopCameraStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch { /* ignore — already stopped */ }
  }
}

// ── Barcode/QR decoding — always against an already-cropped image, never the full frame ──────
//
// ORIENTATION. Codes are mounted at any angle on equipment, and the technician shouldn't have to
// turn the phone. Measured against the shipped ZXing decoder with real generated fixtures
// (barcodeRotation.test.ts):
//   - QR and Data Matrix decode at 0°/90°/180°/270° as they are.
//   - Every linear format (Code 128, Code 39, EAN-13, EAN-8, UPC-A) and PDF417 decode at 0° and
//     180° (ZXing also scans each row reversed), but NOT at 90°/270°.
// So ONE extra attempt — the same crop turned 90° — completes the coverage: a 90° code becomes
// 180° (decodable) and a 270° code becomes 0°. At most two decodes per frame, the second only on
// a miss; QR/Data Matrix are found by the first in any orientation, so they're not slowed down.
// Rotation is done on the crop's own luminance pixels into a reusable per-session buffer — no
// extra canvas, no CSS, no resampling (a quarter turn just swaps width and height).
//
// The native BarcodeDetector path (Chromium/Android; absent in iOS WKWebView) is left as is: the
// platform detectors behind it are orientation-independent, and it can't be exercised in CI.

/** Reusable per-scan-session pixel buffers (see createScanBuffers). */
export interface ScanBuffers {
  luminance: Uint8ClampedArray | null;
  rotated: Uint8ClampedArray | null;
}

/** One per capture session; reused for every frame so continuous scanning allocates nothing
 *  per frame beyond what the decoder itself needs. */
export function createScanBuffers(): ScanBuffers {
  return { luminance: null, rotated: null };
}

function bufferOfSize(existing: Uint8ClampedArray | null, size: number): Uint8ClampedArray {
  return existing && existing.length === size ? existing : new Uint8ClampedArray(size);
}

/** RGBA → luminance with ZXing's own weighting ((R + 2G + B) / 4), into a reused buffer. */
export function rgbaToLuminanceInto(rgba: Uint8ClampedArray, width: number, height: number, buffers: ScanBuffers): Uint8ClampedArray {
  const out = bufferOfSize(buffers.luminance, width * height);
  buffers.luminance = out;
  for (let p = 0, i = 0; p < out.length; p += 1, i += 4) {
    out[p] = (rgba[i] + 2 * rgba[i + 1] + rgba[i + 2]) >> 2;
  }
  return out;
}

/**
 * Rotates a single-channel image clockwise by quarterTurns × 90°, exactly (pure index mapping —
 * no interpolation, nothing clipped, nothing stretched). For 90°/270° the output is height×width.
 * Writes into `dest` when it is already the right size.
 */
export function rotateLuminance(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  quarterTurns: number,
  dest: Uint8ClampedArray | null = null,
): { data: Uint8ClampedArray; width: number; height: number } {
  const q = ((quarterTurns % 4) + 4) % 4;
  const out = bufferOfSize(dest, width * height);
  if (q === 0) {
    out.set(src);
    return { data: out, width, height };
  }
  if (q === 2) {
    for (let i = 0, n = src.length; i < n; i += 1) out[n - 1 - i] = src[i];
    return { data: out, width, height };
  }
  // q === 1: (x, y) → (height − 1 − y, x) in a height-wide image; q === 3: (x, y) → (y, width − 1 − x).
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const target = q === 1 ? x * height + (height - 1 - y) : (width - 1 - x) * height + y;
      out[target] = src[row + x];
    }
  }
  return { data: out, width: height, height: width };
}

type ZxingLibrary = typeof import("@zxing/library");
type ZxingReader = import("@zxing/library").MultiFormatReader;
let zxingPromise: Promise<{ lib: ZxingLibrary; reader: ZxingReader; sidewaysReader: ZxingReader }> | null = null;

/**
 * Lazily loads the ZXing fallback decoder — one reader, reused for every frame.
 *
 * The rejection path matters: a cached REJECTED promise would make one unlucky failure (a
 * momentary chunk-load error, a killed network mid-download) permanent for the rest of the
 * session — every later scan would re-await the same rejection and the technician would have to
 * restart the app. Clearing the cache on failure makes a later attempt a genuine retry, while a
 * successful load is still only performed once.
 */
async function getZxing() {
  if (!zxingPromise) {
    zxingPromise = import("@zxing/library")
      .then((lib) => {
        const reader = new lib.MultiFormatReader();
        reader.setHints(null); // no format hints: try every format, as before
        // The turned attempt exists only for the formats that fail sideways — QR/Data Matrix are
        // already found upright in any orientation — so it skips the costly 2D detectors.
        const sidewaysReader = new lib.MultiFormatReader();
        sidewaysReader.setHints(new Map([[lib.DecodeHintType.POSSIBLE_FORMATS, [
          lib.BarcodeFormat.CODE_128, lib.BarcodeFormat.CODE_39, lib.BarcodeFormat.EAN_13,
          lib.BarcodeFormat.EAN_8, lib.BarcodeFormat.UPC_A, lib.BarcodeFormat.PDF_417,
        ]]]));
        return { lib, reader, sidewaysReader };
      })
      .catch((err) => {
        zxingPromise = null;
        throw err;
      });
  }
  return zxingPromise;
}

/** ZXing format names → ours (only PDF417 is spelled differently). */
function formatName(lib: ZxingLibrary, format: number): string {
  const name = String(lib.BarcodeFormat[format] ?? format).toLowerCase();
  return name === "pdf_417" ? "pdf417" : name;
}

function tryDecode(
  lib: ZxingLibrary,
  reader: ZxingReader,
  luminance: Uint8ClampedArray,
  width: number,
  height: number,
): BarcodeDecodeResult | null {
  try {
    const bitmap = new lib.BinaryBitmap(new lib.HybridBinarizer(new lib.RGBLuminanceSource(luminance, width, height)));
    // decodeWithState keeps the reader's configured hints (decode() would reset them).
    const result = reader.decodeWithState(bitmap);
    return { value: result.getText(), format: formatName(lib, result.getBarcodeFormat()) };
  } catch {
    return null; // nothing found — normal for most frames
  } finally {
    reader.reset();
  }
}

/**
 * Decodes a luminance frame in its original orientation and, only if that finds nothing, once
 * more turned 90° (see the ORIENTATION note above). Uses and refills the session's buffers.
 */
export async function decodeLuminanceAnyOrientation(
  luminance: Uint8ClampedArray,
  width: number,
  height: number,
  buffers: ScanBuffers,
): Promise<BarcodeDecodeResult | null> {
  const { lib, reader, sidewaysReader } = await getZxing();
  const upright = tryDecode(lib, reader, luminance, width, height);
  if (upright) return { ...upright, rotated: false };
  const turned = rotateLuminance(luminance, width, height, 1, buffers.rotated);
  buffers.rotated = turned.data;
  const sideways = tryDecode(lib, sidewaysReader, turned.data, turned.width, turned.height);
  return sideways ? { ...sideways, rotated: true } : null;
}

let nativeDetector: { formats: string; detector: InstanceType<BarcodeDetectorCtor> } | null = null;

/**
 * Decodes a barcode/QR from a canvas that has ALREADY been cropped to the target-window region
 * (see cameraCropMath.ts + CameraCaptureDialog.tsx) — this function never sees, and therefore
 * can never accidentally select a code from, anything outside that region. Tries the native
 * BarcodeDetector first (fast, on-device, no extra download) if it actually reports support for
 * our formats; otherwise the bundled ZXing fallback (Safari/iOS, or anywhere without
 * BarcodeDetector), in any of the four orientations.
 */
export async function decodeBarcodeFromCanvas(
  canvas: HTMLCanvasElement,
  buffers: ScanBuffers = createScanBuffers(),
): Promise<BarcodeDecodeResult | null> {
  const nativeFormats = await getNativeBarcodeDetectorSupportedFormats();
  const Ctor = getBarcodeDetectorCtor();
  if (Ctor && nativeFormats && nativeFormats.length > 0) {
    try {
      const key = nativeFormats.join(",");
      if (!nativeDetector || nativeDetector.formats !== key) {
        nativeDetector = { formats: key, detector: new Ctor({ formats: nativeFormats }) };
      }
      const hits = await nativeDetector.detector.detect(canvas);
      if (hits.length > 0) {
        return { value: hits[0].rawValue, format: hits[0].format };
      }
      return null;
    } catch {
      // Fall through to the bundled decoder rather than surfacing a hard failure — a single
      // unlucky frame must not break the continuous scan loop.
    }
  }

  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !canvas.width || !canvas.height) return null;
    const { width, height } = canvas;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    return await decodeLuminanceAnyOrientation(rgbaToLuminanceInto(pixels, width, height, buffers), width, height, buffers);
  } catch {
    return null; // no code found in this frame — normal/expected most of the time in the loop
  }
}

// ── OCR — always against an already-cropped image, never the full frame ──────────────────────

let tesseractWorkerPromise: Promise<import("tesseract.js").Worker> | null = null;

/**
 * Lazily spawns the Tesseract worker, wired to N-Go's own self-hosted assets.
 *
 * Every path here is same-origin: the worker script, the WASM core, and the English model. That
 * is what makes first-use OCR possible with no Internet access on an installed Capacitor app.
 * `OEM.LSTM_ONLY` matches the `*-lstm` core build and the `4.0.0_best_int` model that
 * scripts/sync-ocr-assets.mjs copies — the smaller, LSTM-only pair, since the legacy engine is
 * not used.
 *
 * Like the ZXing loader, a failed initialisation clears the cache so the next attempt genuinely
 * retries instead of replaying a cached rejection forever.
 */
async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = import("tesseract.js")
      .then(({ createWorker, OEM }) =>
        createWorker(
          "eng",
          OEM.LSTM_ONLY,
          {
            workerPath: OCR_ASSET_PATHS.worker,
            corePath: resolveOcrCorePath(),
            langPath: OCR_ASSET_PATHS.langDir,
            // UNCOMPRESSED on every platform, deliberately. Android's AAPT2 build tool silently
            // gunzips any `.gz`-suffixed asset and strips the extension while packaging the APK,
            // so a `gzip: true` config (tesseract then requests `${langPath}/eng.traineddata.gz`)
            // 404s on Android specifically — confirmed by inspecting a real built APK. iOS and web
            // are unaffected by that Android-only transform, but rather than carry a platform
            // branch here, every platform ships and requests the same plain `eng.traineddata`
            // (scripts/sync-ocr-assets.mjs decompresses it once at generation time).
            gzip: false,
          },
          // Identifier profile: field values (S4912/89, J000376, 19.0006X, DR040) are not English
          // prose, so the English word lists would only pull reads toward dictionary words.
          // These are init-only settings. Punctuation/number patterns stay on, and there is
          // deliberately NO character whitelist: values mix letters, digits and punctuation with
          // no safe universal subset, and a whitelist silently forces a wrong-but-allowed
          // character instead of an obvious error the technician can see and fix.
          { load_system_dawg: "0", load_freq_dawg: "0" },
        ),
      )
      .catch((err) => {
        tesseractWorkerPromise = null;
        throw err;
      });
  }
  return tesseractWorkerPromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export interface OcrPassOutput {
  /** Raw engine text. */
  text: string;
  /** Engine confidence 0–100. */
  confidence: number;
}

/**
 * ONE recognition pass over an already-isolated, already-preprocessed line image, with the given
 * page-segmentation mode. Bounded by OCR_TIMEOUT_MS so a stalled asset load surfaces as a normal,
 * recoverable error in the capture dialog instead of an indefinite "Reading…". On any failure the
 * cached worker is dropped, so the next attempt re-initialises from scratch.
 */
export async function runOcrPass(image: HTMLCanvasElement, psm: OcrPsm): Promise<OcrPassOutput> {
  const pendingWorker = getTesseractWorker();
  try {
    const worker = await withTimeout(
      pendingWorker,
      OCR_TIMEOUT_MS,
      "Timed out preparing the text recogniser.",
    );
    await worker.setParameters({
      // Never automatic page layout: the input is one isolated line (see ocrFieldPipeline.ts).
      tessedit_pageseg_mode: psm as PSM, // our literals are PSM enum values (ocrFieldPipeline.ts)
      // A camera crop carries no DPI; without a hint Tesseract guesses per image, which makes
      // the same label read differently from one attempt to the next.
      user_defined_dpi: "300",
    });
    const { data } = await withTimeout(
      worker.recognize(image),
      OCR_TIMEOUT_MS,
      "Timed out reading text from the image.",
    );
    return { text: data.text, confidence: data.confidence };
  } catch (err) {
    tesseractWorkerPromise = null; // a timed-out/failed worker must not be reused
    // Dropping the reference is not enough on the timeout path: the underlying createWorker()
    // may still be in flight and, when it eventually resolves, would leave a live Web Worker
    // (and its ~4 MB WASM heap) running with nothing pointing at it. Terminate it on arrival.
    void pendingWorker.then(
      (worker) => { try { void worker.terminate(); } catch { /* already gone */ } },
      () => { /* initialisation failed; nothing to terminate */ },
    );
    throw err;
  }
}

function grayToCanvas(img: GrayImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare the image for text recognition.");
  const imageData = ctx.createImageData(img.width, img.height);
  imageData.data.set(grayToRgba(img));
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export type FieldOcrResult =
  | {
      status: "ok";
      /** The chosen engine candidate, whitespace-normalized only — never corrected. */
      text: string;
      confidence: number;
      /** The review screen should suggest checking this one carefully. */
      lowConfidence: boolean;
    }
  /** No plausible text line on the guide, or nothing alphanumeric was read. */
  | { status: "no-text" }
  /** The aimed value runs off the target band — a retake will do better than a partial read. */
  | { status: "clipped" };

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Industrial field-value OCR for the captured target band (source pixels — never the full frame).
 *
 *   1. image side, pure and local: isolate the ONE line on the alignment guide, mask neighbours,
 *      deskew when confident, build ≤3 variants (utils/ocrFieldPipeline.ts)
 *   2. a bounded pass plan (≤4 Tesseract runs, line/raw-line/word modes — never automatic page
 *      layout), stopping after the first pass when it's already clean and confident
 *   3. deterministic candidate selection (utils/ocrResultSelection.ts) — ranking only; the
 *      returned text is exactly the engine's, whitespace-normalized
 *
 * Everything runs on-device: no network, no cloud OCR. The technician confirms or corrects the
 * result in the editable review step.
 */
export async function recognizeFieldValueFromCanvas(
  canvas: HTMLCanvasElement,
  options: { guideY?: number } = {},
): Promise<FieldOcrResult> {
  const started = now();
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Couldn't read the captured image.");
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const prepared = prepareFieldOcr(pixels, width, height, options.guideY ?? height / 2);
  const prepMs = now() - started;
  if (prepared.status !== "ok") {
    debugLog(`[FieldOCR] ${prepared.status} after ${prepMs.toFixed(0)}ms (${width}×${height})`);
    return prepared;
  }

  const results: OcrPassResult[] = [];
  const passTimes: string[] = [];
  for (const pass of planOcrPasses(prepared)) {
    const image = prepared.variants.find((v) => v.id === pass.variant)?.image;
    if (!image) continue;
    const passStarted = now();
    let output: OcrPassOutput;
    const passCanvas = grayToCanvas(image);
    try {
      output = await runOcrPass(passCanvas, pass.psm);
    } catch (err) {
      if (!results.length) throw err;
      break; // keep what earlier passes already read
    } finally {
      releaseCanvas(passCanvas); // don't leave per-pass pixel buffers for GC (iOS canvas memory cap)
    }
    passTimes.push(`${pass.id}=${(now() - passStarted).toFixed(0)}ms`);
    results.push({ passId: pass.id, text: output.text, confidence: output.confidence });
    if (results.length === 1 && isConfidentEnough(scoreOcrCandidate(results[0]))) break;
  }

  const best = selectOcrCandidate(results);
  debugLog(
    `[FieldOCR] prep=${prepMs.toFixed(0)}ms ${passTimes.join(" ")} total=${(now() - started).toFixed(0)}ms ` +
      `deskew=${prepared.deskewDegrees.toFixed(1)}° chose=${best ? `${best.passId} (${best.score.toFixed(0)})` : "none"}`,
  );
  if (!best) return { status: "no-text" };
  return {
    status: "ok",
    text: best.text,
    confidence: best.confidence,
    lowConfidence: best.score < LOW_CONFIDENCE_SCORE,
  };
}

/** Test-only: resets cached lazy singletons between test cases. Never called from app code. */
export function _resetCameraCaptureServiceForTests(): void {
  zxingPromise = null;
  tesseractWorkerPromise = null;
  nativeFormatsCache = null;
  nativeDetector = null;
}
