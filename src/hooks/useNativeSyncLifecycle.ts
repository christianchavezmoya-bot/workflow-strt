import { App } from "@capacitor/app";
import { useEffect } from "react";
import {
  pingNow,
  prepareForegroundConnectivityResume,
} from "../services/connectivityMonitor";
import { setSyncLifecyclePaused } from "../services/syncLifecycleState";
import { isMobileNativePlatform } from "../utils/platform";
import { pendingCount } from "../services/localDB";
import {
  cancelPendingUploadLocalReminder,
  schedulePendingUploadLocalReminder,
  registerPushNotificationsIfNeeded,
} from "../services/pushNotificationService";

const FOREGROUND_PING_RETRY_MS = 1_500;

/**
 * Single native lifecycle hook: pause sync/download in background, resume on foreground.
 * Dispatches app-foregrounded / app-backgrounded for other subscribers.
 */
export function useNativeSyncLifecycle(): void {
  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    let removeListener: (() => void) | undefined;
    let pingRetryTimer: number | undefined;

    const clearPingRetry = () => {
      if (pingRetryTimer !== undefined) {
        window.clearTimeout(pingRetryTimer);
        pingRetryTimer = undefined;
      }
    };

    const onForeground = () => {
      setSyncLifecyclePaused(false);
      prepareForegroundConnectivityResume();
      clearPingRetry();
      pingNow();
      pingRetryTimer = window.setTimeout(() => {
        pingRetryTimer = undefined;
        pingNow();
      }, FOREGROUND_PING_RETRY_MS);

      window.dispatchEvent(new CustomEvent("app-foregrounded", { detail: { timestamp: Date.now() } }));
      window.dispatchEvent(new Event("notifications:refresh"));

      void cancelPendingUploadLocalReminder();
      window.dispatchEvent(new Event("sync-request-flush-now"));
    };

    const onBackground = () => {
      clearPingRetry();
      setSyncLifecyclePaused(true);
      window.dispatchEvent(new Event("app-backgrounded"));

      void pendingCount().then((count) => {
        if (count > 0) void schedulePendingUploadLocalReminder(count);
      });
    };

    void registerPushNotificationsIfNeeded();

    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) onForeground();
      else onBackground();
    }).then((handle) => {
      removeListener = () => {
        void handle.remove();
      };
    });

    return () => {
      clearPingRetry();
      removeListener?.();
    };
  }, []);
}

export default useNativeSyncLifecycle;
