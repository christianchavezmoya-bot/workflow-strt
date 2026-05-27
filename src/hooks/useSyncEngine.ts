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
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import api from "../services/api";
import {
  entityGetAsset,
  entityPutAsset,
  pendingAdd,
  pendingCount,
  pendingGetByEntityId,
  pendingGetAll,
  pendingGetDue,
  pendingMarkRetry,
  pendingRemove,
  pendingSetStatus,
  syncMetaSet,
  type PendingAction,
  type PendingActionMethod,
} from "../services/localDB";
import offlineStore, { type OfflineRun } from "../services/offlineStore";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import type { SignatureEvent } from "../types/signature";
import { mediaStore } from "../services/mediaStore";
import syncQueue from "../services/syncQueue";

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

function isNetworkLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return !navigator.onLine;
  const candidate = error as { response?: unknown; code?: string; message?: string };
  if (candidate.response) return false;
  return (
    !navigator.onLine ||
    candidate.code === "ECONNABORTED" ||
    candidate.code === "ERR_NETWORK" ||
    candidate.message === "Network Error"
  );
}

async function markRunSyncedFromServer(run: AssetWorkflowRun, fallbackRunId: string): Promise<void> {
  const cachedRun = await offlineStore.getRun(fallbackRunId);
  const assetRecord = await entityGetAsset(run.assetId);
  const projectId = cachedRun?.projectId ?? assetRecord?.projectId ?? "";
  const syncedRun: OfflineRun = {
    ...run,
    projectId,
    serverRunId: run.id,
    localRunId: cachedRun?.localRunId ?? run.id,
    localStatus: "Synced",
    lastLocalSavedAt: new Date().toISOString(),
    dirty: false,
    syncError: undefined,
  };
  await offlineStore.saveRun(syncedRun);
}

function remapRunIdInUrl(url: string, oldRunId: string, newRunId: string): string {
  return url.split(oldRunId).join(newRunId);
}

async function processRunCreateAction(action: PendingAction, responseData: unknown): Promise<void> {
  if (!responseData || typeof responseData !== "object") return;
  const serverRun = responseData as AssetWorkflowRun;
  const localRun = await offlineStore.getRun(action.entityId);
  const otherPending = (await pendingGetByEntityId(action.entityId)).filter((item: PendingAction) => item.id !== action.id);
  const hasFollowUpOps = otherPending.length > 0;

  const mergedRun: OfflineRun = {
    ...serverRun,
    projectId: localRun?.projectId ?? (await entityGetAsset(serverRun.assetId))?.projectId ?? "",
    localRunId: localRun?.localRunId ?? action.entityId,
    serverRunId: serverRun.id,
    stepResultsJson: localRun?.stepResultsJson ?? serverRun.stepResultsJson,
    issuesJson: localRun?.issuesJson ?? serverRun.issuesJson,
    timeTrackingJson: localRun?.timeTrackingJson ?? serverRun.timeTrackingJson,
    productiveSeconds: localRun?.productiveSeconds ?? serverRun.productiveSeconds,
    downtimeSeconds: localRun?.downtimeSeconds ?? serverRun.downtimeSeconds,
    downtimeEvents: localRun?.downtimeEvents ?? serverRun.downtimeEvents,
    status: localRun?.status ?? serverRun.status,
    isLocked: localRun?.isLocked ?? serverRun.isLocked,
    completedAt: localRun?.completedAt ?? serverRun.completedAt,
    completedByName: localRun?.completedByName ?? serverRun.completedByName,
    bomActualJson: localRun?.bomActualJson ?? serverRun.bomActualJson,
    installerSignedAt: localRun?.installerSignedAt ?? serverRun.installerSignedAt,
    customerSignedAt: localRun?.customerSignedAt ?? serverRun.customerSignedAt,
    signatureStatus: localRun?.signatureStatus ?? serverRun.signatureStatus,
    localStatus: hasFollowUpOps ? "PendingSync" : "Synced",
    lastLocalSavedAt: localRun?.lastLocalSavedAt ?? new Date().toISOString(),
    dirty: hasFollowUpOps,
    syncError: undefined,
  };

  await offlineStore.saveIdMapping("workflow-run", action.entityId, serverRun.id);
  await offlineStore.saveRun(mergedRun);
  if (action.entityId !== serverRun.id) {
    await syncQueue.replaceRunIdReferences(action.entityId, serverRun.id);
    await offlineStore.deleteRun(action.entityId);
  }
}

