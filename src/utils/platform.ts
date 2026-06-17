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
