import { useMediaQuery } from "@mui/material";
import { isMobileNativePlatform } from "../utils/platform";

/** Matches shell nav breakpoint in index.css (768px). */
export const MOBILE_WEB_LAYOUT_QUERY = "(max-width: 768px)";

/** Phone browser over HTTP/HTTPS — not the Capacitor native app. */
export function useMobileWebLayout(): boolean {
  const narrow = useMediaQuery(MOBILE_WEB_LAYOUT_QUERY);
  return narrow && !isMobileNativePlatform();
}
