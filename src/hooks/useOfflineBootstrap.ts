/**
 * useOfflineBootstrap — keeps the native offline cache warm.
 *
 * - On reconnect: mark pending; after upload flush drains, one assigned-scope download.
 * - On mount / foreground: refresh when the last bootstrap is stale (~4h).
 */

import { useEffect, useRef } from "react";
import { scheduleBootstrapAfterUploadDrain } from "../utils/bootstrapAfterDrain";
import { shouldScheduleBootstrap } from "../utils/bootstrapFreshness";
import {
  markNativeBootstrapFinished,
  markNativeBootstrapStarted,
  markNativeReconnectPending,
  markNativeSyncFlushFinished,
  markNativeSyncFlushStarted,
} from "../utils/nativeReconnectCoordinator";
import { isMobileNativePlatform } from "../utils/platform";
import { subscribeServerReachable } from "../services/connectivityMonitor";
import offlineBootstrapService from "../services/offlineBootstrapService";

export function useOfflineBootstrap(): void {
  const needsReconnectBootstrapRef = useRef(false);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    let cancelled = false;

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

    const onFlushStart = () => {
      markNativeSyncFlushStarted();
    };

    const onFlushComplete = (event: Event) => {
      markNativeSyncFlushFinished();
      const detail = (event as CustomEvent<{ pendingRemaining?: number }>).detail;
      if ((detail?.pendingRemaining ?? 0) > 0) return;

      const reason = needsReconnectBootstrapRef.current ? "reconnect" : "flush-complete";
      needsReconnectBootstrapRef.current = false;
      scheduleBootstrapAfterUploadDrain("assigned", 5_000, false, reason);
    };

    const onBootstrapStart = () => {
      markNativeBootstrapStarted();
    };

    const onBootstrapDone = () => {
      markNativeBootstrapFinished();
    };

    let lastServerReachable = true;
    const unsubReachable = subscribeServerReachable((reachable) => {
      if (!reachable) {
        needsReconnectBootstrapRef.current = true;
        lastServerReachable = false;
        return;
      }
      if (!lastServerReachable) {
        markNativeReconnectPending();
      }
      lastServerReachable = reachable;
    });

    window.addEventListener("app-foregrounded", onForeground);
    window.addEventListener("sync-engine:flush-start", onFlushStart);
    window.addEventListener("sync-engine:flush-complete", onFlushComplete);
    window.addEventListener("bootstrap:started", onBootstrapStart);
    window.addEventListener("bootstrap:complete", onBootstrapDone);
    window.addEventListener("bootstrap:error", onBootstrapDone);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("app-foregrounded", onForeground);
      window.removeEventListener("sync-engine:flush-start", onFlushStart);
      window.removeEventListener("sync-engine:flush-complete", onFlushComplete);
      window.removeEventListener("bootstrap:started", onBootstrapStart);
      window.removeEventListener("bootstrap:complete", onBootstrapDone);
      window.removeEventListener("bootstrap:error", onBootstrapDone);
      unsubReachable();
    };
  }, []);
}

export default useOfflineBootstrap;