async function markRunSyncFailed(runId: string, error: string): Promise<void> {
  const cachedRun = await offlineStore.getRun(runId);
  if (!cachedRun) return;
  await offlineStore.saveRun({
    ...cachedRun,
    localStatus: "FailedSync",
    dirty: true,
    syncError: error,
    lastLocalSavedAt: cachedRun.lastLocalSavedAt ?? new Date().toISOString(),
  });
}

async function markRunSyncing(runId: string): Promise<void> {
  const cachedRun = await offlineStore.getRun(runId);
  if (!cachedRun) return;
  await offlineStore.saveRun({
    ...cachedRun,
    localStatus: "Syncing",
    dirty: true,
    syncError: undefined,
    lastLocalSavedAt: cachedRun.lastLocalSavedAt ?? new Date().toISOString(),
  });
}

async function markAssetSyncedFromServer(asset: ProjectAsset): Promise<void> {
  await entityPutAsset({
    id: asset.id,
    productId: asset.productId,
    projectId: asset.projectId,
    data: asset,
    dirty: false,
  });
}

async function processSyncedAction(action: PendingAction, responseData: unknown): Promise<void> {
  if (action.opType === "RUN_CREATE") {
    await processRunCreateAction(action, responseData);
    return;
  }

  if (action.opType === "SIGNATURE_SUBMIT") {
    const cachedRun = await offlineStore.getRun(action.entityId);
    const signature = responseData as SignatureEvent | undefined;
    const payload = action.body as { signerRole?: "Installer" | "Customer" } | undefined;
    if (cachedRun && payload?.signerRole) {
      const signedAt = signature?.signedAtUtc ?? new Date().toISOString();
      await offlineStore.saveRun({
        ...cachedRun,
        installerSignedAt: payload.signerRole === "Installer" ? signedAt : cachedRun.installerSignedAt,
        customerSignedAt: payload.signerRole === "Customer" ? signedAt : cachedRun.customerSignedAt,
        signatureStatus: payload.signerRole === "Customer" ? "Signed" : (cachedRun.customerSignedAt ? "Signed" : "PendingCustomer"),
        localStatus: "Synced",
        dirty: false,
        syncError: undefined,
        lastLocalSavedAt: signedAt,
      });
    }
    return;
  }

  if (action.entityType === "workflow-run" && responseData && typeof responseData === "object") {
    await markRunSyncedFromServer(responseData as AssetWorkflowRun, action.entityId);
    return;
  }

  if (action.entityType === "asset" && responseData && typeof responseData === "object") {
    await markAssetSyncedFromServer(responseData as ProjectAsset);
  }
}

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
        if (action.entityType === "workflow-run") {
          await markRunSyncing(action.entityId);
        }
        const mappedRunId = action.entityType === "workflow-run"
          ? await offlineStore.getMappedId("workflow-run", action.entityId)
          : null;
        const requestUrl = mappedRunId
          ? remapRunIdInUrl(action.url, action.entityId, mappedRunId)
          : action.url;
        const requestData = await mediaStore.resolveUploadPayload(action.body);
        const response = await api.request({
          url: requestUrl,
          method: action.method,
          data: requestData,
        });
        await processSyncedAction(action, response.data);
        await pendingRemove(action.id);
        await syncMetaSet(action.entityType);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await pendingMarkRetry(action.id, msg);
        if (action.entityType === "workflow-run") {
          await markRunSyncFailed(action.entityId, msg);
        }
        anyError = true;
        if (isNetworkLikeError(e)) {
          setConnectivity(navigator.onLine ? "server-unreachable" : "offline");
          break;
        }
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

  // Native mobile connectivity events are more reliable than window online/offline.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let remove: (() => void) | undefined;

    void Network.addListener("networkStatusChange", (status) => {
      if (!active) return;
      if (status.connected) {
        setConnectivity((prev) => prev === "token-expired" ? prev : "online");
        void flush();
      } else {
        setConnectivity("offline");
      }
    }).then((listener) => {
      remove = () => { void listener.remove(); };
    });

    return () => {
      active = false;
      remove?.();
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
        const requestBody = await mediaStore.resolveUploadPayload(body);
        const res = await api.request<T>({ url, method, data: requestBody });
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
