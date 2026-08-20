import { shouldDeferBackgroundSync } from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "./platform";
import { isSyncFlushing } from "./syncFlushLock";

/**
 * Whether native sync chrome (overlay, keep-awake, foreground service) should be active.
 * Mid-flush mount skips the defer gate — flush already passed canAttemptSyncFlush().
 */
export function isNativeSyncUiActive(
  syncing: boolean,
  options?: { midFlush?: boolean },
): boolean {
  if (!syncing || !isMobileNativePlatform()) return false;
  if (options?.midFlush) return true;
  return !shouldDeferBackgroundSync();
}

/** Convenience for mount-time checks when a flush may already be in progress. */
export function isNativeSyncUiActiveNow(): boolean {
  return isNativeSyncUiActive(isSyncFlushing(), { midFlush: isSyncFlushing() });
}
