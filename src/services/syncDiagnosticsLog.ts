/**
 * Persisted sync failure/conflict diagnostics (ring buffer in IndexedDB).
 */
import { getDB } from "./localDB";

export type SyncDiagnosticReason =
  | "MEDIA_MISSING"
  | "MEDIA_READ_FAIL"
  | "TIMEOUT"
  | "SERVER_5XX"
  | "SERVER_4XX"
  | "CONFLICT_CONCURRENCY"
  | "CONFLICT_FALSE_SUSPECT"
  | "CONFLICT_BUSINESS_RULE"
  | "DEPENDENCY_DROPPED"
  | "OFFLINE"
  | "UNKNOWN";

export interface SyncDiagnosticEntry {
  id: string;
  ts: string;
  actionId?: string;
  opType?: string;
  entityType?: string;
  entityId?: string;
  httpStatus?: number;
  errorCode?: string;
  reason: SyncDiagnosticReason;
  message: string;
  payloadBytes?: number;
  retries?: number;
  mediaPathsInvolved?: string[];
}

const STORE = "sync_diagnostics";
const MAX_ENTRIES = 200;

export async function syncDiagnosticAppend(entry: Omit<SyncDiagnosticEntry, "id" | "ts"> & { ts?: string }): Promise<void> {
  try {
    const db = await getDB();
    const record: SyncDiagnosticEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: entry.ts ?? new Date().toISOString(),
      actionId: entry.actionId,
      opType: entry.opType,
      entityType: entry.entityType,
      entityId: entry.entityId,
      httpStatus: entry.httpStatus,
      errorCode: entry.errorCode,
      reason: entry.reason,
      message: entry.message,
      payloadBytes: entry.payloadBytes,
      retries: entry.retries,
      mediaPathsInvolved: entry.mediaPathsInvolved,
    };
    await db.put(STORE, record);
    const all = await db.getAll(STORE) as SyncDiagnosticEntry[];
    if (all.length > MAX_ENTRIES) {
      const sorted = all.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
      const excess = sorted.slice(0, all.length - MAX_ENTRIES);
      await Promise.all(excess.map((row) => db.delete(STORE, row.id)));
    }
    window.dispatchEvent(new CustomEvent("sync-diagnostics-changed"));
  } catch {
    // Non-fatal.
  }
}

export async function syncDiagnosticList(limit = MAX_ENTRIES): Promise<SyncDiagnosticEntry[]> {
  try {
    const db = await getDB();
    const all = await db.getAll(STORE) as SyncDiagnosticEntry[];
    return all
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function syncDiagnosticClear(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE);
    window.dispatchEvent(new CustomEvent("sync-diagnostics-changed"));
  } catch {
    // Non-fatal.
  }
}

export function classifySyncFailure(input: {
  httpStatus?: number;
  errorCode?: string;
  message?: string;
  mediaMissing?: boolean;
  dependencyDropped?: boolean;
}): SyncDiagnosticReason {
  if (input.dependencyDropped) return "DEPENDENCY_DROPPED";
  if (input.mediaMissing) return "MEDIA_MISSING";
  if (input.errorCode === "ECONNABORTED") return "TIMEOUT";
  if (input.errorCode === "ERR_NETWORK" || input.message?.includes("offline")) return "OFFLINE";
  if (input.httpStatus === 409 || input.httpStatus === 412) return "CONFLICT_CONCURRENCY";
  if (input.httpStatus === 422) return "CONFLICT_BUSINESS_RULE";
  if (input.httpStatus && input.httpStatus >= 500) return "SERVER_5XX";
  if (input.httpStatus && input.httpStatus >= 400) return "SERVER_4XX";
  if (input.message?.toLowerCase().includes("media file missing")) return "MEDIA_MISSING";
  return "UNKNOWN";
}
