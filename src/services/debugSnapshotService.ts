import { Directory, Filesystem } from "@capacitor/filesystem";
import type { ApiDebugLog } from "./api";
import { getApiBaseUrl } from "./apiBase";
import { getNativeNetworkConnected, getServerReachable } from "./connectivityMonitor";
import {
  pendingGetAll,
  syncMetaGet,
  type PendingAction,
} from "./localDB";
import { isManualOfflineModeActive } from "./offlineModeState";
import { secureGet } from "./secureStorage";
import { sanitizeUrl } from "./syncSupportBundleService";
import { safeApiHost, toAllowlistedDiagnostics } from "../utils/syncDiagnostics";
import { isMobileNativePlatform } from "../utils/platform";

const DEBUG_SNAPSHOT_SCHEMA_VERSION = 1;
const DEBUG_LOG_LIMIT = 50;
const PENDING_ACTION_LIMIT = 20;

export interface DebugSnapshot {
  schemaVersion: number;
  capturedAt: string;
  platform: "web" | "native";
  route: {
    pathname: string;
    search: string;
    hash: string;
    href: string;
    projectId?: string;
    productId?: string;
  };
  api: {
    baseUrl: string;
    host: string;
    serverReachable: boolean | null;
    nativeNetworkConnected: boolean | null;
    navigatorOnLine: boolean;
    manualOffline: boolean;
    lastAssetSyncAt: string | null;
  };
  auth: {
    tokenPresent: boolean;
    user?: {
      id?: string;
      email?: string;
      role?: string;
      fullName?: string;
    };
  };
  sync: {
    pendingCount: number;
    pendingActionsSample: Record<string, unknown>[];
  };
  recentRequests: Array<{
    time: string;
    method?: string;
    url: string;
    status?: number;
    durationMs?: number;
    error?: string;
    payloadBytes?: number;
    payloadSizeFormatted?: string;
    opType?: string;
    source?: string;
  }>;
}

export interface SaveDebugSnapshotResult {
  filename: string;
  savedPath?: string;
}

function getWindowLogs(): ApiDebugLog[] {
  if (typeof window === "undefined") return [];
  const anyWindow = window as typeof window & { __apiDebugLogs?: ApiDebugLog[] };
  return anyWindow.__apiDebugLogs ?? [];
}

function readAuthUser(): DebugSnapshot["auth"]["user"] | undefined {
  try {
    const raw = secureGet("auth_user") || secureGet("local_auth_user");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as {
      id?: string;
      email?: string;
      role?: string;
      fullName?: string;
    };
    return parsed;
  } catch {
    return undefined;
  }
}

function sanitizePendingAction(action: PendingAction): Record<string, unknown> {
  const row = toAllowlistedDiagnostics(action);
  row.url = sanitizeUrl(action.url);
  if (typeof action.lastRequestUrl === "string") {
    row.lastRequestUrl = sanitizeUrl(action.lastRequestUrl);
  }
  return row;
}

function sanitizeRequestLog(log: ApiDebugLog) {
  return {
    time: log.time,
    method: log.method,
    url: sanitizeUrl(log.url),
    status: log.status,
    durationMs: log.durationMs,
    error: log.error,
    payloadBytes: log.payloadBytes,
    payloadSizeFormatted: log.payloadSizeFormatted,
    opType: log.opType,
    source: log.source,
  };
}

function formatSnapshotFilename(stamp: string): string {
  return `commtrac-debug-snapshot-${stamp}.json`;
}

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Clipboard unavailable");
  }
}

async function saveJsonArtifact(filename: string, text: string): Promise<SaveDebugSnapshotResult> {
  if (isMobileNativePlatform()) {
    const path = `debug-snapshots/${filename}`;
    try {
      const result = await Filesystem.writeFile({
        path,
        directory: Directory.Documents,
        data: text,
        recursive: true,
      });
      return { filename, savedPath: result.uri ?? path };
    } catch {
      const result = await Filesystem.writeFile({
        path,
        directory: Directory.Data,
        data: text,
        recursive: true,
      });
      return { filename, savedPath: result.uri ?? path };
    }
  }

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename };
}

export async function buildDebugSnapshot(): Promise<DebugSnapshot> {
  const [pendingActions, lastAssetSyncAt] = await Promise.all([
    pendingGetAll(),
    syncMetaGet("assets"),
  ]);

  const location =
    typeof window !== "undefined"
      ? window.location
      : { pathname: "", search: "", hash: "", href: "" };
  const params = new URLSearchParams(location.search);
  const recentRequests = getWindowLogs()
    .slice(-DEBUG_LOG_LIMIT)
    .map(sanitizeRequestLog)
    .reverse();

  return {
    schemaVersion: DEBUG_SNAPSHOT_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    platform: isMobileNativePlatform() ? "native" : "web",
    route: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      href: location.href,
      projectId: params.get("project") ?? undefined,
      productId: params.get("product") ?? undefined,
    },
    api: {
      baseUrl: getApiBaseUrl(),
      host: safeApiHost(),
      serverReachable: getServerReachable(),
      nativeNetworkConnected: getNativeNetworkConnected(),
      navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : true,
      manualOffline: isManualOfflineModeActive(),
      lastAssetSyncAt,
    },
    auth: {
      tokenPresent: Boolean(secureGet("auth_token")),
      user: readAuthUser(),
    },
    sync: {
      pendingCount: pendingActions.length,
      pendingActionsSample: pendingActions.slice(0, PENDING_ACTION_LIMIT).map(sanitizePendingAction),
    },
    recentRequests,
  };
}

export function formatDebugSnapshot(snapshot: DebugSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export async function copyDebugSnapshotToClipboard(): Promise<DebugSnapshot> {
  const snapshot = await buildDebugSnapshot();
  await writeClipboardText(formatDebugSnapshot(snapshot));
  return snapshot;
}

export async function downloadDebugSnapshot(): Promise<SaveDebugSnapshotResult & { snapshot: DebugSnapshot }> {
  const snapshot = await buildDebugSnapshot();
  const stamp = snapshot.capturedAt.replace(/[:.]/g, "-");
  const filename = formatSnapshotFilename(stamp);
  const saved = await saveJsonArtifact(filename, formatDebugSnapshot(snapshot));
  return { snapshot, ...saved };
}
