import { App } from "@capacitor/app";
import { useEffect, useRef, useState } from "react";
import { pingNow } from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "../utils/platform";

export type NativeLifecyclePhase = "idle" | "background" | "foreground-sync";

/**
 * Native-only lifecycle hook: foreground resume triggers connectivity ping,
 * notification refresh, and a brief UI hint while queued writes drain.
 */
export function useNativeAppLifecycle() {
  const [phase, setPhase] = useState<NativeLifecyclePhase>("idle");
  const hideTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    const showForegroundSync = () => {
      setPhase("foreground-sync");
      if (hideTimerRef.current !== undefined) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setPhase("idle"), 4000);
    };

    const onForeground = () => {
      pingNow();
      window.dispatchEvent(new CustomEvent("app-foregrounded", { detail: { timestamp: Date.now() } }));
      window.dispatchEvent(new Event("notifications:refresh"));
      showForegroundSync();
    };

    const onBackground = () => {
      setPhase("background");
      window.dispatchEvent(new Event("app-backgrounded"));
    };

    const onBackOnline = () => {
      pingNow();
      showForegroundSync();
    };

    let removeAppListener: (() => void) | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) onForeground();
      else onBackground();
    }).then((handle) => {
      removeAppListener = () => { void handle.remove(); };
    });

    window.addEventListener("offline-mode-online", onBackOnline);
    window.addEventListener("online", onBackOnline);

    return () => {
      removeAppListener?.();
      window.removeEventListener("offline-mode-online", onBackOnline);
      window.removeEventListener("online", onBackOnline);
      if (hideTimerRef.current !== undefined) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  return { phase };
}
