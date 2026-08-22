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
