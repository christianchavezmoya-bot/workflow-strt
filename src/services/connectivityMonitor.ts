/**
 * connectivityMonitor — singleton background ping for server reachability.
 *
 * Why this exists as its own module instead of living inside useSyncEngine:
 * useSyncEngine is a React hook, and it is currently called from several
 * components at once (SyncStatusBadge, PullToRefresh,
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
/** After this many consecutive timeout-tagged failures, flip offline even with radio up. */
const SUSTAINED_TIMEOUT_SIGNAL_THRESHOLD = 5;
/** Or when no confirmed server success for this long while timeouts keep arriving. */
const SUSTAINED_FAILURE_WITHOUT_SUCCESS_MS = 35_000;

type Listener = (reachable: boolean | null) => void;

/** True when the device still has a radio link (native Capacitor or browser). */
function hasNetworkSignal(): boolean {
  if (isMobileNativePlatform()) return nativeNetworkConnected !== false;
  return typeof navigator === "undefined" || navigator.onLine;
}

let started = false;
let currentValue: boolean | null = null; // null = no successful check yet
let unreachableSignals = 0;
let consecutiveTimeoutSignals = 0;
let lastConfirmedSuccessAt = 0;
/** Capacitor network status — more reliable on iOS/Android than navigator.onLine. */
let nativeNetworkConnected: boolean | null = null;
let isForeground = true;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();
let onApiServerReachable: (() => void) | null = null;
let onApiServerUnreachable: ((event: Event) => void) | null = null;

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
      if (currentValue === false) notify(null);
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

function notify(value: boolean | null) {
  currentValue = value;
  if (value === true) {
    consecutiveTimeoutSignals = 0;
    lastConfirmedSuccessAt = Date.now();
  }
  listeners.forEach((fn) => fn(value));
}

function sustainedTimeoutFailure(): boolean {
  if (lastConfirmedSuccessAt <= 0) {
    return consecutiveTimeoutSignals >= SUSTAINED_TIMEOUT_SIGNAL_THRESHOLD;
  }
  return consecutiveTimeoutSignals >= SUSTAINED_TIMEOUT_SIGNAL_THRESHOLD
    || Date.now() - lastConfirmedSuccessAt >= SUSTAINED_FAILURE_WITHOUT_SUCCESS_MS;
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
    // Health ping uses a 4s hard timeout on a different transport than axios.
    // Tag as timeout so a busy LAN (dashboard GET storm) cannot flip the app
    // to amber-offline while the radio is up — same rule as axios ECONNABORTED.
    window.dispatchEvent(new CustomEvent("api-server-unreachable", {
      detail: { isTimeout: true, source: "health-ping" },
    }));
  }
}

/** Clear stale unreachable state when returning from background (mirrors radio reconnect). */
export function prepareForegroundConnectivityResume(): void {
  resetCircuitBreaker();
  unreachableSignals = 0;
  if (currentValue === false) notify(null);
}

