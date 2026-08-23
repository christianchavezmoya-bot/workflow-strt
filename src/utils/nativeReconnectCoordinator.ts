/**
 * Single native gate for background prefetch / dashboard refresh work that
 * would compete with an open workflow runner or reconnect flush→bootstrap.
 */

import { isMobileNativePlatform } from "./platform";

let reconnectPending = false;
let flushInProgress = false;
let bootstrapRunning = false;
let settling = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let workflowRunnerOpenCount = 0;

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

/** Deferrals that block *external* prefetch (dashboard, assignments) — includes bootstrap. */
function shouldDeferNativeBackgroundWork(): boolean {
  if (!isMobileNativePlatform()) return false;
  return reconnectPending
    || flushInProgress
    || bootstrapRunning
    || settling
    || workflowRunnerOpenCount > 0;
}

/**
 * Deferrals that bootstrap phase 6 should wait on before per-asset GETs.
 * Must NOT include bootstrapRunning — bootstrap cannot wait on itself (deadlock).
 */
function shouldBlockBackgroundWorkSlot(): boolean {
  if (!isMobileNativePlatform()) return false;
  return reconnectPending
    || flushInProgress
    || settling
    || workflowRunnerOpenCount > 0;
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
  if (!bootstrapRunning && !reconnectPending && workflowRunnerOpenCount === 0) {
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

/** WorkOrderRunner opened — block background per-asset GETs until it closes. */
export function markWorkflowRunnerOpened(): void {
  if (!isMobileNativePlatform()) return;
  workflowRunnerOpenCount += 1;
  clearSettleTimer();
}

export function markWorkflowRunnerClosed(): void {
  if (!isMobileNativePlatform()) return;
  workflowRunnerOpenCount = Math.max(0, workflowRunnerOpenCount - 1);
  if (
    workflowRunnerOpenCount === 0
    && !reconnectPending
    && !flushInProgress
    && !bootstrapRunning
  ) {
    scheduleSettleWindow();
  }
}

export function isWorkflowRunnerOpen(): boolean {
  if (!isMobileNativePlatform()) return false;
  return workflowRunnerOpenCount > 0;
}

export function isNativeReconnectBusy(): boolean {
  if (!isMobileNativePlatform()) return false;
  return reconnectPending || flushInProgress || bootstrapRunning || settling;
}

/** Skip fire-and-forget assignment/run background refreshes while runner or reconnect work is active. */
export function shouldDeferPerAssetBackgroundRefresh(): boolean {
  return shouldDeferNativeBackgroundWork();
}

/** Dashboard should defer live refresh while runner or reconnect work is active. */
export function shouldDeferNativeDashboardFullRefresh(): boolean {
  return shouldDeferNativeBackgroundWork();
}

/** Wait until competing background work clears (runner, flush, reconnect). Bootstrap itself must not wait on bootstrapRunning. */
export async function waitForBackgroundWorkSlot(maxMs = 45_000): Promise<boolean> {
  if (!shouldBlockBackgroundWorkSlot()) return true;
  const deadline = Date.now() + maxMs;
  while (shouldBlockBackgroundWorkSlot()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
  return true;
}

/** Test hook — reset coordinator state. */
export function resetNativeReconnectCoordinatorForTests(): void {
  reconnectPending = false;
  flushInProgress = false;
  bootstrapRunning = false;
  workflowRunnerOpenCount = 0;
  clearSettleTimer();
}
