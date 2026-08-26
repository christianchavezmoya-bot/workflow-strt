/**
 * Coordinates deferral of non-critical native work during the first-login
 * request storm (dashboard workspace + bootstrap + bell + push).
 */

import { isMobileNativePlatform } from "./platform";

const QUIET_TIMEOUT_MS = 20_000;

let firstLoginQuietPending = false;
let quietWaiters: Array<() => void> = [];
let listenersAttached = false;

function resolveQuietWaiters(): void {
  if (firstLoginQuietPending) {
    firstLoginQuietPending = false;
  }
  const waiters = quietWaiters;
  quietWaiters = [];
  for (const resolve of waiters) resolve();
}

function ensureListeners(): void {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;

  const onQuiet = () => resolveQuietWaiters();

  window.addEventListener("bootstrap:complete", onQuiet);
  window.addEventListener("bootstrap:error", onQuiet);
  window.addEventListener("native-reconnect:settled", onQuiet);
}

/** Mark that a first-login bootstrap was scheduled — defer competing GETs/POSTs. */
export function markFirstLoginQuietPending(): void {
  if (!isMobileNativePlatform()) return;
  ensureListeners();
  firstLoginQuietPending = true;
}

export function isFirstLoginQuietPending(): boolean {
  return isMobileNativePlatform() && firstLoginQuietPending;
}

/** Wait until bootstrap finishes, reconnect settles, or timeout — whichever comes first. */
export function waitForFirstLoginQuiet(maxMs = QUIET_TIMEOUT_MS): Promise<void> {
  if (!isFirstLoginQuietPending()) return Promise.resolve();

  ensureListeners();

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      quietWaiters = quietWaiters.filter((waiter) => waiter !== onQuiet);
      resolveQuietWaiters();
      resolve();
    }, maxMs);

    const onQuiet = () => {
      window.clearTimeout(timer);
      resolve();
    };

    quietWaiters.push(onQuiet);
  });
}

/** Test hook — reset coordinator state. */
export function resetPostLoginQuietWindowForTests(): void {
  firstLoginQuietPending = false;
  quietWaiters = [];
  listenersAttached = false;
}
