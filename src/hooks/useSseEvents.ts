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
 *   - Mints a short-lived opaque SSE ticket (POST /api/sse/ticket) before each connect
 *   - Reconnects automatically after any error (with exponential backoff, max 30 s)
 *   - Stops reconnecting while offline, resumes when online
 *   - Stops reconnecting on 401 (logged out / revoked session)
 *   - Cleans up on unmount
 */

import { useEffect, useRef } from "react";
import axios from "axios";
import api from "../services/api";
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

function ticketRetryDelayMs(retryAfterHeader: string | undefined, retryCount: number): number {
  if (retryAfterHeader) {
    const parsed = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed * 1000;
    }
  }
  return Math.min(BASE_RETRY_MS * 2 ** retryCount, MAX_RETRY_MS);
}

export function useSseEvents() {
  const esRef        = useRef<EventSource | null>(null);
  const retryRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount   = useRef(0);
  const activeRef    = useRef(true);
  const connectGen   = useRef(0);

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

    const scheduleReconnect = (delayMs: number) => {
      if (!activeRef.current) return;
      clearRetry();
      retryRef.current = setTimeout(() => {
        retryRef.current = null;
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      if (!activeRef.current) return;

      const token = secureGet("auth_token");
      if (!token || token === "local") return;

      close();

      const generation = ++connectGen.current;

      let ticket: string;
      try {
        const res = await api.post<{ ticket: string; expiresInSeconds: number }>("/sse/ticket");
        ticket = res.data.ticket;
      } catch (err) {
        if (!activeRef.current || generation !== connectGen.current) return;

        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          if (status === 401) return;

          if (status === 429) {
            const delay = ticketRetryDelayMs(err.response?.headers["retry-after"] as string | undefined, retryCount.current);
            retryCount.current += 1;
            scheduleReconnect(delay);
            return;
          }
        }

        const delay = Math.min(BASE_RETRY_MS * 2 ** retryCount.current, MAX_RETRY_MS);
        retryCount.current += 1;
        scheduleReconnect(delay);
        return;
      }

      if (!activeRef.current || generation !== connectGen.current) return;

      const base = getApiBaseUrl().replace(/\/api$/i, "");
      const url  = `${base}/api/sse/events?ticket=${encodeURIComponent(ticket)}`;

      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("connected", () => {
        retryCount.current = 0;
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

      es.addEventListener("heartbeat", () => {});

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!activeRef.current) return;

        const delay = Math.min(BASE_RETRY_MS * 2 ** retryCount.current, MAX_RETRY_MS);
        retryCount.current += 1;
        scheduleReconnect(delay);
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

    const handleOffline = () => clearRetry();
    const handleOnline  = () => {
      retryCount.current = 0;
      void connect();
    };
    const handleBackground = () => close();
    const handleForeground = () => {
      retryCount.current = 0;
      void connect();
    };
    const handleDisconnect = () => {
      connectGen.current += 1;
      close();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online",  handleOnline);
    window.addEventListener("app-backgrounded", handleBackground);
    window.addEventListener("app-foregrounded", handleForeground);
    window.addEventListener("sse:disconnect", handleDisconnect);

    void connect();

    return () => {
      activeRef.current = false;
      connectGen.current += 1;
      clearPrefetchDebounce();
      close();
      window.removeEventListener("repo:assets:updated", onRepoAssetsUpdated as EventListener);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("app-backgrounded", handleBackground);
      window.removeEventListener("app-foregrounded", handleForeground);
      window.removeEventListener("sse:disconnect", handleDisconnect);
    };
  }, []);
}
