/**
 * useSseEvents — connects to the server's SSE endpoint and translates
 * push events into DOM custom events that existing page listeners already handle.
 *
 * Events dispatched:
 *   "sse:assets:updated"  — detail: { productId?, projectId? }
 *
 * The hook is safe to mount at the app-shell level. It:
 *   - Does nothing if no auth token is present (not logged in)
 *   - Reconnects automatically after any error (with exponential backoff, max 30 s)
 *   - Stops reconnecting while offline, resumes when online
 *   - Cleans up on unmount
 */

import { useEffect, useRef } from "react";
import { secureGet } from "../services/secureStorage";
import { getApiBaseUrl } from "../services/apiBase";
import { invalidateWebCacheByPrefix } from "../services/webFreshCache";
import { isMobileNativePlatform } from "../utils/platform";

const BASE_RETRY_MS = 3_000;
const MAX_RETRY_MS  = 30_000;

export function useSseEvents() {
  const esRef        = useRef<EventSource | null>(null);
  const retryRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount   = useRef(0);
  const activeRef    = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    const clearRetry = () => {
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    };

    const close = () => {
      clearRetry();
      esRef.current?.close();
      esRef.current = null;
    };

    const connect = () => {
      if (!activeRef.current) return;

      const token = secureGet("auth_token");
      if (!token || token === "local") return; // not logged in

      close(); // close any previous connection before opening a new one

      const base = getApiBaseUrl().replace(/\/api$/i, "");
      const url  = `${base}/api/sse/events?token=${encodeURIComponent(token)}`;

      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("connected", () => {
        retryCount.current = 0; // successful connection — reset backoff
      });

      es.addEventListener("assets:updated", (e: MessageEvent) => {
        try {
          const detail = JSON.parse((e as MessageEvent).data as string) as Record<string, unknown>;
          if (!isMobileNativePlatform()) {
            invalidateWebCacheByPrefix("/project-assets/");
            invalidateWebCacheByPrefix("/asset-workflow-runs/");
          }
          window.dispatchEvent(new CustomEvent("sse:assets:updated", { detail }));
        } catch { /* malformed JSON — ignore */ }
      });

      // heartbeat — no action needed, just keeps the socket alive
      es.addEventListener("heartbeat", () => {});

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!activeRef.current) return;

        // Exponential backoff: 3 s → 6 s → 12 s → … → 30 s
        const delay = Math.min(BASE_RETRY_MS * 2 ** retryCount.current, MAX_RETRY_MS);
        retryCount.current += 1;
        retryRef.current = setTimeout(connect, delay);
      };
    };

    // Pause reconnects while offline, resume when we come back online
    const handleOffline = () => clearRetry();
    const handleOnline  = () => {
      retryCount.current = 0;
      connect();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online",  handleOnline);

    connect();

    return () => {
      activeRef.current = false;
      close();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online",  handleOnline);
    };
  }, []); // mount once — token and URL are read on every connect() call
}
