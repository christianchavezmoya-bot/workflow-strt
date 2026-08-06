/**
 * Shared sync-activity flags so connectivity UI does not false-flag "offline"
 * while uploads are in flight and the LAN server is merely busy/saturated.
 */

let pendingUploadCount = 0;
let syncEngineSyncing = false;

export function setSyncConnectivityPendingCount(count: number): void {
  pendingUploadCount = Math.max(0, count);
}

export function setSyncConnectivitySyncing(syncing: boolean): void {
  syncEngineSyncing = syncing;
}

/** Suppress server-unreachable/offline UI while the sync engine is active. */
export function shouldSuppressUnreachableOffline(): boolean {
  return syncEngineSyncing || pendingUploadCount > 0;
}
