/**
 * Bounded, OVERWRITE-ONLY snapshot of the most recent sync-queue flush pass.
 *
 * OBSERVABILITY ONLY — this module never influences useSyncEngine's flush
 * loop; it is only ever written to by it. All writes are best-effort (a
 * failure here must never break sync) and this holds exactly one record —
 * not a growing history — so it cannot materially increase app storage.
 */
import offlineStore from "./offlineStore";
import { isMobileNativePlatform } from "../utils/platform";
import type { PendingAction } from "./localDB";

const LAST_FLUSH_PASS_CACHE_KEY = "last-flush-pass-diagnostic";

export interface FlushPassDueItem {
  id: string;
  opType?: string;
  entityId: string;
  entityType: string;
  status: PendingAction["status"];
}

export interface FlushPassDiagnostic {
  timestamp: string;
  canAttemptSyncFlush: boolean;
  serverReachable: boolean | null;
  hasNetworkSignal: boolean;
  circuitOpen: boolean;
  circuitOpenUntilMs: number;
  circuitFailureCount: number;
  dueCount: number;
  due: FlushPassDueItem[];
  attemptedCount?: number;
  syncedCount?: number;
  stoppedEarly?: boolean;
  stoppedAtActionId?: string;
  stoppedReason?: string;
}

/** In-memory handle for the pass currently in flight, so recordFlushPassEnd can patch it. */
let inFlightPass: FlushPassDiagnostic | null = null;

/** Call once, right after a flush pass determines it has real due work to attempt. */
export async function recordFlushPassStart(
  snapshot: Omit<FlushPassDiagnostic, "timestamp" | "attemptedCount" | "syncedCount" | "stoppedEarly" | "stoppedAtActionId" | "stoppedReason">,
): Promise<void> {
  if (!isMobileNativePlatform()) return;
  const pass: FlushPassDiagnostic = { timestamp: new Date().toISOString(), ...snapshot };
  inFlightPass = pass;
  try {
    await offlineStore.saveCache(LAST_FLUSH_PASS_CACHE_KEY, pass);
  } catch { /* ignore */ }
}

/** Call once, when the pass finishes (whether it completed the due list or stopped early). */
export async function recordFlushPassEnd(
  patch: Partial<Pick<FlushPassDiagnostic,
    "attemptedCount" | "syncedCount" | "stoppedEarly" | "stoppedAtActionId" | "stoppedReason"
  >>,
): Promise<void> {
  if (!isMobileNativePlatform()) return;
  if (!inFlightPass) return;
  const pass: FlushPassDiagnostic = { ...inFlightPass, ...patch };
  inFlightPass = null;
  try {
    await offlineStore.saveCache(LAST_FLUSH_PASS_CACHE_KEY, pass);
  } catch { /* ignore */ }
}

export async function getLastFlushPassDiagnostic(): Promise<FlushPassDiagnostic | null> {
  if (!isMobileNativePlatform()) return null;
  try {
    return await offlineStore.getCache<FlushPassDiagnostic>(LAST_FLUSH_PASS_CACHE_KEY);
  } catch {
    return null;
  }
}

/** Test hook — clears the in-flight-pass handle between tests. */
export function resetFlushPassDiagnosticsForTests(): void {
  inFlightPass = null;
}
