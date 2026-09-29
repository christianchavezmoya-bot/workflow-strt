/**
 * Platform-neutral camera-assisted field capture: QR/barcode decoding and targeted-region OCR.
 *
 * OBSERVABILITY/PRIVACY NOTE: every function here processes frames entirely in the browser/
 * WebView. Nothing is ever uploaded to a third-party/cloud recognition service — barcode
 * decoding uses the browser's built-in BarcodeDetector where available, falling back to the
 * bundled (lazy-loaded) @zxing/browser library; OCR uses the bundled (lazy-loaded) tesseract.js,
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
  /** A DIRECTORY: tesseract.js fetches `${langPath}/eng.traineddata.gz` from it. */
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
 *  could leak a stream, and exactly one place to test that it doesn't. Never called on
 *  Retake/Scan Again — those keep the existing stream open to avoid a repeat permission prompt. */
export function stopCameraStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch { /* ignore — already stopped */ }
  }
}

// ── Barcode/QR decoding — always against an already-cropped image, never the full frame ──────

let zxingReaderPromise: Promise<import("@zxing/browser").BrowserMultiFormatReader> | null = null;

/**
 * Lazily loads the ZXing fallback decoder.
 *
 * The rejection path matters: a cached REJECTED promise would make one unlucky failure (a
 * momentary chunk-load error, a killed network mid-download) permanent for the rest of the
 * session — every later scan would re-await the same rejection and the technician would have to
 * restart the app. Clearing the cache on failure makes a later attempt a genuine retry, while a
 * successful load is still only performed once.
 */
async function getZxingReader() {
  if (!zxingReaderPromise) {
    zxingReaderPromise = import("@zxing/browser")
      .then(({ BrowserMultiFormatReader }) => new BrowserMultiFormatReader())
      .catch((err) => {
        zxingReaderPromise = null;
        throw err;
      });
  }
  return zxingReaderPromise;
}

/**
 * Decodes a barcode/QR from a canvas that has ALREADY been cropped to the target-window region
 * (see cameraCropMath.ts + CameraCaptureDialog.tsx) — this function never sees, and therefore
 * can never accidentally select a code from, anything outside that region. Tries the native
 * BarcodeDetector first (fast, on-device, no extra download) if it actually reports support for
 * our formats; otherwise lazy-loads the bundled ZXing fallback (Safari, or any environment
 * without BarcodeDetector).
 */
export async function decodeBarcodeFromCanvas(
  canvas: HTMLCanvasElement,
): Promise<BarcodeDecodeResult | null> {
  const nativeFormats = await getNativeBarcodeDetectorSupportedFormats();
  const Ctor = getBarcodeDetectorCtor();
  if (Ctor && nativeFormats && nativeFormats.length > 0) {
    try {
      const detector = new Ctor({ formats: nativeFormats });
      const hits = await detector.detect(canvas);
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
    const reader = await getZxingReader();
    const result = await reader.decodeFromCanvas(canvas);
    return { value: result.getText(), format: result.getBarcodeFormat().toString().toLowerCase() };
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
        createWorker("eng", OEM.LSTM_ONLY, {
          workerPath: OCR_ASSET_PATHS.worker,
          corePath: resolveOcrCorePath(),
          langPath: OCR_ASSET_PATHS.langDir,
          // The packaged model is `eng.traineddata.gz`; tesseract appends `.gz` when gzip is on.
          gzip: true,
        }),
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

/**
 * Recognizes text from a canvas that has ALREADY been cropped to the target-window region — the
 * OCR engine never receives the full camera frame. Returns the RAW recognized string with no
 * character substitution/normalization (no O->0, no I->1) — ambiguity resolution is the
 * technician's job via the mandatory review/confirm step, never this function's.
 *
 * Bounded by OCR_TIMEOUT_MS so a stalled asset load surfaces as a normal, recoverable error in
 * the capture dialog instead of an indefinite "Reading…". On timeout the cached worker promise
 * is dropped, so the next attempt re-initialises from scratch.
 */
export async function recognizeTextFromCanvas(canvas: HTMLCanvasElement): Promise<string> {
  try {
    const worker = await withTimeout(
      getTesseractWorker(),
      OCR_TIMEOUT_MS,
      "Timed out preparing the text recogniser.",
    );
    const { data } = await withTimeout(
      worker.recognize(canvas),
      OCR_TIMEOUT_MS,
      "Timed out reading text from the image.",
    );
    return data.text.trim();
  } catch (err) {
    tesseractWorkerPromise = null; // a timed-out/failed worker must not be reused
    throw err;
  }
}

/** Test-only: resets cached lazy singletons between test cases. Never called from app code. */
export function _resetCameraCaptureServiceForTests(): void {
  zxingReaderPromise = null;
  tesseractWorkerPromise = null;
  nativeFormatsCache = null;
}
