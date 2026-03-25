/**
 * useApiCacheUpdate — calls the provided callback whenever a background
 * API refresh completes for a URL that matches the given prefix.
 *
 * Usage:
 *   useApiCacheUpdate("/project-assets", refreshAssets);
 */
import { useEffect } from "react";

export function useApiCacheUpdate(urlPrefix: string, onUpdate: () => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const { url } = (e as CustomEvent<{ url: string }>).detail;
      if (url && url.includes(urlPrefix)) onUpdate();
    };
    window.addEventListener("api-cache-updated", handler);
    return () => window.removeEventListener("api-cache-updated", handler);
  }, [urlPrefix, onUpdate]);
}
