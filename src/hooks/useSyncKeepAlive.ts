import { useEffect } from "react";
import { isMobileNativePlatform } from "../utils/platform";
import { startSyncKeepAlive, stopSyncKeepAlive } from "../services/syncKeepAlive";
import {
  NATIVE_FOREGROUND_SYNC_SESSION_EVENT,
  type NativeForegroundSyncSessionState,
} from "../utils/nativeForegroundSyncSession";

/**
 * While a native foreground sync session has network work in flight, keep the
 * device awake and (on Android) run a dataSync foreground service.
 * Keep-awake turns off when only conflicts remain (Phase D).
 */
export function useSyncKeepAlive(): void {
  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    let active = false;

    const apply = (keepAwake: boolean) => {
      if (keepAwake) {
        if (active) return;
        active = true;
        void startSyncKeepAlive();
        return;
      }
      if (!active) return;
      active = false;
      void stopSyncKeepAlive();
    };

    const onSessionState = (event: Event) => {
      const detail = (event as CustomEvent<NativeForegroundSyncSessionState>).detail;
      apply(Boolean(detail?.keepAwake));
    };

    window.addEventListener(NATIVE_FOREGROUND_SYNC_SESSION_EVENT, onSessionState);

    return () => {
      window.removeEventListener(NATIVE_FOREGROUND_SYNC_SESSION_EVENT, onSessionState);
      if (active) void stopSyncKeepAlive();
    };
  }, []);
}

export default useSyncKeepAlive;
