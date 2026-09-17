import { useEffect, useState } from "react";
import { isMobileNativePlatform } from "../utils/platform";

/** Below this shrink (px) from the tallest viewport seen, we don't call it a keyboard. */
const KEYBOARD_HEIGHT_THRESHOLD = 150;

/**
 * True while the on-screen keyboard is covering a meaningful portion of the viewport, on native
 * only (always false on web/desktop — a real hardware-keyboard user never has this problem, and
 * `visualViewport` shrinks for other reasons like Chrome's own dev tools that we don't want to
 * treat as "keyboard open"). Uses `visualViewport`'s resize event rather than a Capacitor
 * Keyboard plugin: `android:windowSoftInputMode="adjustResize"` (see AndroidManifest.xml) already
 * makes the WebView's own viewport shrink when the keyboard opens, so the height delta itself is
 * a reliable, plugin-free signal — no need to add a new native dependency for this.
 *
 * Tracks the tallest viewport height seen (not a value fixed at mount) so this keeps working
 * correctly across orientation changes and split-screen/resizable-window transitions.
 */
export function useIsKeyboardOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    const vv = window.visualViewport;
    if (!vv) return;

    let tallestSeen = vv.height;

    function handleResize() {
      if (!vv) return;
      tallestSeen = Math.max(tallestSeen, vv.height);
      setIsOpen(tallestSeen - vv.height > KEYBOARD_HEIGHT_THRESHOLD);
    }

    vv.addEventListener("resize", handleResize);
    handleResize();
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  return isOpen;
}
