import { isMobileNativePlatform } from "./platform";

/** Bottom tab bar (60px) + small buffer; matches AppShell / index.css layout. */
export const NATIVE_BOTTOM_NAV_INSET = "calc(72px + env(safe-area-inset-bottom))";

/** z-index above BottomTabBar (1400) so dialog actions stay tappable on native. */
export const NATIVE_DIALOG_Z_INDEX = 1500;

/** MUI DatePicker popper must sit above native dialogs (1500). */
export const NATIVE_PICKER_Z_INDEX = 1600;

/** Nested dialogs (e.g. flag-issue inside WorkOrderRunner) sit between runner and pickers. */
export const NATIVE_NESTED_DIALOG_Z_INDEX = 1550;

export function nativeDialogSx() {
  return isMobileNativePlatform() ? { zIndex: NATIVE_DIALOG_Z_INDEX } : undefined;
}

export function nativeNestedDialogSx() {
  return isMobileNativePlatform() ? { zIndex: NATIVE_NESTED_DIALOG_Z_INDEX } : undefined;
}

/**
 * Same fix as nativeNestedDialogSx(), for MUI Popover/Menu instead of Dialog. Popover is built on
 * the same Modal primitive as Dialog and gets the same MUI-default zIndex (1300) with no override
 * — below the runner's pinned 1500 on native, so a Popover opened from inside WorkOrderRunner
 * (e.g. the Start Downtime reason popover) mounts and opens correctly but renders invisibly
 * behind the still-visible runner. Apply via the `sx` prop, which Popover forwards to its root
 * Modal exactly like Dialog does.
 */
export function nativePopoverSx() {
  return isMobileNativePlatform() ? { zIndex: NATIVE_NESTED_DIALOG_Z_INDEX } : undefined;
}

/** Popper slotProps so calendar opens above native workflow/time dialogs. */
export function nativeDatePickerDialogSlotProps() {
  if (!isMobileNativePlatform()) return undefined;
  return { sx: { zIndex: NATIVE_PICKER_Z_INDEX } };
}

export function nativeDatePickerPopperSlotProps() {
  if (!isMobileNativePlatform()) return undefined;
  return { sx: { zIndex: NATIVE_PICKER_Z_INDEX } };
}

/** MUI Select/Menu inside native nested dialogs — render in-place so stacking beats portal z-index fights. */
export function nativeSelectMenuProps() {
  if (!isMobileNativePlatform()) return undefined;
  return {
    disablePortal: true,
    PaperProps: {
      sx: { zIndex: NATIVE_PICKER_Z_INDEX },
    },
    sx: { zIndex: NATIVE_PICKER_Z_INDEX },
  };
}

export function nativeDialogPaperSx(extra?: Record<string, unknown>) {
  if (!isMobileNativePlatform()) return extra;
  return {
    // 100dvh (dynamic viewport height), not 100vh: WKWebView computes 100vh against the
    // LARGEST possible viewport (as if the keyboard/toolbar were hidden), so a dialog sized
    // against it can be taller than what's actually visible once the keyboard opens — pushing
    // its own sticky footer (Cancel/Next/Save actions) below the real, tappable screen area.
    // 100dvh tracks the actual visible viewport and shrinks with it.
    maxHeight: `calc(100dvh - ${NATIVE_BOTTOM_NAV_INSET})`,
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
