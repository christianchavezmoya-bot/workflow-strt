import { Capacitor } from "@capacitor/core";

const MOBILE_NATIVE_PLATFORMS = new Set(["ios", "android"]);

export function isMobileNativePlatform(): boolean {
  return Capacitor.isNativePlatform() && MOBILE_NATIVE_PLATFORMS.has(Capacitor.getPlatform());
}

export function isDesktopLikePlatform(): boolean {
  return !isMobileNativePlatform();
}

export function isNativeDesktopPlatform(): boolean {
  return Capacitor.isNativePlatform() && !isMobileNativePlatform();
}

/**
 * Use pdf.js canvas rendering instead of a blob iframe. Mobile browsers (including
 * customer signature links opened on a phone) cannot scroll multi-page PDFs inside
 * embedded iframes reliably; Capacitor native has the same limitation.
 */
export function shouldUsePdfJsPreview(): boolean {
  if (isMobileNativePlatform()) return true;
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const narrowViewport = window.matchMedia("(max-width: 900px)").matches;
  return coarsePointer && narrowViewport;
}
