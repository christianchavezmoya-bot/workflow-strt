import { App } from "@capacitor/app";
import { useEffect } from "react";
import {
  pingNow,
  prepareForegroundConnectivityResume,
} from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "../utils/platform";
import { registerPushNotificationsIfNeeded, attachPushRegistrationOnAuth } from "../services/pushNotificationService";

const FOREGROUND_PING_RETRY_MS = 1_500;

/**
 * Single native lifecycle hook: resume connectivity + sync on foreground.
 * Dispatches app-foregrounded / app-backgrounded for other subscribers.
 * Upload/download continue in background when the Android dataSync foreground
 * service is active (see useSyncKeepAlive); iOS still suspends WebView JS unless
 * the app stays in foreground with keep-awake enabled.
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
      prepareForegroundConnectivityResume();
      clearPingRetry();
      pingNow();
      pingRetryTimer = window.setTimeout(() => {
        pingRetryTimer = undefined;
        pingNow();
      }, FOREGROUND_PING_RETRY_MS);

      window.dispatchEvent(new CustomEvent("app-foregrounded", { detail: { timestamp: Date.now() } }));
      window.dispatchEvent(new Event("notifications:refresh"));
      window.dispatchEvent(new Event("sync-request-flush-now"));
    };

    const onBackground = () => {
      clearPingRetry();
      window.dispatchEvent(new Event("app-backgrounded"));
    };

    attachPushRegistrationOnAuth();

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
