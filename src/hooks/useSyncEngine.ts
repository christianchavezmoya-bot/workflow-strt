/**
 * useSyncEngine — global offline sync hook.
 *
 * - Tracks online/offline state
 * - Queues write actions when offline (or when the request fails)
 * - Flushes the queue automatically when connection returns
 * - Flushes on page visibility (phone unlock / tab switch)
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
  pendingMarkError,
  pendingRemove,
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
  const [isOnline,     setIsOnline]     = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncing,      setSyncing]      = useState(false);
  const [pending,      setPending]      = useState(0);
  const [lastSyncAt,   setLastSyncAt]   = useState<Date | null>(null);
  const [hasError,     setHasError]     = useState(false);

  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  // Refresh badge count from IndexedDB
  const refreshPending = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  // ── Flush queue ────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    if (_flushing || !isOnlineRef.current) return;
    const queue = await pendingGetAll();
    if (queue.length === 0) return;

    _flushing = true;
    setSyncing(true);
    setHasError(false);

    let anyError = false;

    for (const action of queue) {
      try {
        await api.request({
          url: action.url,
          method: action.method,
          data: action.body,
        });
        await pendingRemove(action.id);
        await syncMetaSet(action.entityType);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await pendingMarkError(action.id, msg);
        anyError = true;
        // Don't break — try remaining actions in queue
      }
    }

    await refreshPending();
    setHasError(anyError);
    setSyncing(false);
    setLastSyncAt(new Date());
    _flushing = false;
  }, [refreshPending]);

  // ── Online / offline events ────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline  = () => { setIsOnline(true);  void flush(); };
    const handleOffline = () => { setIsOnline(false); };
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
    const action: Omit<PendingAction, "retries"> = {
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

  // Track server reachability based on actual API responses — not navigator.onLine
  // which is unreliable in iOS WKWebView (always reports true).
  // api-serving-cache  → server unreachable, fallback to IndexedDB
  // api-server-reachable → real server response received
  const [serverUnreachable, setServerUnreachable] = useState(false);
  useEffect(() => {
    const handleUnreachable = () => setServerUnreachable(true);
    const handleReachable   = () => { setServerUnreachable(false); void flush(); };
    window.addEventListener("api-serving-cache",   handleUnreachable);
    window.addEventListener("api-server-reachable", handleReachable);
    return () => {
      window.removeEventListener("api-serving-cache",   handleUnreachable);
      window.removeEventListener("api-server-reachable", handleReachable);
    };
  }, [flush]);

  // ── Derived status ────────────────────────────────────────────────────────
  const status: SyncStatus =
    serverUnreachable ? "offline"  :
    syncing           ? "syncing"  :
    hasError          ? "error"    :
    pending > 0       ? "pending"  :
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
