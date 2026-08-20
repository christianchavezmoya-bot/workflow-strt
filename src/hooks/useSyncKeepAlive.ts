import { useEffect } from "react";
import { isMobileNativePlatform } from "../utils/platform";
import { isSyncFlushing } from "../utils/syncFlushLock";
import { startSyncKeepAlive, stopSyncKeepAlive } from "../services/syncKeepAlive";

/**
 * While the offline queue is flushing, keep the device awake and (on Android)
 * run a dataSync foreground service so large uploads survive app backgrounding.
 */
export function useSyncKeepAlive(): void {
  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    let active = false;

    const apply = (syncing: boolean) => {
      if (syncing) {
        if (active) return;
        active = true;
        void startSyncKeepAlive();
        return;
      }
      if (!active) return;
      active = false;
      void stopSyncKeepAlive();
    };

    const onSyncing = (event: Event) => {
      const detail = (event as CustomEvent<{ syncing?: boolean }>).detail;
      apply(Boolean(detail?.syncing));
    };

    window.addEventListener("sync-engine:syncing", onSyncing);

    // If this hook mounts while a flush is already in progress, start immediately.
    if (isSyncFlushing()) {
      apply(true);
    }

    return () => {
      window.removeEventListener("sync-engine:syncing", onSyncing);
      void stopSyncKeepAlive();
    };
  }, []);
}

export default useSyncKeepAlive;
