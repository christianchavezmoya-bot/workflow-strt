/**
 * Whole-pass flush() diagnostics — read-only trace, never affects sync logic.
 *
 * Per-op eligibility is stamped onto the PendingAction row itself
 * (see pendingRecordEligibility in localDB.ts). This module captures the
 * pass-level context that explains *why* those per-op decisions were made:
 * the gate state at entry, the exact due-list order, and where/why a pass
 * stopped early. A single overwritten cache entry — not a growing log — so
 * it can't flood or add meaningful I/O on the 25-35ms flush cycles reported
 * during a stuck queue.
 */
import offlineStore from "./offlineStore";
import { isMobileNativePlatform } from "../utils/platform";

const CACHE_KEY = "last-flush-pass-diagnostic";

export interface FlushPassDueItem {
  id: string;
  opType?: string;
  entityId?: string;
  entityType?: string;
  status?: string;
}

export interface FlushPassDiagnostic {
  ts: string;
  canAttemptSyncFlush: boolean;
  serverReachable: boolean | null;
  hasNetworkSignal: boolean;
  circuitOpen: boolean;
  circuitOpenUntilMs: number;
  circuitFailureCount: number;
  dueCount: number;
  due: FlushPassDueItem[];
  /** Set once the pass finishes (or stops early) — undefined while a pass is mid-flight. */
  stoppedEarly?: boolean;
  stoppedAtActionId?: string;
  stoppedReason?: string;
  attemptedCount?: number;
  syncedCount?: number;
}

export async function recordFlushPassStart(
  snapshot: Omit<FlushPassDiagnostic, "ts">,
): Promise<void> {
  if (!isMobileNativePlatform()) return;
  try {
    await offlineStore.saveCache<FlushPassDiagnostic>(CACHE_KEY, {
      ts: new Date().toISOString(),
      ...snapshot,
    });
  } catch { /* ignore */ }
}

export async function recordFlushPassEnd(
  patch: Partial<Pick<FlushPassDiagnostic, "stoppedEarly" | "stoppedAtActionId" | "stoppedReason" | "attemptedCount" | "syncedCount">>,
): Promise<void> {
  if (!isMobileNativePlatform()) return;
  try {
    const existing = await offlineStore.getCache<FlushPassDiagnostic>(CACHE_KEY);
    if (!existing) return;
    await offlineStore.saveCache<FlushPassDiagnostic>(CACHE_KEY, { ...existing, ...patch });
  } catch { /* ignore */ }
}

export async function getLastFlushPassDiagnostic(): Promise<FlushPassDiagnostic | null> {
  try {
    return await offlineStore.getCache<FlushPassDiagnostic>(CACHE_KEY);
  } catch { return null; }
}
