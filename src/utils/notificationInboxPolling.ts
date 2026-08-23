import { isDashboardRoute } from "./postLoginRoute";
import { isMobileNativePlatform } from "./platform";

/**
 * Whether the notification bell poll loop should pause/resume on
 * document.visibilitychange.
 *
 * On native Capacitor, camera/photo/file pickers flip visibility to "hidden"
 * without appStateChange — pausing on visibilitychange freezes the bell until a
 * full background/foreground cycle. Web tabs have no appStateChange, so
 * visibilitychange is the correct lifecycle signal there.
 */
export function notificationPollingUsesVisibilityChange(): boolean {
  return !isMobileNativePlatform();
}

/**
 * Native bell polling may resume when Capacitor appState briefly flips to
 * background during sync overlay / keep-awake while the user is still on
 * Dashboard and the server is reachable again.
 */
export function nativeNotificationPollingAllowed(opts: {
  nativeAppActive: boolean;
  serverReachable: boolean | null;
  pathname: string;
}): boolean {
  if (opts.nativeAppActive) return true;
  if (opts.serverReachable === true && isDashboardRoute(opts.pathname)) return true;
  return false;
}
