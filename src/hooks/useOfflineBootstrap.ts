/**
 * useOfflineBootstrap — keeps the native offline cache warm.
 *
 * - On reconnect / server reachable: assigned-scope download when freshness gate allows.
 * - On mount / foreground: refresh when the last bootstrap is stale (~4h).
 */

import { useEffect, useRef } from "react";
import { offlineBootstrapService } from "../services/offlineBootstrapService";
import { scheduleBootstrapAfterUploadDrain, scheduleBootstrapIfQueueEmpty } from "../utils/bootstrapAfterDrain";
import { shouldScheduleBootstrap } from "../utils/bootstrapFreshness";
import { isMobileNativePlatform } from "../utils/platform";
import { subscribeServerReachable } from "../services/connectivityMonitor";

export function useOfflineBootstrap(): void {
  const needsReconnectSyncRef = useRef(false);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    let cancelled = false;

    const RECONNECT_SYNC_COOLDOWN_MS = 90_000;

    const runReconnectSync = async () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (offlineBootstrapService.isRunning()) return;
      const lastMs = offlineBootstrapService.getLastCompletedAtMs();
      if (lastMs !== null && Date.now() - lastMs < RECONNECT_SYNC_COOLDOWN_MS) return;

      const should = await shouldScheduleBootstrap({
        reason: "reconnect",
        scope: "assigned",
        force: false,
      });
      if (!should) return;
      scheduleBootstrapAfterUploadDrain("assigned", 3_000, false, "reconnect");
    };

    const maybeRunStale = async () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (offlineBootstrapService.isRunning()) return;
      const should = await shouldScheduleBootstrap({
        reason: "stale-foreground",
        scope: "all",
        force: false,
      });
      if (should) {
        scheduleBootstrapAfterUploadDrain("all", 3_000, false, "stale-foreground");
      }
    };

    const timer = window.setTimeout(() => { void maybeRunStale(); }, 1500);

    const onForeground = () => { void maybeRunStale(); };

    const onFlushComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ pendingRemaining?: number }>).detail;
      scheduleBootstrapIfQueueEmpty(detail?.pendingRemaining ?? 0, "assigned");
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
        void runReconnectSync();
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
