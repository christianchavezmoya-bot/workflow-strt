/**
 * Coordinates native reconnect work so upload flush, bootstrap prefetch, and
 * dashboard live refresh do not stampede the same per-asset endpoints.
 */

import { isMobileNativePlatform } from "./platform";

let reconnectPending = false;
let flushInProgress = false;
let bootstrapRunning = false;
let settling = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

/** Brief pause after flush/bootstrap before heavy dashboard GETs resume. */
export const NATIVE_RECONNECT_SETTLE_MS = 2_500;

function clearSettleTimer(): void {
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  settling = false;
}

function scheduleSettleWindow(): void {
  if (!isMobileNativePlatform()) return;
  clearSettleTimer();
  settling = true;
  settleTimer = setTimeout(() => {
    settleTimer = null;
    settling = false;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("native-reconnect:settled"));
    }
  }, NATIVE_RECONNECT_SETTLE_MS);
}

/** Radio/server just came back after an offline stretch — defer competing GET storms. */
export function markNativeReconnectPending(): void {
  if (!isMobileNativePlatform()) return;
  reconnectPending = true;
  clearSettleTimer();
}

export function markNativeSyncFlushStarted(): void {
  if (!isMobileNativePlatform()) return;
  flushInProgress = true;
  clearSettleTimer();
}

export function markNativeSyncFlushFinished(): void {
  if (!isMobileNativePlatform()) return;
  flushInProgress = false;
  if (!bootstrapRunning && !reconnectPending) {
    scheduleSettleWindow();
  }
}

export function markNativeBootstrapStarted(): void {
  if (!isMobileNativePlatform()) return;
  reconnectPending = false;
  bootstrapRunning = true;
  clearSettleTimer();
}

export function markNativeBootstrapFinished(): void {
  if (!isMobileNativePlatform()) return;
  bootstrapRunning = false;
  scheduleSettleWindow();
}

export function isNativeReconnectBusy(): boolean {
  if (!isMobileNativePlatform()) return false;
  return reconnectPending || flushInProgress || bootstrapRunning || settling;
}

/** Skip fire-and-forget assignment/run background refreshes while reconnect work runs. */
export function shouldDeferPerAssetBackgroundRefresh(): boolean {
  return isNativeReconnectBusy();
}

/** Dashboard should prefer light refresh until reconnect work settles. */
export function shouldDeferNativeDashboardFullRefresh(): boolean {
  return isNativeReconnectBusy();
}

/** Test hook — reset coordinator state. */
export function resetNativeReconnectCoordinatorForTests(): void {
  reconnectPending = false;
  flushInProgress = false;
  bootstrapRunning = false;
  clearSettleTimer();
}
