/**
 * Builds a sanitized support bundle from Sync Center diagnostics — no tokens,
 * request bodies, or step/photo content.
 */
import pkg from "../../package.json";
import type { FaultReportDraft } from "./faultReporting/types";
import type { ApiDebugLog } from "./api";
import {
  droppedActionsGetAll,
  pendingGetAll,
  type DroppedAction,
  type PendingAction,
} from "./localDB";
import offlineBootstrapService, { type BootstrapStatus } from "./offlineBootstrapService";
import { getServerReachable } from "./connectivityMonitor";
import { isManualOfflineModeActive } from "./offlineModeState";
import { secureGet } from "./secureStorage";
import { isMobileNativePlatform } from "../utils/platform";
import { getOfflinePerfLog, type OfflinePerfEntry } from "../utils/offlinePerf";
import { safeApiHost, toAllowlistedDiagnostics } from "../utils/syncDiagnostics";
import { syncDiagnosticList, type SyncDiagnosticEntry } from "./syncDiagnosticsLog";
import { checkPendingMediaIntegrity, type PendingMediaIntegrityRow } from "./pendingMediaIntegrity";
import { getLastFlushPassDiagnostic, type FlushPassDiagnostic } from "./flushPassDiagnostics";
import { isCircuitOpen, getCircuitOpenUntilMs, getCircuitFailureCount } from "../utils/circuitBreaker";
import {
  getStaleAssetReconcileTrace,
  getStaleAssetFetchTrace,
  type StaleAssetReconcilePass,
  type StaleAssetFetchAttempt,
} from "../utils/staleAssetDiagnostics";
import { getKnownMissingAssetIdsSnapshot } from "../utils/staleAssetIds";

export const SUPPORT_BUNDLE_SCHEMA_VERSION = 2;

export type SanitizedApiLog = Pick<
  ApiDebugLog,
  "time" | "method" | "status" | "durationMs" | "error" | "payloadBytes" | "opType" | "source"
> & { url: string };

export interface SyncSupportBundle {
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  apiHost: string;
  platform: "web" | "native";
  userAgent: string;
  user?: { id: string; role: string; email?: string };
  connectivity: {
    manualOffline: boolean;
    serverReachable: boolean | null;
    navigatorOnLine: boolean;
  };
  bootstrap: BootstrapStatus | null;
  summary: {
    pendingCount: number;
    conflictCount: number;
    droppedCount: number;
  };
  pendingActions: Record<string, unknown>[];
  conflicts: Record<string, unknown>[];
  droppedActions: DroppedAction[];
  apiLogs: SanitizedApiLog[];
  offlinePerf?: OfflinePerfEntry[];
  syncDiagnostics?: SyncDiagnosticEntry[];
  pendingMediaIntegrity?: PendingMediaIntegrityRow[];
  /** Live gate state at export time — circuit breaker, not tied to any one pass. */
  circuitBreaker?: { open: boolean; openUntilMs: number; failureCount: number };
  /** Snapshot of the most recent flush() pass (due-list order, gate state, where it stopped). */
  lastFlushPass?: FlushPassDiagnostic | null;
  /** Currently known-missing asset ids at export time. */
  knownMissingAssetIds?: string[];
  /** Last N dashboard-workspace reconciliation passes, per-id trace (only ids that were known-missing beforehand). */
  staleAssetReconcileTrace?: StaleAssetReconcilePass[];
  /** Last N GET /project-assets/{id} attempts and the known-missing state at that exact moment. */
  staleAssetFetchTrace?: StaleAssetFetchAttempt[];
  reportedFault?: {
    kind: FaultReportDraft["kind"];
    severity: FaultReportDraft["severity"];
    title: string;
    description?: string;
    referenceCode?: string;
    occurredAt?: string;
    errorName?: string;
    errorMessage?: string;
  };
}

/** Strip auth tokens and sensitive query params from URLs. */
export function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url, "http://local.invalid");
    for (const key of ["token", "ticket", "access_token", "refresh_token", "auth"]) {
      parsed.searchParams.delete(key);
    }
    const path = parsed.pathname + parsed.search;
    return path.startsWith("//") ? path.slice(1) : path.replace(/^http:\/\/local\.invalid/, "") || url;
  } catch {
    return url.replace(/([?&])(token|ticket|access_token|refresh_token)=[^&]*/gi, "$1redacted=1");
  }
}

function sanitizeApiLog(log: ApiDebugLog): SanitizedApiLog {
  return {
    time: log.time,
    method: log.method,
    url: sanitizeUrl(log.url),
    status: log.status,
    durationMs: log.durationMs,
    error: log.error,
    payloadBytes: log.payloadBytes,
    opType: log.opType,
    source: log.source,
  };
}

