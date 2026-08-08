/**
 * connectivityMonitor — singleton background ping for server reachability.
 *
 * Why this exists as its own module instead of living inside useSyncEngine:
 * useSyncEngine is a React hook, and it is currently called from several
 * components at once (SyncStatusBadge, ConnectivityDebugBar, PullToRefresh,
 * SyncCenterPage). Each call to a hook creates its own independent
 * useEffect/timer set — so a ping timer placed inside the hook itself would
 * run once per component, not once for the whole app, multiplying real
 * network requests to the server for no benefit.
 *
 * This module is a plain singleton: its internals start exactly once no
 * matter how many components subscribe to it. It pings the existing,
 * already-lightweight /health endpoint (api/health, AllowAnonymous, no
 * database call) on a fixed interval, but only while the app is actually
 * in the foreground, to avoid wasting battery and data in the background.
 *
 * This module makes no decisions about UI and renders nothing — it only
 * tracks one fact (serverReachable: boolean) and notifies subscribers.
 */
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { isServerReachable } from "./networkService";
import { isManualOfflineModeActive } from "./offlineModeState";
import { isMobileNativePlatform } from "../utils/platform";
import { isCircuitOpen, resetCircuitBreaker, tripCircuitBreaker } from "../utils/circuitBreaker";
import { hadRecentApiSuccess } from "./apiReachabilitySignals";
import { shouldSuppressUnreachableOffline } from "../utils/syncConnectivityGuard";

const PING_INTERVAL_MS = 30_000;
const UNREACHABLE_SIGNAL_THRESHOLD = 2;
const RETRY_PING_DELAY_MS = 1500;

type Listener = (reachable: boolean) => void;

let started = false;
let currentValue: boolean | null = null; // null = no successful check yet
let unreachableSignals = 0;
/** Capacitor network status — more reliable on iOS/Android than navigator.onLine. */
let nativeNetworkConnected: boolean | null = null;
let isForeground = true;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function startNativeNetworkTracking(): void {
  if (!isMobileNativePlatform()) return;
  void Network.getStatus()
    .then((status) => { nativeNetworkConnected = status.connected; })
    .catch(() => { /* keep null until listener fires */ });
  void Network.addListener("networkStatusChange", (status) => {
    const wasOff = nativeNetworkConnected === false;
    nativeNetworkConnected = status.connected;
    // Radio off: clear stale reachable=true immediately. Without this, auth gates
    // can treat the device as online for up to 30s (until the next ping tick)
    // and force Login even though the user is actively working offline.
    if (!status.connected) {
      if (currentValue !== false) notify(false);
      return;
    }
    // When the radio comes back online after being down, ping immediately
    // so reconnect is detected instantly rather than waiting up to 30s.
    if (wasOff && status.connected) {
      // Clear stale negative state before the advisory ping runs. Otherwise the
      // first write after reconnect can still be skipped even though the radio is
      // back and the server may be reachable.
      resetCircuitBreaker();
      if (currentValue === false) currentValue = null;
      pingNow();
      return;
    }
    // The link stayed "connected" but its type changed (e.g. Wi-Fi turned off
    // and the device fell back to cellular). The server may be unreachable from
    // the new connection (e.g. a LAN-only dev backend) even though the OS still
    // reports a network. Re-check immediately instead of waiting up to 30s —
    // and if that first check doesn't confirm reachable, check again shortly
    // after rather than waiting for the next 30s tick to cross the 2-signal
    // threshold. The retry is delayed (not immediate) because right as an
    // interface re-associates there's a brief window where iOS reports
    // "connected" before DNS/routing is actually live — firing both checks
    // back-to-back can land entirely inside that window and both fail,
    // false-flagging "offline" moments before a genuinely-fine connection.
    if (status.connected) {
      void (async () => {
        await runPingIfForeground();
        if (currentValue !== true) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_PING_DELAY_MS));
          await runPingIfForeground();
        }
      })();
    }
  });
}

function notify(value: boolean) {
  currentValue = value;
  listeners.forEach((fn) => fn(value));
}

async function runPingIfForeground() {
  if (!isForeground) return;
  // Native radio-off is authoritative: nothing can succeed without a link.
  if (isMobileNativePlatform() && nativeNetworkConnected === false) {
    notify(false);
    return;
  }

  // The /health ping is advisory only. It may confirm reachable, but it must
  // never declare unreachable because it uses a different transport.
  const reachable = await isServerReachable();
  if (reachable) {
    const wasBlocked = isCircuitOpen() || currentValue === false;
    unreachableSignals = 0;
    resetCircuitBreaker();
    notify(true);
    // Unblock axios traffic + sync flush when the health ping succeeds after an
    // offline stretch. api-server-reachable normally fires from axios success,
    // but the open circuit prevents any axios request from being attempted.
    if (wasBlocked && typeof window !== "undefined") {
      window.dispatchEvent(new Event("api-server-reachable"));
    }
  } else if (typeof window !== "undefined") {
    // Route through the same event real request failures use, so the existing
    // consecutive-signal threshold below still guards against one slow ping
    // false-flagging the app offline.
    window.dispatchEvent(new Event("api-server-unreachable"));
  }
}

