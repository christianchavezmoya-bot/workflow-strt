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

/** Time from navigation_start to interactive_ready, if both exist. */
export function getInteractiveReadyMs(): number | null {
  const log = getOfflinePerfLog();
  const nav = log.find((e) => e.marker === "navigation_start");
  const ready = [...log].reverse().find((e) => e.marker === "interactive_ready");
  if (!nav || !ready) return null;
  return ready.at - nav.at;
}

export function _resetOfflinePerfForTests(): void {
  clearOfflinePerfLog();
}
