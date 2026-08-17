/**
 * Catches what the app never sees otherwise: uncaught errors and rejected promises.
 *
 * Without this, a crash produces a blank screen and no record at all. Reports raised here are
 * marked S1 — the user hit something the app did not handle — and are deduplicated, because a
 * render loop can fire the same error hundreds of times.
 */
import { recordActionBreadcrumb } from "./breadcrumbs";
import { flushPendingFaultReports, submitFaultReport } from "./faultReportService";
import { registerFaultReportSink, serverFaultReportSink } from "./sinks";

/** Same error within this window is treated as one occurrence. */
const DEDUPE_WINDOW_MS = 60_000;
const MAX_AUTO_REPORTS_PER_SESSION = 10;

const seen = new Map<string, number>();
let autoReports = 0;
let installed = false;

function isExpectedAbort(err: Error, kind?: "crash" | "unhandled-rejection"): boolean {
  if (kind !== "unhandled-rejection") return false;
  if (!/AbortError/i.test(err.name)) return false;
  return !err.message || /AbortError|aborted|cancelled|canceled/i.test(err.message);
}

function shouldReport(signature: string): boolean {
  if (autoReports >= MAX_AUTO_REPORTS_PER_SESSION) return false;

  const now = Date.now();
  const last = seen.get(signature);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;

  seen.set(signature, now);
  autoReports += 1;
  return true;
}

/** Records a crash automatically. Exported so the error boundary reuses the same path. */
export async function captureFault(
  error: unknown,
  options: { kind?: "crash" | "unhandled-rejection"; title?: string; referenceCode?: string } = {}
): Promise<string | null> {
  const err = error instanceof Error ? error : new Error(String(error));
  if (isExpectedAbort(err, options.kind)) return null;
  const signature = `${err.name}:${err.message}`;
  if (!shouldReport(signature)) return null;

  const result = await submitFaultReport({
    kind: options.kind ?? "crash",
    severity: "S1",
    title: options.title ?? `${err.name}: ${err.message}`.slice(0, 200),
    error: { name: err.name, message: err.message, stack: err.stack },
    referenceCode: options.referenceCode,
  });

  return result.referenceCode;
}

/**
 * Installs global handlers and the server sink. Call once at startup.
 * Handlers never preventDefault — the browser console must still show the error in dev.
 */
export function installFaultCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  registerFaultReportSink(serverFaultReportSink);

  window.addEventListener("error", (event: ErrorEvent) => {
    // Failed resource loads surface here with no error object; they are not app faults.
    if (!event.error && !event.message) return;
    void captureFault(event.error ?? event.message, { kind: "crash" });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    void captureFault(event.reason, { kind: "unhandled-rejection" });
  });

  // Anything captured offline goes out once the app is back online or refocused.
  window.addEventListener("online", () => void flushPendingFaultReports());
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushPendingFaultReports();
  });

  recordActionBreadcrumb("app started");
  void flushPendingFaultReports();
}
