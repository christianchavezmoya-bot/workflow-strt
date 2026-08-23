/**
 * useSseEvents — connects to the server's SSE endpoint and translates
 * push events into DOM custom events that existing page listeners already handle.
 *
 * Events dispatched:
 *   "sse:assets:updated"   — detail: { productId?, projectId? }
 *   "sse:projects:updated" — detail: { projectId? }
 *   "sse:fault-reports:updated" — detail: { id, referenceCode, status, severity, createdAtUtc }
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
import { probePendingConflictsFromSse } from "../services/syncConflictProbe";
import { isMobileNativePlatform } from "../utils/platform";
import { scheduleBootstrapAfterUploadDrain } from "../utils/bootstrapAfterDrain";
import { markServerDataChanged } from "../utils/bootstrapFreshness";
import { prefetchAssignedAssetsInProject, prefetchAssetIds } from "../services/assetPrefetchService";
import { ProjectRepository } from "../repositories/ProjectRepository";
import type { User } from "../types/user";

const BASE_RETRY_MS = 3_000;
const MAX_RETRY_MS  = 30_000;
const SSE_PREFETCH_DEBOUNCE_MS = 3_000;

function currentUserId(): string | null {
  try {
    const raw = secureGet("auth_user");
    if (!raw) return null;
    return (JSON.parse(raw) as User)?.id ?? null;
  } catch {
    return null;
  }
}

export function useSseEvents() {
  const esRef        = useRef<EventSource | null>(null);
  const retryRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount   = useRef(0);
  const activeRef    = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    const clearPrefetchDebounce = () => {
      if (prefetchRef.current) {
        clearTimeout(prefetchRef.current);
        prefetchRef.current = null;
      }
    };

    const onAssetsUpdatedFromServer = (detail: Record<string, unknown>) => {
      window.dispatchEvent(new Event("notifications:refresh"));
      if (!isMobileNativePlatform()) return;

      void markServerDataChanged();

      const projectId = typeof detail.projectId === "string" ? detail.projectId : undefined;
      const assetId = typeof detail.assetId === "string" ? detail.assetId : undefined;
      const userId = currentUserId();
      clearPrefetchDebounce();
      prefetchRef.current = setTimeout(() => {
        prefetchRef.current = null;
        if (assetId) {
          void prefetchAssetIds([assetId]);
        } else if (projectId && userId) {
          void prefetchAssignedAssetsInProject(projectId, userId);
        } else {
          scheduleBootstrapAfterUploadDrain("assigned", SSE_PREFETCH_DEBOUNCE_MS, false, "sse-fallback");
        }
      }, SSE_PREFETCH_DEBOUNCE_MS);
    };

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
            invalidateWebCacheByPrefix("/dashboard/");
            window.dispatchEvent(new Event("notifications:run-state-changed"));
          }
          window.dispatchEvent(new CustomEvent("sse:assets:updated", { detail }));
          onAssetsUpdatedFromServer(detail);
          void probePendingConflictsFromSse({
            productId: typeof detail.productId === "string" ? detail.productId : undefined,
            projectId: typeof detail.projectId === "string" ? detail.projectId : undefined,
          });
        } catch { /* malformed JSON — ignore */ }
      });

      es.addEventListener("projects:updated", (e: MessageEvent) => {
        try {
          const detail = JSON.parse((e as MessageEvent).data as string) as Record<string, unknown>;
          if (!isMobileNativePlatform()) {
            invalidateWebCacheByPrefix("/projects");
          }
          window.dispatchEvent(new CustomEvent("sse:projects:updated", { detail }));
          if (isMobileNativePlatform()) {
            void markServerDataChanged();
            void ProjectRepository.syncCatalogFromServer().then(async () => {
              const projectId = typeof detail.projectId === "string" ? detail.projectId : undefined;
              const userId = currentUserId();
              if (projectId && userId) {
                await prefetchAssignedAssetsInProject(projectId, userId);
              }
            });
          }
        } catch { /* malformed JSON — ignore */ }
      });

      es.addEventListener("fault-reports:updated", (e: MessageEvent) => {
        try {
          const detail = JSON.parse((e as MessageEvent).data as string) as Record<string, unknown>;
          window.dispatchEvent(new Event("notifications:refresh"));
          window.dispatchEvent(new CustomEvent("sse:fault-reports:updated", { detail }));
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

    const onRepoAssetsUpdated = (e: Event) => {
      if (!isMobileNativePlatform()) return;
      const detail = (e as CustomEvent<{ assetId?: string; projectId?: string }>).detail ?? {};
      const assetId = typeof detail.assetId === "string" ? detail.assetId : undefined;
      if (!assetId) return;
      void markServerDataChanged();
      clearPrefetchDebounce();
      prefetchRef.current = setTimeout(() => {
        prefetchRef.current = null;
        void prefetchAssetIds([assetId]);
      }, SSE_PREFETCH_DEBOUNCE_MS);
    };

    window.addEventListener("repo:assets:updated", onRepoAssetsUpdated as EventListener);

    // Pause reconnects while offline or backgrounded; resume when active again
    const handleOffline = () => clearRetry();
    const handleOnline  = () => {
      retryCount.current = 0;
      connect();
    };
    const handleBackground = () => close();
    const handleForeground = () => {
      retryCount.current = 0;
      connect();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online",  handleOnline);
    window.addEventListener("app-backgrounded", handleBackground);
    window.addEventListener("app-foregrounded", handleForeground);

    connect();

    return () => {
      activeRef.current = false;
      clearPrefetchDebounce();
      close();
      window.removeEventListener("repo:assets:updated", onRepoAssetsUpdated as EventListener);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("app-backgrounded", handleBackground);
      window.removeEventListener("app-foregrounded", handleForeground);
    };
  }, []); // mount once — token and URL are read on every connect() call
}
