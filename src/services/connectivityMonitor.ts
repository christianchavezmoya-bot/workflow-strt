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
import { isMobileNativePlatform } from "../utils/platform";

const PING_INTERVAL_MS = 30_000;

type Listener = (reachable: boolean) => void;

let started = false;
let currentValue: boolean | null = null; // null = no successful check yet
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
    // When the radio comes back online after being down, ping immediately
    // so reconnect is detected instantly rather than waiting up to 30s.
    if (wasOff && status.connected) {
      pingNow();
    }
  });
}

function notify(value: boolean) {
  currentValue = value;
  listeners.forEach((fn) => fn(value));
}

async function runPingIfForeground() {
  if (!isForeground) return;
  // If Capacitor already reports no radio, skip the guaranteed-to-fail HTTP
  // call and report unreachable directly — saves battery + noise.
  if (isMobileNativePlatform() && nativeNetworkConnected === false) {
    notify(false);
    return;
  }
  const reachable = await isServerReachable();
  notify(reachable);
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
 * Skip blocking live fetches when the device or server is definitely unreachable.
 * On native, Capacitor Network is preferred over navigator.onLine (often wrong in
 * airplane mode). When server ping has not completed yet but the device has no
 * link, still skip — cache-first reads will return local data instantly.
 */
export function shouldSkipBlockingFetch(): boolean {
  if (isMobileNativePlatform() && nativeNetworkConnected === false) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return getServerReachable() === false;
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
  nativeNetworkConnected = null;
  isForeground = true;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  listeners.clear();
}
