import type { PendingAction } from "../services/localDB";
import { getApiBaseUrl } from "../services/apiBase";

/** Matches axios default on the shared api instance (see services/api.ts). */
export const API_DEFAULT_TIMEOUT_MS = 10_000;

/** Snapshot of the last failed sync flush attempt — stored on pending_actions. */
export type SyncAttemptDiagnostics = {
  lastAttemptAt?: string;
  lastDurationMs?: number;
  lastPayloadBytes?: number;
  lastStepResultsBytes?: number;
  lastPhotoCount?: number;
  lastRequestMethod?: string;
  lastRequestUrl?: string;
  lastMappedRunId?: string;
  lastIsOfflineRunId?: boolean;
  lastTimeoutMs?: number;
  lastHttpStatus?: number;
  lastErrorCode?: string;
  lastServerReachable?: boolean;
  lastConnectivity?: string;
  lastOpType?: string;
  lastApiHost?: string;
};

export function isOfflineRunId(id: string | undefined | null): boolean {
  return typeof id === "string" && (id.startsWith("offline-run-") || id.includes("/offline-run-"));
}

export function formatPayloadSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function measurePayload(data: unknown): {
  payloadBytes: number;
  stepResultsBytes?: number;
  photoCount?: number;
} {
  let payloadBytes = 0;
  try {
    payloadBytes = new TextEncoder().encode(JSON.stringify(data ?? {})).length;
  } catch {
    payloadBytes = 0;
  }

  let stepResultsBytes: number | undefined;
  let photoCount: number | undefined;
  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    const raw = body.stepResultsJson;
    if (typeof raw === "string") {
      stepResultsBytes = new TextEncoder().encode(raw).length;
      const matches = raw.match(/data:image/gi);
      photoCount = matches ? matches.length : 0;
    }
  }

  return { payloadBytes, stepResultsBytes, photoCount };
}

export function safeApiHost(): string {
  try {
    return new URL(getApiBaseUrl()).host;
  } catch {
    return "(unknown)";
  }
}

export function buildSyncAttemptDiagnostics(input: {
  action: PendingAction;
  requestUrl: string;
  requestMethod: string;
  mappedRunId: string | null;
  requestData: unknown;
  durationMs: number;
  timeoutMs: number;
  error?: unknown;
  serverReachable: boolean | null;
  connectivity: string;
}): SyncAttemptDiagnostics {
  const metrics = measurePayload(input.requestData);
  const err = input.error as { response?: { status?: number }; code?: string } | undefined;

  return {
    lastAttemptAt: new Date().toISOString(),
    lastDurationMs: input.durationMs,
    lastPayloadBytes: metrics.payloadBytes,
    lastStepResultsBytes: metrics.stepResultsBytes,
    lastPhotoCount: metrics.photoCount,
    lastRequestMethod: input.requestMethod,
    lastRequestUrl: input.requestUrl,
    lastMappedRunId: input.mappedRunId ?? undefined,
    lastIsOfflineRunId: isOfflineRunId(input.action.entityId) || isOfflineRunId(input.requestUrl),
    lastTimeoutMs: input.timeoutMs,
    lastHttpStatus: err?.response?.status,
    lastErrorCode: err?.code,
    lastServerReachable: input.serverReachable ?? undefined,
    lastConnectivity: input.connectivity,
    lastOpType: input.action.opType,
    lastApiHost: safeApiHost(),
  };
}

export function formatSyncDiagnosticSummary(action: PendingAction): string | null {
  if (action.lastPayloadBytes == null && action.lastDurationMs == null) return null;

  const parts: string[] = [];
  if (action.lastRequestMethod) parts.push(action.lastRequestMethod);
  if (action.lastPayloadBytes != null) parts.push(formatPayloadSize(action.lastPayloadBytes));
  if (action.lastDurationMs != null) parts.push(`${action.lastDurationMs.toLocaleString()} ms`);
  if (action.lastTimeoutMs) parts.push(`timeout ${action.lastTimeoutMs.toLocaleString()} ms`);
  if (action.lastHttpStatus != null) parts.push(`HTTP ${action.lastHttpStatus}`);
  else if (action.lastErrorCode === "ECONNABORTED" || action.lastError?.toLowerCase().includes("timeout")) {
    parts.push("no HTTP status");
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

const COPY_ALLOWLIST: Array<keyof PendingAction> = [
  "id",
  "opType",
  "entityType",
  "entityId",
  "method",
  "url",
  "status",
  "retries",
  "lastError",
  "lastAttemptAt",
  "lastDurationMs",
  "lastPayloadBytes",
  "lastStepResultsBytes",
  "lastPhotoCount",
  "lastRequestMethod",
  "lastRequestUrl",
  "lastMappedRunId",
  "lastIsOfflineRunId",
  "lastTimeoutMs",
  "lastHttpStatus",
  "lastErrorCode",
  "lastServerReachable",
  "lastConnectivity",
  "lastOpType",
  "lastApiHost",
  "nextRetryAt",
  "createdAt",
];

/** Safe JSON for clipboard — no body, tokens, or step content. */
export function toAllowlistedDiagnostics(action: PendingAction): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of COPY_ALLOWLIST) {
    const val = action[key];
    if (val !== undefined) out[key] = val;
  }
  if (action.lastPayloadBytes != null) {
    out.payloadSizeFormatted = formatPayloadSize(action.lastPayloadBytes);
  }
  if (action.lastStepResultsBytes != null) {
    out.stepResultsSizeFormatted = formatPayloadSize(action.lastStepResultsBytes);
  }
  return out;
}
