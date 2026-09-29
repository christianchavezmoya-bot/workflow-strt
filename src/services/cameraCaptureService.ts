/**
 * Platform-neutral camera-assisted field capture: QR/barcode decoding and targeted-region OCR.
 *
 * OBSERVABILITY/PRIVACY NOTE: every function here processes frames entirely in the browser/
 * WebView. Nothing is ever uploaded to a third-party/cloud recognition service — barcode
 * decoding uses the browser's built-in BarcodeDetector where available, falling back to the
 * bundled (lazy-loaded) @zxing/browser library; OCR uses the bundled (lazy-loaded) tesseract.js,
 * which runs its recognition entirely as local WASM. Both decoder libraries are dynamically
 * imported ONLY when actually needed — never part of the app's initial bundle (see
 * docs on lazy-loading in the PR description / CameraCaptureDialog.tsx).
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
  | "upc_e"
  | "data_matrix"
  | "pdf417";

/** The formats this feature claims to support — verified via decoder-format tests, not assumed. */
export const SUPPORTED_BARCODE_FORMATS: BarcodeFormat[] = [
  "qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "data_matrix", "pdf417",
];

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
 */
export async function getNativeBarcodeDetectorSupportedFormats(): Promise<BarcodeFormat[] | null> {
  const Ctor = getBarcodeDetectorCtor();
  const getSupportedFormats = (
    Ctor as unknown as { getSupportedFormats?: () => Promise<string[]> } | null
  )?.getSupportedFormats;
  if (!Ctor || typeof getSupportedFormats !== "function") return null;
  try {
    const supported = await getSupportedFormats();
    return SUPPORTED_BARCODE_FORMATS.filter((f) => supported.includes(f));
  } catch {
    return null;
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

async function getZxingReader() {
  if (!zxingReaderPromise) {
    zxingReaderPromise = import("@zxing/browser").then(
      ({ BrowserMultiFormatReader }) => new BrowserMultiFormatReader(),
    );
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

async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = import("tesseract.js").then(({ createWorker }) =>
      createWorker("eng"),
    );
  }
  return tesseractWorkerPromise;
}

/**
 * Recognizes text from a canvas that has ALREADY been cropped to the target-window region — the
 * OCR engine never receives the full camera frame. Returns the RAW recognized string with no
 * character substitution/normalization (no O->0, no I->1) — ambiguity resolution is the
 * technician's job via the mandatory review/confirm step, never this function's.
 */
export async function recognizeTextFromCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await getTesseractWorker();
  const { data } = await worker.recognize(canvas);
  return data.text.trim();
}

/** Test-only: resets cached lazy singletons between test cases. Never called from app code. */
export function _resetCameraCaptureServiceForTests(): void {
  zxingReaderPromise = null;
  tesseractWorkerPromise = null;
}
