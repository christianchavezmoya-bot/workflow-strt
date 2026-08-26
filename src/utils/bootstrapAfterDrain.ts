/**
 * Coalesced scheduling of bootstrap runs after the upload queue drains.
 * P0: one in-flight download; pending requests merge and re-run once if needed.
 */

import offlineBootstrapService, {
  type BootstrapScope,
  type BootstrapMode,
} from "../services/offlineBootstrapService";
import {
  getNativeNetworkConnected,
  getServerReachable,
  shouldDeferBackgroundSync,
  subscribeServerReachable,
} from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "./platform";
import {
  shouldScheduleBootstrap,
  inferBootstrapMode,
  type BootstrapReason,
} from "./bootstrapFreshness";
import { tryApplySyncDelta } from "../services/syncDeltaService";
import { markFirstLoginQuietPending } from "./postLoginQuietWindow";

type PendingBootstrap = {
  scope: BootstrapScope;
  force: boolean;
  reason: BootstrapReason;
  mode: BootstrapMode;
};

let chainTimer: ReturnType<typeof setTimeout> | null = null;
let lastScheduledAtMs = 0;
let deferredBootstrapUnsub: (() => void) | null = null;
let pendingAfterRun: PendingBootstrap | null = null;
let completeListenerAttached = false;

/** Minimum gap between automatic bootstrap schedules. */
const AUTO_DEBOUNCE_MS = 5_000;

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
    if (shouldDeferBackgroundSync()) return false;
  }
  return true;
}

function mergePending(current: PendingBootstrap | null, next: PendingBootstrap): PendingBootstrap {
  if (!current) return next;
  return {
    scope: current.scope === "all" || next.scope === "all" ? "all" : "assigned",
    force: current.force || next.force,
    reason: next.reason,
    mode: current.mode === "full" || next.mode === "full" ? "full" : "light",
  };
}

function ensureCompleteListener(): void {
  if (completeListenerAttached || typeof window === "undefined") return;
  completeListenerAttached = true;
  const flushPending = () => {
    if (!pendingAfterRun || offlineBootstrapService.isRunning()) return;
    const next = pendingAfterRun;
    pendingAfterRun = null;
    scheduleBootstrapAfterUploadDrain(next.scope, 0, next.force, next.reason);
  };
  window.addEventListener("bootstrap:complete", flushPending);
  window.addEventListener("bootstrap:error", flushPending);
}

async function executeBootstrap(request: PendingBootstrap): Promise<void> {
  if (offlineBootstrapService.isRunning()) {
    pendingAfterRun = mergePending(pendingAfterRun, request);
    return;
  }

  const shouldRun = request.force || await shouldScheduleBootstrap({
    reason: request.reason,
    scope: request.scope,
    force: request.force,
    mode: request.mode,
  });
  if (!shouldRun) return;

  if (
    !request.force
    && request.mode === "light"
    && request.reason !== "sync-now"
    && request.reason !== "first-login"
  ) {
    const deltaHandled = await tryApplySyncDelta();
    if (deltaHandled) return;
  }

  await offlineBootstrapService.runAfterUploadDrain({
    scope: request.scope,
    force: request.force,
    mode: request.mode,
    reason: request.reason,
  });
}

export function scheduleBootstrapAfterUploadDrain(
  scope: BootstrapScope = "all",
  debounceMs = AUTO_DEBOUNCE_MS,
  force = false,
  reason: BootstrapReason = "flush-complete",
): void {
  if (!isMobileNativePlatform()) return;
  ensureCompleteListener();

  if (reason === "first-login") {
    markFirstLoginQuietPending();
  }

  const request: PendingBootstrap = {
    scope,
    force,
    reason,
    mode: inferBootstrapMode(reason, scope, force),
  };

  if (offlineBootstrapService.isRunning()) {
    pendingAfterRun = mergePending(pendingAfterRun, request);
    return;
  }

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
    chainTimer = null;
    void executeBootstrap(request);
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

/** Test hook — reset coordinator state. */
export function resetBootstrapCoordinatorForTests(): void {
  if (chainTimer) clearTimeout(chainTimer);
  chainTimer = null;
  pendingAfterRun = null;
  lastScheduledAtMs = 0;
  deferredBootstrapUnsub?.();
  deferredBootstrapUnsub = null;
}
