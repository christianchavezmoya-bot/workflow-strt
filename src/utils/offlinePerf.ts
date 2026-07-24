export type OfflinePerfMarker =
  | "navigation_start"
  | "local_database_open_start"
  | "local_database_open_end"
  | "workflow_local_read_start"
  | "workflow_local_read_end"
  | "derived_state_build_start"
  | "derived_state_build_end"
  | "first_render"
  | "interactive_ready"
  | "network_request_start"
  | "network_request_end"
  | "token_refresh_start"
  | "token_refresh_end"
  | "queue_flush_start"
  | "queue_flush_end"
  | "media_decode_start"
  | "media_decode_end";

export type OfflinePerfEntry = {
  marker: OfflinePerfMarker | string;
  at: number;
  detail?: string;
};

const MAX_ENTRIES = 200;

function getStore(): OfflinePerfEntry[] {
  const w = window as typeof window & { __offlinePerf?: OfflinePerfEntry[] };
  if (!w.__offlinePerf) w.__offlinePerf = [];
  return w.__offlinePerf;
}

export function markOfflinePerf(marker: OfflinePerfMarker | string, detail?: string): number {
  if (typeof window === "undefined") return Date.now();
  const at = Date.now();
  const store = getStore();
  store.push({ marker, at, detail });
  if (store.length > MAX_ENTRIES) store.shift();
  window.dispatchEvent(new CustomEvent("offline-perf", { detail: { marker, at, detail } }));
  return at;
}

export function startOfflinePerfSpan(marker: OfflinePerfMarker | string, detail?: string): () => void {
  const start = markOfflinePerf(marker, detail);
  return () => {
    markOfflinePerf(`${marker}_end`, detail);
    if (import.meta.env.DEV) {
      const elapsed = Date.now() - start;
      console.debug(`[offline-perf] ${marker}${detail ? ` (${detail})` : ""}: ${elapsed}ms`);
    }
  };
}

export function getOfflinePerfLog(): OfflinePerfEntry[] {
  return [...getStore()];
}

export function clearOfflinePerfLog(): void {
  const w = window as typeof window & { __offlinePerf?: OfflinePerfEntry[] };
  w.__offlinePerf = [];
}

/** Time from the latest completed navigation_start → interactive_ready pair. */
export function getInteractiveReadyMs(): number | null {
  const log = getOfflinePerfLog();
  let pendingNav: OfflinePerfEntry | null = null;
  let lastPairMs: number | null = null;

  for (const entry of log) {
    if (entry.marker === "navigation_start") {
      pendingNav = entry;
      continue;
    }
    if (entry.marker === "interactive_ready" && pendingNav) {
      lastPairMs = entry.at - pendingNav.at;
      pendingNav = null;
    }
  }

  return lastPairMs;
}

/** Last N perf markers for debug readout. */
export function getRecentOfflinePerfMarkers(limit = 5): OfflinePerfEntry[] {
  const log = getOfflinePerfLog();
  if (limit <= 0) return [];
  return log.slice(-limit);
}

/** Span for local workflow config + run resolution (entry-point open path). */
export function startWorkflowLocalReadSpan(configId: string): () => void {
  markOfflinePerf("workflow_local_read_start", configId);
  const start = Date.now();
  return () => {
    markOfflinePerf("workflow_local_read_end", configId);
    if (import.meta.env.DEV) {
      console.debug(`[offline-perf] workflow_local_read (${configId}): ${Date.now() - start}ms`);
    }
  };
}

export function formatOfflinePerfEntry(entry: OfflinePerfEntry): string {
  const detail = entry.detail ? ` ${entry.detail}` : "";
  return `${entry.marker}${detail}`;
}

export function _resetOfflinePerfForTests(): void {
  clearOfflinePerfLog();
}

/** Exposed for Playwright perf assertions in dev/test builds. */
export function exposeOfflinePerfForTesting(): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & {
    __offlinePerfApi?: {
      mark: typeof markOfflinePerf;
      getMs: typeof getInteractiveReadyMs;
      getLog: typeof getOfflinePerfLog;
      reset: typeof clearOfflinePerfLog;
    };
  };
  w.__offlinePerfApi = {
    mark: markOfflinePerf,
    getMs: getInteractiveReadyMs,
    getLog: getOfflinePerfLog,
    reset: clearOfflinePerfLog,
  };
}

if (import.meta.env.DEV) {
  exposeOfflinePerfForTesting();
}
