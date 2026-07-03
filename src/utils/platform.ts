import { Capacitor } from "@capacitor/core";

const MOBILE_NATIVE_PLATFORMS = new Set(["ios", "android"]);

/**
 * TEST-ONLY seam. When running the dev build (e.g. under Playwright), setting
 * `window.__FORCE_NATIVE_OFFLINE__ = true` makes the app take its native,
 * offline-first code paths while Capacitor itself stays on `web` — so the
 * official plugins (@capacitor/filesystem, @capacitor/network, …) transparently
 * use their web implementations. This is compiled out of production builds
 * because it is guarded by `import.meta.env.DEV` (false in `vite build`).
 */
function isForcedNativeForTests(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    (window as unknown as { __FORCE_NATIVE_OFFLINE__?: boolean }).__FORCE_NATIVE_OFFLINE__ === true
  );
}

export function isMobileNativePlatform(): boolean {
  if (isForcedNativeForTests()) return true;
  return Capacitor.isNativePlatform() && MOBILE_NATIVE_PLATFORMS.has(Capacitor.getPlatform());
}

export function isDesktopLikePlatform(): boolean {
  return !isMobileNativePlatform();
}

export function isNativeDesktopPlatform(): boolean {
  return Capacitor.isNativePlatform() && !isMobileNativePlatform();
}
