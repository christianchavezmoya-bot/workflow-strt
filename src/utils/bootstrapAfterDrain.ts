/**
 * Coalesced scheduling of bootstrap runs after the upload queue drains.
 * Shared by triggerSync, flush-complete chaining, and SSE assignment prefetch.
 */

import offlineBootstrapService, { type BootstrapScope } from "../services/offlineBootstrapService";
import { getNativeNetworkConnected } from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "./platform";

let chainTimer: ReturnType<typeof setTimeout> | null = null;

function hasNetworkSignal(): boolean {
  if (isMobileNativePlatform()) {
    return getNativeNetworkConnected() !== false;
  }
  return typeof navigator === "undefined" || navigator.onLine;
}

/** Wait for uploads to drain, then run bootstrap. Debounced to collapse bursts. */
export function scheduleBootstrapAfterUploadDrain(
  scope: BootstrapScope = "all",
  debounceMs = 0,
): void {
  if (!isMobileNativePlatform()) return;
  if (!hasNetworkSignal()) return;

  const run = () => {
    chainTimer = null;
    if (offlineBootstrapService.isRunning()) return;
    void offlineBootstrapService.runAfterUploadDrain({ scope });
  };

  if (debounceMs <= 0) {
    if (chainTimer) {
      clearTimeout(chainTimer);
      chainTimer = null;
    }
    run();
    return;
  }

  if (chainTimer) clearTimeout(chainTimer);
  chainTimer = setTimeout(run, debounceMs);
}

/** After flush completes with an empty queue, start field-data download. */
export function scheduleBootstrapIfQueueEmpty(pendingRemaining: number, scope: BootstrapScope = "all"): void {
  if (pendingRemaining > 0) return;
  scheduleBootstrapAfterUploadDrain(scope, 800);
}
