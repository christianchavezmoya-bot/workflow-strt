import { useEffect, useRef } from "react";
import { offlineBootstrapService } from "../services/offlineBootstrapService";
import { scheduleBootstrapAfterUploadDrain, scheduleBootstrapIfQueueEmpty } from "../utils/bootstrapAfterDrain";
import { isMobileNativePlatform } from "../utils/platform";
import { subscribeServerReachable } from "../services/connectivityMonitor";

/**
 * useOfflineBootstrap — keeps the native offline cache warm.
 *
 * - On reconnect / server reachable: full sync of all projects, assets, workflows
 *   (even pages never visited while online).
 * - On mount / foreground: refresh when the last bootstrap is stale (~4h).
 */
export function useOfflineBootstrap(): void {
  const needsReconnectSyncRef = useRef(false);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    let cancelled = false;

    // A flapping reachability signal can report several offline→online transitions in a short
    // burst (e.g. Wi-Fi re-associating). Each one is a legitimate "came back online" event on its
    // own, but runOnReconnect() is a full re-download of every project/asset/assignment/config —
    // firing it once per blip stacks redundant full downloads instead of running once. This
    // cooldown caps how often a reconnect can trigger a full resync, well under the 4h isStale()
    // foreground safety net that still catches anything a cooldown skips.
    const RECONNECT_SYNC_COOLDOWN_MS = 90_000;

    const runFullSync = () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (offlineBootstrapService.isRunning()) return;
      const lastMs = offlineBootstrapService.getLastCompletedAtMs();
      if (lastMs !== null && Date.now() - lastMs < RECONNECT_SYNC_COOLDOWN_MS) return;
      void offlineBootstrapService.runOnReconnect();
    };

    const maybeRunStale = async () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (offlineBootstrapService.isRunning()) return;
      if (await offlineBootstrapService.isStale()) {
        scheduleBootstrapAfterUploadDrain("all");
      }
    };

    const timer = window.setTimeout(() => { void maybeRunStale(); }, 1500);

    const onForeground = () => { void maybeRunStale(); };

    const onFlushComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ pendingRemaining?: number }>).detail;
      scheduleBootstrapIfQueueEmpty(detail?.pendingRemaining ?? 0, "all");
    };

    let lastServerReachable = true;
    const unsubReachable = subscribeServerReachable((reachable) => {
      if (!reachable) {
        needsReconnectSyncRef.current = true;
        lastServerReachable = false;
        return;
      }
      // Full field download only after server health ping confirms reachability —
      // not on radio reconnect alone (corporate Wi‑Fi may not reach the LAN server).
      if (!lastServerReachable && needsReconnectSyncRef.current) {
        needsReconnectSyncRef.current = false;
        runFullSync();
      }
      lastServerReachable = reachable;
    });

    window.addEventListener("app-foregrounded", onForeground);
    window.addEventListener("sync-engine:flush-complete", onFlushComplete);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("app-foregrounded", onForeground);
      window.removeEventListener("sync-engine:flush-complete", onFlushComplete);
      unsubReachable();
    };
  }, []);
}

export default useOfflineBootstrap;
