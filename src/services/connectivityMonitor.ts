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
import { isServerReachable } from "./networkService";
import { isMobileNativePlatform } from "../utils/platform";

const PING_INTERVAL_MS = 30_000;

type Listener = (reachable: boolean) => void;

let started = false;
let currentValue: boolean | null = null; // null = no successful check yet
let isForeground = true;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function notify(value: boolean) {
  currentValue = value;
  listeners.forEach((fn) => fn(value));
}

async function runPingIfForeground() {
  if (!isForeground) return;
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
  isForeground = true;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  listeners.clear();
}
