/**
 * useSyncEngine — global offline sync hook.
 *
 * - Tracks connectivity state (online / server-unreachable / offline / token-expired)
 * - Queues write actions when offline (or when the request fails)
 * - Flushes the queue automatically when connection returns
 * - Flushes on page visibility (phone unlock / tab switch)
 * - Exponential backoff with per-record state
 * - Exposes status for the SyncStatusBadge in Topbar
 *
 * Usage:
 *   const { status, pendingCount, lastSyncAt, triggerSync, queueOrSend } = useSyncEngine();
 */

import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import {
  pendingAdd,
  pendingCount,
  pendingGetAll,
  pendingGetDue,
  pendingMarkRetry,
  pendingRemove,
  pendingSetStatus,
  syncMetaSet,
  type PendingAction,
  type PendingActionMethod,
} from "../services/localDB";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | "synced"      // all good, nothing pending
  | "pending"     // changes queued, offline or not yet flushed
  | "syncing"     // actively uploading
  | "error"       // last flush had failures
  | "offline";    // no connection

type ConnectivityState = "online" | "server-unreachable" | "offline" | "token-expired";

export interface SyncState {
  status: SyncStatus;
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  syncing: boolean;
  /** Manually trigger a sync flush */
  triggerSync: () => Promise<void>;
  /**
   * Queue or send a write operation.
   * If online: sends immediately, returns server response.
   * If offline: stores in IndexedDB queue, applies optimistic patch locally,
   * returns null (caller should already have applied the optimistic update).
   */
  queueOrSend: <T>(opts: QueueOrSendOpts) => Promise<T | null>;
}

export interface QueueOrSendOpts {
  url: string;
  method: PendingActionMethod;
  body?: unknown;
  entityType: string;
  entityId: string;
  optimisticPatch?: Record<string, unknown>;
}

// ── Singleton flush lock so multiple hook instances don't double-flush ────────
let _flushing = false;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSyncEngine(): SyncState {
  const [connectivity, setConnectivity] = useState<ConnectivityState>(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online"
  );
  const [syncing,    setSyncing]    = useState(false);
  const [pending,    setPending]    = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [hasError,   setHasError]   = useState(false);

  const connectivityRef = useRef(connectivity);
  connectivityRef.current = connectivity;

  // Refresh badge count from IndexedDB
  const refreshPending = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  // ── Schedule retry based on earliest nextRetryAt in queue ─────────────────
  // Declared as ref to avoid circular dep with flush
  const scheduleRetryRef = useRef<(() => Promise<void>) | null>(null);

  // ── Flush queue ────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    const conn = connectivityRef.current;
    if (_flushing || conn === "offline" || conn === "server-unreachable" || conn === "token-expired") return;

    const due = await pendingGetDue();
    if (due.length === 0) {
      // Nothing due — but there may be future-scheduled items; let scheduleRetry handle them
      await scheduleRetryRef.current?.();
      return;
    }

    _flushing = true;
    setSyncing(true);
    setHasError(false);

    let anyError = false;

    for (const action of due) {
      try {
        await pendingSetStatus(action.id, "uploading");
        await api.request({
          url: action.url,
          method: action.method,
          data: action.body,
        });
        await pendingRemove(action.id);
        await syncMetaSet(action.entityType);
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } }).response?.status;
        // 4xx (except 429 rate-limit): the action will never succeed — entity was deleted,
        // modified by another device, or the request was malformed. Drop it rather than retry.
        if (status && status !== 429 && status >= 400 && status < 500) {
          await pendingRemove(action.id);
        } else {
          // 5xx, network error, or 429 — retry with backoff
          const msg = e instanceof Error ? e.message : String(e);
          await pendingMarkRetry(action.id, msg);
          anyError = true;
        }
        // Don't break — try remaining actions in queue
      }
    }

    await refreshPending();
    setHasError(anyError);
    setSyncing(false);
    setLastSyncAt(new Date());
    _flushing = false;

    // Schedule next retry if there are still items with future nextRetryAt
    await scheduleRetryRef.current?.();
  }, [refreshPending]);

  // ── Scheduled retry timer ─────────────────────────────────────────────────
  const scheduleRetry = useCallback(async () => {
    const all = await pendingGetAll();
    if (all.length === 0) return;
    const future = all
      .filter(a => a.nextRetryAt)
      .map(a => new Date(a.nextRetryAt!).getTime());
    if (future.length === 0) return;
    const nextMs = Math.max(Math.min(...future) - Date.now(), 1000);
    setTimeout(() => void flush(), Math.min(nextMs, 300_000)); // cap at 5 min
  }, [flush]);

  // Wire up the ref so flush can call scheduleRetry without circular deps
  useEffect(() => {
    scheduleRetryRef.current = scheduleRetry;
  }, [scheduleRetry]);

  // ── Online / offline events ────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline  = () => {
      setConnectivity(prev => prev === "token-expired" ? prev : "online");
      void flush();
    };
    const handleOffline = () => setConnectivity("offline");
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush]);

  // ── Visibility change (phone unlock / tab switch) ──────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void flush();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [flush]);

  // ── Listen for pending-changed events (from pendingAdd/Remove) ────────────
  useEffect(() => {
    const handler = () => void refreshPending();
    window.addEventListener("sync-pending-changed", handler);
    return () => window.removeEventListener("sync-pending-changed", handler);
  }, [refreshPending]);

  // ── Server reachability / auth error state machine ────────────────────────
  useEffect(() => {
    const handleUnreachable = () => setConnectivity("server-unreachable");
    const handleReachable   = () => {
      setConnectivity("online");
      void flush();
    };
    const handleAuthError   = () => setConnectivity("token-expired");

    window.addEventListener("api-serving-cache",    handleUnreachable);
    window.addEventListener("api-server-reachable", handleReachable);
    window.addEventListener("api-auth-error",       handleAuthError);
    return () => {
      window.removeEventListener("api-serving-cache",    handleUnreachable);
      window.removeEventListener("api-server-reachable", handleReachable);
      window.removeEventListener("api-auth-error",       handleAuthError);
    };
  }, [flush]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    void refreshPending();
    if (navigator.onLine) void flush();
  }, [flush, refreshPending]);

  // ── queueOrSend ───────────────────────────────────────────────────────────
  const queueOrSend = useCallback(async <T>(opts: QueueOrSendOpts): Promise<T | null> => {
    const { url, method, body, entityType, entityId, optimisticPatch = {} } = opts;

    if (navigator.onLine) {
      try {
        const res = await api.request<T>({ url, method, data: body });
        setLastSyncAt(new Date());
        await syncMetaSet(entityType);
        return res.data;
      } catch {
        // Network error despite onLine flag — fall through to queue
      }
    }

    // Offline path: store in IndexedDB and signal optimistic update
    const action: Omit<PendingAction, "retries" | "status"> = {
      id: crypto.randomUUID(),
      url,
      method,
      body,
      entityType,
      entityId,
      optimisticPatch,
      createdAt: new Date().toISOString(),
    };
    await pendingAdd(action);
    await refreshPending();
    return null;
  }, [refreshPending]);

  // ── Derived status ────────────────────────────────────────────────────────
  const isOnline = connectivity !== "offline";

  const status: SyncStatus =
    connectivity === "offline" || connectivity === "server-unreachable" ? "offline" :
    connectivity === "token-expired" ? "error" :
    syncing    ? "syncing"  :
    hasError   ? "error"    :
    pending > 0 ? "pending"  :
                  "synced";

  return {
    status,
    isOnline,
    pendingCount: pending,
    lastSyncAt,
    syncing,
    triggerSync: flush,
    queueOrSend,
  };
}
