import { isMobileNativePlatform } from "./platform";

/** Bottom tab bar (60px) + small buffer; matches AppShell / index.css layout. */
export const NATIVE_BOTTOM_NAV_INSET = "calc(72px + env(safe-area-inset-bottom))";

/** z-index above BottomTabBar (1400) so dialog actions stay tappable on native. */
export const NATIVE_DIALOG_Z_INDEX = 1500;

export function nativeDialogSx() {
  return isMobileNativePlatform() ? { zIndex: NATIVE_DIALOG_Z_INDEX } : undefined;
}

export function nativeDialogPaperSx(extra?: Record<string, unknown>) {
  if (!isMobileNativePlatform()) return extra;
  return {
    maxHeight: `calc(100vh - ${NATIVE_BOTTOM_NAV_INSET})`,
    mb: NATIVE_BOTTOM_NAV_INSET,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    ...extra,
  };
}

export function nativeDialogActionsSx(extra?: Record<string, unknown>) {
  if (!isMobileNativePlatform()) return extra;
  return {
    pb: `calc(12px + env(safe-area-inset-bottom, 0px))`,
    flexShrink: 0,
    ...extra,
  };
}
