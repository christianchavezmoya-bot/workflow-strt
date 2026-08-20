import { useEffect } from "react";
import { isMobileNativePlatform } from "../utils/platform";
import { startSyncKeepAlive, stopSyncKeepAlive } from "../services/syncKeepAlive";
import { isNativeSyncUiActive, isNativeSyncUiActiveNow } from "../utils/nativeSyncUiState";

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
        if (!isNativeSyncUiActive(true)) return;
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

    if (isNativeSyncUiActiveNow()) {
      apply(true);
    }

    return () => {
      window.removeEventListener("sync-engine:syncing", onSyncing);
      if (active) void stopSyncKeepAlive();
    };
  }, []);
}

export default useSyncKeepAlive;
