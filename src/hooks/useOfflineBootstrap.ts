import { useEffect, useRef } from "react";
import { offlineBootstrapService } from "../services/offlineBootstrapService";
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

    const runFullSync = () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (offlineBootstrapService.isRunning()) return;
      void offlineBootstrapService.runOnReconnect();
    };

    const maybeRunStale = async () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (offlineBootstrapService.isRunning()) return;
      if (await offlineBootstrapService.isStale()) {
        void offlineBootstrapService.run({ scope: "all" });
      }
    };

    const timer = window.setTimeout(() => { void maybeRunStale(); }, 1500);

    const onForeground = () => { void maybeRunStale(); };

    const onOffline = () => {
      needsReconnectSyncRef.current = true;
    };

    const onOnline = () => {
      if (!needsReconnectSyncRef.current) return;
      needsReconnectSyncRef.current = false;
      runFullSync();
    };

    let lastServerReachable = true;
    const unsubReachable = subscribeServerReachable((reachable) => {
      if (!reachable) {
        needsReconnectSyncRef.current = true;
        lastServerReachable = false;
        return;
      }
      if (!lastServerReachable && needsReconnectSyncRef.current) {
        needsReconnectSyncRef.current = false;
        runFullSync();
      }
      lastServerReachable = reachable;
    });

    window.addEventListener("app-foregrounded", onForeground);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("app-foregrounded", onForeground);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsubReachable();
    };
  }, []);
}

export default useOfflineBootstrap;