function startForegroundTracking() {
  if (isMobileNativePlatform()) {
    void App.addListener("appStateChange", ({ isActive }) => {
      isForeground = isActive;
      if (isActive) void runPingIfForeground();
    });
  } else {
    isForeground = document.visibilityState === "visible";
    document.addEventListener("visibilitychange", () => {
      isForeground = document.visibilityState === "visible";
      if (isForeground) void runPingIfForeground();
    });
  }
}

/**
 * Starts the singleton ping loop. Safe to call from multiple places —
 * only the first call actually does anything.
 */
export function startConnectivityMonitor(): void {
  if (started) return;
  started = true;
  startNativeNetworkTracking();
  startForegroundTracking();
  void runPingIfForeground();
  intervalId = setInterval(() => { void runPingIfForeground(); }, PING_INTERVAL_MS);

  // Clear the false-offline flag on any successful API response, not just on
  // the next 30 s ping. `api.ts:228-232` dispatches `api-server-reachable`
  // on every real server response; treating that as a reachability signal
  // closes the up-to-30 s window where a single slow `/health` ping would
  // otherwise false-flag the app into stale-cache serving. Listener is
  // registered once at singleton startup so the cost is amortised.
  if (typeof window !== "undefined") {
    window.addEventListener("api-server-reachable", () => {
      unreachableSignals = 0;
      resetCircuitBreaker();
      if (currentValue !== true) notify(true);
    });

    // Only a real request failing with a genuine network error may mark the
    // server unreachable. Require consecutive signals so one slow startup
    // request does not stick the app in "Server not responding".
    window.addEventListener("api-server-unreachable", (event) => {
      const detail = (event as CustomEvent<{ isTimeout?: boolean }>).detail;
      // A slow endpoint timing out while other calls succeed is not "server down".
      if (detail?.isTimeout && hadRecentApiSuccess()) return;
      unreachableSignals += 1;
      if (unreachableSignals < UNREACHABLE_SIGNAL_THRESHOLD) return;
      tripCircuitBreaker();
      // During an active upload burst, timeouts usually mean a busy LAN server —
      // suppress the offline UI flip, but still trip the circuit so flush stops.
      if (shouldSuppressUnreachableOffline()) return;
      if (currentValue !== false) notify(false);
    });
  }
}

/**
 * Subscribe to server-reachability changes. Returns an unsubscribe function.
 * Calling this also starts the monitor if it hasn't started yet, so callers
 * never need to remember to call startConnectivityMonitor() separately.
 */
export function subscribeServerReachable(listener: Listener): () => void {
  startConnectivityMonitor();
  listeners.add(listener);
  if (currentValue !== null) listener(currentValue);
  return () => { listeners.delete(listener); };
}

/** Current known value, or null if no check has completed yet. */
export function getServerReachable(): boolean | null {
  return currentValue;
}

/** Capacitor-reported link state (null until first status event). */
export function getNativeNetworkConnected(): boolean | null {
  return nativeNetworkConnected;
}

/**
 * Skip blocking live fetches only when the device really has no signal or the
 * user explicitly forced manual offline mode. Do not fast-bail normal online
 * traffic just because a recent server ping failed.
 */
export function shouldSkipBlockingFetch(): boolean {
  if (isMobileNativePlatform() && nativeNetworkConnected === false) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return isManualOfflineModeActive();
}

/** Re-export for callers that need circuit-aware read skipping. */
export { isCircuitOpen, shouldSkipBlockingNetworkRead } from "../utils/circuitBreaker";

/**
 * Fast-bail guard for NATIVE write paths (runs, signatures, document links).
 *
 * Same as shouldSkipBlockingFetch(), plus: also skip when the health monitor has
 * positively confirmed the server unreachable. This stops the phone burning a
 * full timeout on a call we already know will fail before falling into the
 * offline queue.
 *
 * Deliberately NOT used by shouldSkipBlockingFetch() callers — that guard stays
 * untouched so web behavior does not change.
 *
 * SAFETY: only a confirmed false skips. null (never checked yet, e.g. cold
 * start) must NOT skip.
 */
export function shouldSkipRunMutation(): boolean {
  if (shouldSkipBlockingFetch()) return true;
  if (getServerReachable() === false) return true;
  return isCircuitOpen();
}

/**
 * Force an immediate check outside the regular interval — e.g. right after
 * the app comes back online, so the bar doesn't wait up to 30s to confirm.
 */
export function pingNow(): void {
  void runPingIfForeground();
}

/** Test/teardown helper — not used in production code paths. */
export function _resetConnectivityMonitorForTests(): void {
  started = false;
  currentValue = null;
  unreachableSignals = 0;
  nativeNetworkConnected = null;
  isForeground = true;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  listeners.clear();
}