function readApiDebugLogs(): ApiDebugLog[] {
  if (typeof window === "undefined") return [];
  const logs = (window as Window & { __apiDebugLogs?: ApiDebugLog[] }).__apiDebugLogs ?? [];
  const syncFirst = [...logs].sort((a, b) => {
    const aSync = a.source === "sync-engine" ? 0 : 1;
    const bSync = b.source === "sync-engine" ? 0 : 1;
    return aSync - bSync;
  });
  return syncFirst.slice(-50);
}

function readUserContext(): SyncSupportBundle["user"] | undefined {
  try {
    const raw = secureGet("auth_user");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { id?: string; role?: string; email?: string };
    if (!parsed.id) return undefined;
    return { id: parsed.id, role: parsed.role ?? "unknown", email: parsed.email };
  } catch {
    return undefined;
  }
}

function pendingExportRow(action: PendingAction): Record<string, unknown> {
  const row = toAllowlistedDiagnostics(action);
  if (action.conflictDetected) {
    row.conflictDetected = true;
    row.conflictKind = action.conflictKind;
    row.conflictHttpStatus = action.conflictHttpStatus;
    row.conflictMessage = action.conflictMessage;
  }
  row.url = sanitizeUrl(action.url);
  return row;
}

export function toReportedFaultDiagnostics(draft?: FaultReportDraft | null): SyncSupportBundle["reportedFault"] {
  if (!draft) return undefined;
  return {
    kind: draft.kind,
    severity: draft.severity,
    title: draft.title.slice(0, 200),
    description: draft.description?.slice(0, 4_000),
    referenceCode: draft.referenceCode,
    occurredAt: draft.occurredAt,
    errorName: draft.error?.name?.slice(0, 200),
    errorMessage: draft.error?.message?.slice(0, 2_000),
  };
}

export async function buildSyncSupportBundle(options?: {
  faultDraft?: FaultReportDraft | null;
}): Promise<SyncSupportBundle> {
  const [pending, dropped, bootstrap, diagnostics, mediaIntegrity, lastFlushPass, staleAssetReconcileTrace, staleAssetFetchTrace] = await Promise.all([
    pendingGetAll(),
    droppedActionsGetAll(),
    isMobileNativePlatform() ? offlineBootstrapService.getStatus() : Promise.resolve(null),
    syncDiagnosticList(50),
    isMobileNativePlatform() ? checkPendingMediaIntegrity() : Promise.resolve([]),
    isMobileNativePlatform() ? getLastFlushPassDiagnostic() : Promise.resolve(null),
    isMobileNativePlatform() ? getStaleAssetReconcileTrace() : Promise.resolve([]),
    isMobileNativePlatform() ? getStaleAssetFetchTrace() : Promise.resolve([]),
  ]);

  const conflicts = pending.filter((a) => a.conflictDetected);
  const nonConflictPending = pending.filter((a) => !a.conflictDetected);

  return {
    schemaVersion: SUPPORT_BUNDLE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: pkg.version,
    apiHost: safeApiHost(),
    platform: isMobileNativePlatform() ? "native" : "web",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    user: readUserContext(),
    connectivity: {
      manualOffline: isManualOfflineModeActive(),
      serverReachable: getServerReachable(),
      navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : true,
    },
    bootstrap,
    summary: {
      pendingCount: pending.length,
      conflictCount: conflicts.length,
      droppedCount: dropped.length,
    },
    pendingActions: nonConflictPending.map(pendingExportRow),
    conflicts: conflicts.map(pendingExportRow),
    droppedActions: dropped,
    apiLogs: readApiDebugLogs().map(sanitizeApiLog),
    offlinePerf: isMobileNativePlatform() ? getOfflinePerfLog().slice(-40) : undefined,
    syncDiagnostics: diagnostics,
    pendingMediaIntegrity: mediaIntegrity.filter((row) => row.missingPaths.length > 0),
    circuitBreaker: isMobileNativePlatform()
      ? { open: isCircuitOpen(), openUntilMs: getCircuitOpenUntilMs(), failureCount: getCircuitFailureCount() }
      : undefined,
    lastFlushPass,
    knownMissingAssetIds: isMobileNativePlatform() ? getKnownMissingAssetIdsSnapshot() : undefined,
    staleAssetReconcileTrace,
    staleAssetFetchTrace,
    reportedFault: toReportedFaultDiagnostics(options?.faultDraft),
  };
}

export function formatSyncSupportBundle(bundle: SyncSupportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export async function copySyncSupportBundle(): Promise<SyncSupportBundle> {
  const bundle = await buildSyncSupportBundle();
  const text = formatSyncSupportBundle(bundle);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    throw new Error("Clipboard unavailable");
  }
  return bundle;
}

export async function downloadSyncSupportBundle(): Promise<SyncSupportBundle> {
  const bundle = await buildSyncSupportBundle();
  const text = formatSyncSupportBundle(bundle);
  const blob = new Blob([text], { type: "application/json" });
  const stamp = bundle.exportedAt.replace(/[:.]/g, "-");
  const filename = `commtrac-sync-support-${stamp}.json`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return bundle;
}
