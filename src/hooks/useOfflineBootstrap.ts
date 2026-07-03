import { useEffect } from "react";
import { offlineBootstrapService } from "../services/offlineBootstrapService";
import { isMobileNativePlatform } from "../utils/platform";

/**
 * useOfflineBootstrap — ensures the offline data cache stays warm.
 *
 * - On mount (app open / biometric unlock): runs a bootstrap pass if the last
 *   one is stale or has never happened.
 * - On foreground + online: refreshes if stale.
 *
 * All work is silent and non-blocking (native only). Fresh logins are handled
 * separately in Login.tsx with force=true.
 */
export function useOfflineBootstrap(): void {
  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    let cancelled = false;

    const maybeRun = async () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (offlineBootstrapService.isRunning()) return;
      if (await offlineBootstrapService.isStale()) {
        void offlineBootstrapService.run();
      }
    };

    // Initial check shortly after mount so it never competes with first paint.
    const timer = window.setTimeout(() => { void maybeRun(); }, 1500);

    const onForeground = () => { void maybeRun(); };
    const onOnline = () => { void maybeRun(); };

    window.addEventListener("app-foregrounded", onForeground);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("app-foregrounded", onForeground);
      window.removeEventListener("online", onOnline);
    };
  }, []);
}

export default useOfflineBootstrap;
