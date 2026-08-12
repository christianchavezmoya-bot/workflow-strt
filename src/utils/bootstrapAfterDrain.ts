/**
 * Coalesced scheduling of bootstrap runs after the upload queue drains.
 * Prevents bootstrap storms from flush-complete, SSE, and reconnect firing in parallel.
 */

import offlineBootstrapService, { type BootstrapScope } from "../services/offlineBootstrapService";
import { getNativeNetworkConnected, getServerReachable, shouldSkipRunMutation, subscribeServerReachable } from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "./platform";
import { shouldScheduleBootstrap, type BootstrapReason } from "./bootstrapFreshness";

let chainTimer: ReturnType<typeof setTimeout> | null = null;
let lastScheduledAtMs = 0;
let deferredBootstrapUnsub: (() => void) | null = null;

/** Minimum gap between automatic bootstrap schedules (assigned-scope prefetch). */
const AUTO_DEBOUNCE_MS = 3_000;

function hasNetworkSignal(): boolean {
  if (isMobileNativePlatform()) {
    return getNativeNetworkConnected() !== false;
  }
  return typeof navigator === "undefined" || navigator.onLine;
}

function canScheduleBootstrap(): boolean {
  if (!hasNetworkSignal()) return false;
  if (isMobileNativePlatform()) {
    if (getServerReachable() !== true) return false;
    if (shouldSkipRunMutation()) return false;
  }
  return true;
}

export function scheduleBootstrapAfterUploadDrain(
  scope: BootstrapScope = "all",
  debounceMs = AUTO_DEBOUNCE_MS,
  force = false,
  reason: BootstrapReason = "flush-complete",
): void {
  if (!isMobileNativePlatform()) return;
  if (!canScheduleBootstrap()) {
    if (!hasNetworkSignal()) return;
    if (deferredBootstrapUnsub) return;
    deferredBootstrapUnsub = subscribeServerReachable((reachable) => {
      if (!reachable) return;
      deferredBootstrapUnsub?.();
      deferredBootstrapUnsub = null;
      scheduleBootstrapAfterUploadDrain(scope, debounceMs, force, reason);
    });
    return;
  }

  const run = () => {
    void (async () => {
      chainTimer = null;
      if (offlineBootstrapService.isRunning()) return;

      const shouldRun = force || await shouldScheduleBootstrap({ reason, scope, force });
      if (!shouldRun) return;

      void offlineBootstrapService.runAfterUploadDrain({ scope, force });
    })();
  };

  const now = Date.now();
  if (!force && now - lastScheduledAtMs < AUTO_DEBOUNCE_MS) {
    debounceMs = Math.max(debounceMs, AUTO_DEBOUNCE_MS);
  }
  lastScheduledAtMs = now;

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

export function scheduleBootstrapIfQueueEmpty(
  pendingRemaining: number,
  scope: BootstrapScope = "all",
): void {
  if (pendingRemaining > 0) return;
  scheduleBootstrapAfterUploadDrain(scope, AUTO_DEBOUNCE_MS, false, "flush-complete");
}
