import { useEffect, useRef, useState } from "react";
import { isMobileNativePlatform } from "../utils/platform";

export type NativeLifecyclePhase = "idle" | "background" | "foreground-sync";

/**
 * Native-only lifecycle UI hook. Listens to app-foregrounded / app-backgrounded
 * events dispatched by useNativeSyncLifecycle (single appStateChange owner).
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
      showForegroundSync();
    };

    const onBackground = () => {
      setPhase("background");
    };

    const onBackOnline = () => {
      showForegroundSync();
    };

    window.addEventListener("app-foregrounded", onForeground);
    window.addEventListener("app-backgrounded", onBackground);
    window.addEventListener("offline-mode-online", onBackOnline);
    window.addEventListener("online", onBackOnline);

    return () => {
      window.removeEventListener("app-foregrounded", onForeground);
      window.removeEventListener("app-backgrounded", onBackground);
      window.removeEventListener("offline-mode-online", onBackOnline);
      window.removeEventListener("online", onBackOnline);
      if (hideTimerRef.current !== undefined) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  return { phase };
}
