/**
 * Lifecycle accounting + DEV diagnostics for camera field capture (CameraCaptureAction).
 *
 * Counters are always maintained (a few integer increments) so tests can prove that repeated
 * capture sessions release everything they acquire: camera streams, scan loops, capture canvases.
 *
 * The trace is DEV-build only (isDebugFeaturesEnabled): a bounded ring buffer of lifecycle events,
 * each also sent to debugLog — which Capacitor forwards to the native console on device builds —
 * and exposed as `window.__fieldCapture` for Safari Web Inspector. Production builds record
 * nothing and print nothing.
 */
import { debugLog, isDebugFeaturesEnabled } from "./appEnvironment";

export interface FieldCaptureCounters {
  /** Capture dialogs currently mounted. */
  activeSessions: number;
  /** Camera streams adopted by a session and not yet stopped. */
  liveStreams: number;
  /** QR/barcode decode loops currently running. */
  activeScanLoops: number;
  /** Capture canvases currently holding pixel memory (released = width/height 0). */
  captureCanvases: number;
}

const counters: FieldCaptureCounters = { activeSessions: 0, liveStreams: 0, activeScanLoops: 0, captureCanvases: 0 };
const TRACE_LIMIT = 500;
const trace: string[] = [];
let nextSessionId = 1;

export function newCaptureSessionId(): number {
  return nextSessionId++;
}

export function adjustCaptureCounter(key: keyof FieldCaptureCounters, delta: number): void {
  counters[key] += delta;
}

export function getCaptureCounters(): FieldCaptureCounters {
  return { ...counters };
}

function format(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
}

/** Records one lifecycle event (DEV builds only). */
export function traceCapture(session: number | string, event: string, detail: Record<string, unknown> = {}): void {
  if (!isDebugFeaturesEnabled()) return;
  const t = typeof performance !== "undefined" ? Math.round(performance.now()) : Date.now();
  const extra = format(detail);
  const line = `[FieldCapture] t=${t} session=${session} ${event}${extra ? ` ${extra}` : ""} | ` +
    `streams=${counters.liveStreams} loops=${counters.activeScanLoops} sessions=${counters.activeSessions} canvases=${counters.captureCanvases}`;
  trace.push(line);
  if (trace.length > TRACE_LIMIT) trace.shift();
  debugLog(line);
}

if (typeof window !== "undefined" && isDebugFeaturesEnabled()) {
  (window as unknown as { __fieldCapture?: unknown }).__fieldCapture = {
    trace,
    counters: getCaptureCounters,
  };
}

/** Frees a canvas's pixel memory now rather than whenever GC gets to it — WebKit on iOS caps total
 *  canvas memory, and a released canvas can't be read by anything still holding it. */
export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

/** Test-only. */
export function _resetFieldCaptureDiagnosticsForTests(): void {
  counters.activeSessions = 0;
  counters.liveStreams = 0;
  counters.activeScanLoops = 0;
  counters.captureCanvases = 0;
  trace.length = 0;
}
