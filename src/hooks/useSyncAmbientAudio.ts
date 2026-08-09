import { useEffect } from "react";
import { offlineBootstrapService } from "../services/offlineBootstrapService";
import {
  pauseSyncAmbientAudio,
  refreshSyncAmbientPlayback,
  setSyncAmbientDownloadActive,
  setSyncAmbientUploadActive,
  stopSyncAmbientAudio,
} from "../services/syncAmbientAudio";
import { isMobileNativePlatform } from "../utils/platform";

/**
 * Plays ambient audio while uploads (sync flush) or downloads (offline bootstrap) run.
 * Stops when both finish or the app backgrounds.
 */
export function useSyncAmbientAudio(): void {
  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    const onUploadSyncing = (event: Event) => {
      const detail = (event as CustomEvent<{ syncing?: boolean }>).detail;
      setSyncAmbientUploadActive(Boolean(detail?.syncing));
    };

    const onDownloadStart = () => setSyncAmbientDownloadActive(true);
    const onDownloadEnd = () => setSyncAmbientDownloadActive(false);

    const onBackground = () => pauseSyncAmbientAudio();
    const onForeground = () => {
      setSyncAmbientDownloadActive(offlineBootstrapService.isRunning());
      refreshSyncAmbientPlayback();
    };

    window.addEventListener("sync-engine:syncing", onUploadSyncing);
    window.addEventListener("bootstrap:started", onDownloadStart);
    window.addEventListener("bootstrap:complete", onDownloadEnd);
    window.addEventListener("bootstrap:error", onDownloadEnd);
    window.addEventListener("app-backgrounded", onBackground);
    window.addEventListener("app-foregrounded", onForeground);

    setSyncAmbientDownloadActive(offlineBootstrapService.isRunning());

    return () => {
      window.removeEventListener("sync-engine:syncing", onUploadSyncing);
      window.removeEventListener("bootstrap:started", onDownloadStart);
      window.removeEventListener("bootstrap:complete", onDownloadEnd);
      window.removeEventListener("bootstrap:error", onDownloadEnd);
      window.removeEventListener("app-backgrounded", onBackground);
      window.removeEventListener("app-foregrounded", onForeground);
      stopSyncAmbientAudio();
    };
  }, []);
}

export default useSyncAmbientAudio;