function startForegroundTracking() {
  if (isMobileNativePlatform()) {
    void App.addListener("appStateChange", ({ isActive }) => {
      isForeground = isActive;
      if (isActive) {
        prepareForegroundConnectivityResume();
        void runPingIfForeground();
      }
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

  // Clear false-offline / open-circuit state on any successful API response.
  // When the UI was stuck on serverReachable=false, a real server response is
  // strong evidence the link is back — recover without waiting for /health.
  // Background sync flush still requires isServerConfirmedReachable() / health
  // for first confirmation after a cold start (null), so a lone GET on a flaky
  // link does not start uploads from never-confirmed.
  if (typeof window !== "undefined") {
    onApiServerReachable = () => {
      unreachableSignals = 0;
      consecutiveTimeoutSignals = 0;
      lastConfirmedSuccessAt = Date.now();
      resetCircuitBreaker();
      if (currentValue === false && hadRecentApiSuccess()) {
        notify(true);
      }
    };
    onApiServerUnreachable = (event) => {
      const detail = (event as CustomEvent<{ isTimeout?: boolean; source?: string }>).detail;
      const isTimeout = Boolean(detail?.isTimeout);
      // Advisory /health pings must not open the axios circuit before any real API
      // attempt on a cold start — otherwise failed LAN pings block sync forever at
      // serverReachable=null even though the server may respond to POSTs.
      if (detail?.source === "health-ping" && currentValue === null) {
        return;
      }
      // A slow endpoint timing out while other calls succeed is not "server down".
      if (isTimeout && hadRecentApiSuccess()) {
        consecutiveTimeoutSignals = 0;
        return;
      }
      if (isTimeout) {
        consecutiveTimeoutSignals += 1;
      } else {
        consecutiveTimeoutSignals = 0;
      }
      unreachableSignals += 1;
      if (unreachableSignals < UNREACHABLE_SIGNAL_THRESHOLD) return;
      tripCircuitBreaker();
      // During an active upload burst, timeouts usually mean a busy LAN server —
      // suppress the offline UI flip, but still trip the circuit so flush stops.
      if (shouldSuppressUnreachableOffline()) return;
      // GET timeouts on a connected phone usually mean a saturated LAN server,
      // not a dead link — unless failures are sustained (cellular/LAN truly down).
      if (isTimeout && hasNetworkSignal() && !sustainedTimeoutFailure()) return;
      if (currentValue !== false) notify(false);
    };
    window.addEventListener("api-server-reachable", onApiServerReachable);
    window.addEventListener("api-server-unreachable", onApiServerUnreachable);
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

/** Native sync/bootstrap gate: true only after a successful /health ping. */
export function isServerConfirmedReachable(): boolean {
  return getServerReachable() === true;
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
 * Interactive native writes (start/save/complete run, signatures, pause time-entry).
 *
 * Skip when the device has no radio, manual offline is on, OR the amber-banner
 * already knows the server is unreachable (confirmed false / open circuit).
 *
 * Fail OPEN when reachability is unknown (null) — try the network once rather
 * than queueing on a cold start before the first /health ping.
 *
 * Aligns with OfflineModeContext's offline banner so run actions do not wait
 * 10–60s for axios timeouts while the UI already shows offline. True online
 * phones (reachable === true, circuit closed) still send immediately (#246).
 */
export function shouldSkipInteractiveWrite(): boolean {
  if (shouldSkipBlockingFetch()) return true;
  if (getServerReachable() === false) return true;
  // Fail open while reachability is still unknown — circuit may be tripped by /health
  // timeouts before any axios call proves the server is actually up.
  if (getServerReachable() === null) return false;
  return isCircuitOpen();
}

/** @deprecated Prefer shouldSkipInteractiveWrite — kept for existing call sites. */
export function shouldSkipRunMutation(): boolean {
  return shouldSkipInteractiveWrite();
}

/**
 * Gate for background sync flush and sync-engine uploads.
 * Same criteria as interactive writes — server confirmed down or circuit open.
 */
export function shouldDeferBackgroundSync(): boolean {
  return shouldSkipInteractiveWrite();
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
  consecutiveTimeoutSignals = 0;
  lastConfirmedSuccessAt = 0;
  nativeNetworkConnected = null;
  isForeground = true;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  listeners.clear();
  if (typeof window !== "undefined") {
    if (onApiServerReachable) {
      window.removeEventListener("api-server-reachable", onApiServerReachable);
      onApiServerReachable = null;
    }
    if (onApiServerUnreachable) {
      window.removeEventListener("api-server-unreachable", onApiServerUnreachable);
      onApiServerUnreachable = null;
    }
  }
}

/** Reset reachability state without unregistering the singleton monitor. */
export function _resetConnectivityStateForTests(): void {
  currentValue = null;
  unreachableSignals = 0;
  consecutiveTimeoutSignals = 0;
  lastConfirmedSuccessAt = 0;
  nativeNetworkConnected = true;
  resetCircuitBreaker();
}

/** Test hook — set confirmed server reachability without starting the monitor. */
export function _setServerReachableForTests(value: boolean | null): void {
  currentValue = value;
}
