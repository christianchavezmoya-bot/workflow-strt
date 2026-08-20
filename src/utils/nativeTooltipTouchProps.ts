import { isMobileNativePlatform } from "./platform";

/** MUI Tooltip props that avoid swallowing the first tap on iOS/Android WebView. */
export function nativeTooltipTouchProps(): {
  disableTouchListener?: boolean;
  enterTouchDelay?: number;
} {
  return isMobileNativePlatform()
    ? { disableTouchListener: true, enterTouchDelay: 0 }
    : {};
}
