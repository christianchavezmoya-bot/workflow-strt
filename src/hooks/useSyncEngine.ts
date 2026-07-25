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
import { Network } from "@capacitor/network";
import { App } from "@capacitor/app";
import api from "../services/api";
import {
  entityGetAllIssues,
  entityGetAsset,
  entityPutAsset,
  entityReplaceAllIssues,
  entityReplaceIssuesForAsset,
  pendingCount,
  pendingGetByEntityId,
  pendingGetAll,
  pendingGetDue,
  pendingMarkRetry,
  pendingMarkConflict,
  pendingClearConflict,
  pendingGetConflicted,
  pendingRemove,
  pendingResetRetrySchedule,
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
import syncQueue, { type SyncOpType } from "../services/syncQueue";
import { revertLocalEntityForConflict } from "../services/syncConflictProbe";
import {
  removeCachedLinkById,
  replaceCachedLink,
  type AssetDocumentLink,
  type AssetDocumentLinkUploadBody,
} from "../services/assetDocumentLinkService";
import { isMobileNativePlatform } from "../utils/platform";
import type { OpenIssueRecord } from "../services/assetWorkflowRunService";
import { deriveOpenIssuesFromAsset } from "../utils/issueDerivation";
import {
  subscribeServerReachable,
  pingNow,
  getNativeNetworkConnected,
  getServerReachable,
  shouldSkipBlockingFetch,
} from "../services/connectivityMonitor";
import {
  buildSyncAttemptDiagnostics,
  measurePayload,
} from "../utils/syncDiagnostics";
import { isOfflineNetworkError } from "../utils/offlineNetworkError";
import { markOfflinePerf } from "../utils/offlinePerf";
import { getSyncOpTimeoutMs } from "../utils/syncPolicy";
import {
  fromWorkInstructionDto,
  removeLocalWorkInstruction,
  replaceLocalWorkInstructionId,
  saveLocalWorkInstruction,
} from "../services/workInstructionService";
import { WorkflowAssignmentRepository } from "../repositories/WorkflowAssignmentRepository";
import type { WorkflowAssignment } from "../types/workflowType";
import type { WorkInstruction } from "../types/workInstruction";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | "synced"      // all good, nothing pending
  | "pending"     // changes queued, offline or not yet flushed
  | "syncing"     // actively uploading
  | "error"       // last flush had failures
  | "offline";    // no connection

export type ConnectivityState = "online" | "server-unreachable" | "offline" | "token-expired";

export interface SyncState {
  status: SyncStatus;
  isOnline: boolean;
  connectivity: ConnectivityState;
  /**
   * True/false fact: was the last background ping to the server's /health
   * endpoint successful? Unlike `connectivity`, this is not inferred from
   * side effects of other requests — it comes from a dedicated periodic
   * check (see services/connectivityMonitor.ts) that runs independently of
   * which screen is open, so it stays accurate even on screens that never
   * happen to make a request that could fail. Starts `true` optimistically
   * until the first check completes, to avoid a flash of "not reachable"
   * on a fresh app launch.
   */
  serverReachable: boolean;
  pendingCount: number;
  conflictCount: number;
  lastSyncAt: Date | null;
  syncing: boolean;
  /** Manually trigger a sync flush */
  triggerSync: () => Promise<void>;
  /** Force-proceed a conflicted action (overwrite server version). */
  resolveConflictKeep: (actionId: string) => Promise<void>;
  /** Discard a conflicted action (accept server version). */
  resolveConflictDiscard: (actionId: string) => Promise<void>;
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
  opType: SyncOpType;
}

function extractServerErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string } } }).response?.data;
  if (typeof data?.message === "string" && data.message.trim()) return data.message;
  return fallback;
}

async function reconnectAndFlush(): Promise<void> {
  await pendingResetRetrySchedule();
  void flushRef.current?.();
}

const flushRef = { current: null as (() => Promise<void>) | null };

// ── Singleton flush lock so multiple hook instances don't double-flush ────────
let _flushing = false;

function hasNetworkSignal(): boolean {
  if (isMobileNativePlatform()) {
    return getNativeNetworkConnected() !== false;
  }
  return typeof navigator === "undefined" || navigator.onLine;
}

function isNetworkLikeError(error: unknown): boolean {
  if (!hasNetworkSignal()) return true;
  return isOfflineNetworkError(error);
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
  // Refresh the display after a created run syncs (mergeById preserves siblings).
  window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
    detail: { assetId: mergedRun.assetId, runs: [mergedRun], mergeById: true },
  }));
}

async function processWorkInstructionCreateAction(action: PendingAction, responseData: unknown): Promise<void> {
  if (!responseData || typeof responseData !== "object") return;
  const serverInstruction = fromWorkInstructionDto(responseData as {
    id: string;
    productId: string;
    title: string;
    summary?: string | null;
    stepsJson: string;
    status: string;
    featureValuesJson: string;
    createdAt: string;
    updatedAt: string;
  });
  const otherPending = (await pendingGetByEntityId(action.entityId)).filter((item: PendingAction) => item.id !== action.id);
  const reconciled: WorkInstruction = {
    ...serverInstruction,
    dirty: otherPending.length > 0,
    syncError: undefined,
  };

  await offlineStore.saveIdMapping("work-instruction", action.entityId, serverInstruction.id);
  if (action.entityId !== serverInstruction.id) {
    await syncQueue.replaceEntityReferences(action.entityId, serverInstruction.id);
    replaceLocalWorkInstructionId(action.entityId, reconciled);
    return;
  }

  saveLocalWorkInstruction(reconciled);
}

async function processWorkInstructionUpdateAction(action: PendingAction, responseData: unknown): Promise<void> {
  if (!responseData || typeof responseData !== "object") return;
  const serverInstruction = fromWorkInstructionDto(responseData as {
    id: string;
    productId: string;
    title: string;
    summary?: string | null;
    stepsJson: string;
    status: string;
    featureValuesJson: string;
    createdAt: string;
    updatedAt: string;
  });
  const otherPending = (await pendingGetByEntityId(action.entityId)).filter((item: PendingAction) => item.id !== action.id);
  saveLocalWorkInstruction({
    ...serverInstruction,
    dirty: otherPending.length > 0,
    syncError: undefined,
  });
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

async function refreshAssetAfterRunSync(assetId: string): Promise<void> {
  try {
    const assetRes = await api.get<ProjectAsset>(`/project-assets/${assetId}`);
    await markAssetSyncedFromServer(assetRes.data);
    window.dispatchEvent(new CustomEvent("repo:assets:updated", {
      detail: {
        assetId: assetRes.data.id,
        productId: assetRes.data.productId,
        projectId: assetRes.data.projectId,
      },
    }));
  } catch {
    // Non-fatal - keep the run update even if the asset refetch fails.
  }
}

async function refreshOpenIssuesCacheFromServer(): Promise<void> {
  if (!isMobileNativePlatform() || shouldSkipBlockingFetch()) return;
  try {
    const res = await api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues");
    const local = await entityGetAllIssues();
    const localSnapshot = local as OpenIssueRecord[];
    if (localSnapshot.length === res.data.length
      && res.data.every((issue) => localSnapshot.some((prev) => prev.issueId === issue.issueId))) {
      return;
    }
    await entityReplaceAllIssues(
      res.data.map((issue) => ({
        id: issue.issueId,
        assetId: issue.assetId,
        projectId: issue.projectId,
        data: issue,
      })),
    );
    window.dispatchEvent(new Event("repo:issues:updated"));
  } catch {
    // Non-fatal — Dashboard will refresh on the next IssueRepository background fetch.
  }
}

async function processSyncedAction(action: PendingAction, responseData: unknown): Promise<void> {
  if (action.opType === "ASSET_DOCUMENT_LINK_ATTACH" || action.opType === "ASSET_DOCUMENT_LINK_UPLOAD") {
    const syncedLink = responseData as AssetDocumentLink | undefined;
    const assetId = (action.body as { assetId?: string } | undefined)?.assetId ?? syncedLink?.assetId;
    if (syncedLink && assetId) {
      await replaceCachedLink(assetId, action.entityId, syncedLink);
    }
    return;
  }

  if (action.opType === "ASSET_DOCUMENT_LINK_DETACH") {
    const assetId = (action.body as { assetId?: string } | undefined)?.assetId;
    if (assetId) {
      await removeCachedLinkById(assetId, action.entityId);
    }
    return;
  }

  if (action.opType === "RUN_CREATE") {
    await processRunCreateAction(action, responseData);
    return;
  }

  if (action.opType === "WORK_INSTRUCTION_CREATE") {
    await processWorkInstructionCreateAction(action, responseData);
    return;
  }

  if (action.opType === "WORK_INSTRUCTION_UPDATE") {
    await processWorkInstructionUpdateAction(action, responseData);
    return;
  }

  if (action.opType === "WORK_INSTRUCTION_DELETE") {
    removeLocalWorkInstruction(action.entityId);
    return;
  }

  if (action.opType === "WORKFLOW_ASSIGNMENT_CREATE") {
    const synced = responseData as WorkflowAssignment | undefined;
    const body = action.body as { assetId?: string } | undefined;
    const assetId = body?.assetId ?? synced?.assetId;
    if (synced?.id && assetId) {
      const current = await WorkflowAssignmentRepository.getLocalByAsset(assetId);
      await WorkflowAssignmentRepository.replaceByAsset(assetId, [
        ...current.filter((a) => a.id !== action.entityId && a.id !== synced.id),
        synced,
      ]);
      await syncQueue.replaceEntityId(action.entityId, synced.id);
      window.dispatchEvent(new CustomEvent("repo:assignments:updated", { detail: { assetId } }));
    }
    return;
  }

  if (action.opType === "WORKFLOW_ASSIGNMENT_DELETE") {
    const assetId = (action.body as { assetId?: string } | undefined)?.assetId;
    if (assetId) {
      window.dispatchEvent(new CustomEvent("repo:assignments:updated", { detail: { assetId } }));
    }
    return;
  }

  if (action.opType === "SIGNATURE_SUBMIT") {
    const cachedRun = await offlineStore.getRun(action.entityId);
    const signature = responseData as SignatureEvent | undefined;
    const payload = action.body as { signerRole?: "Installer" | "Customer" } | undefined;
    if (cachedRun && payload?.signerRole) {
      const signedAt = signature?.signedAtUtc ?? new Date().toISOString();
      const syncedSignedRun = {
        ...cachedRun,
        installerSignedAt: payload.signerRole === "Installer" ? signedAt : cachedRun.installerSignedAt,
        customerSignedAt: payload.signerRole === "Customer" ? signedAt : cachedRun.customerSignedAt,
        signatureStatus: payload.signerRole === "Customer" ? "Signed" : (cachedRun.customerSignedAt ? "Signed" : "PendingCustomer"),
        localStatus: "Synced" as const,
        dirty: false,
        syncError: undefined,
        lastLocalSavedAt: signedAt,
      };
      await offlineStore.saveRun(syncedSignedRun);
      await refreshAssetAfterRunSync(syncedSignedRun.assetId);
      // Refresh the display after a signature syncs (mergeById preserves siblings).
      window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
        detail: { assetId: syncedSignedRun.assetId, runs: [syncedSignedRun], mergeById: true },
      }));
    }
    return;
  }

  if (action.entityType === "workflow-run" && responseData && typeof responseData === "object") {
    const syncedRun = responseData as AssetWorkflowRun;
    await markRunSyncedFromServer(syncedRun, action.entityId);
    if (action.opType === "RUN_COMPLETE") {
      await refreshAssetAfterRunSync(syncedRun.assetId);
    }
    window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
      detail: { assetId: syncedRun.assetId, runs: [syncedRun], mergeById: true },
    }));
    return;
  }

  if (action.entityType === "asset" && responseData && typeof responseData === "object") {
    const asset = responseData as ProjectAsset;
    await markAssetSyncedFromServer(asset);
    const queuedIssues = (action.body as { issuesJson?: string } | undefined)?.issuesJson
      ?? (action.optimisticPatch as { issuesJson?: string } | undefined)?.issuesJson;
    if (queuedIssues || action.url.includes("/issues")) {
      await entityReplaceIssuesForAsset(asset.id, deriveOpenIssuesFromAsset(asset));
      window.dispatchEvent(new Event("repo:issues:updated"));
    }
    window.dispatchEvent(new CustomEvent("repo:assets:updated", {
      detail: { assetId: asset.id, productId: asset.productId, projectId: asset.projectId },
    }));
  }
}

async function buildAssetDocumentLinkUploadRequest(body: unknown): Promise<FormData> {
  const payload = body as AssetDocumentLinkUploadBody;
  const fileDataUrl = await mediaStore.resolveMediaValue(payload.fileData);
  const response = await fetch(fileDataUrl);
  const fileBlob = await response.blob();
  const form = new FormData();
  form.append("assetId", payload.assetId);
  form.append(
    "file",
    new Blob([await fileBlob.arrayBuffer()], {
      type: payload.fileType || fileBlob.type || "application/octet-stream",
    }),
    payload.fileName,
  );
  form.append("type", payload.type);
  if (payload.name) form.append("name", payload.name);
  if (payload.linkedTo) form.append("linkedTo", payload.linkedTo);
  if (payload.notes) form.append("notes", payload.notes);
  if (payload.attachedBy) form.append("attachedBy", payload.attachedBy);
  if (payload.customValuesJson) form.append("customValuesJson", payload.customValuesJson);
  return form;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSyncEngine(): SyncState {
  const [connectivity, setConnectivity] = useState<ConnectivityState>(
    hasNetworkSignal() ? "online" : "offline"
  );
  const [syncing,       setSyncing]       = useState(false);
  const [pending,       setPending]       = useState(0);
  const [conflicts,     setConflicts]     = useState(0);
  const [lastSyncAt,    setLastSyncAt]    = useState<Date | null>(null);
  const [hasError,      setHasError]      = useState(false);
  // Optimistic default of `true` avoids a flash of "server not reachable" on
  // a fresh app launch, before the singleton's first ping has had a chance
  // to complete. See services/connectivityMonitor.ts for why this lives
  // outside this hook rather than as its own timer in here.
  const [serverReachable, setServerReachable] = useState(true);

  const connectivityRef = useRef(connectivity);
  connectivityRef.current = connectivity;

  const setConnectivityState = useCallback((next: ConnectivityState) => {
    connectivityRef.current = next;
    setConnectivity(next);
  }, []);

  const setConnectivityUnlessTokenExpired = useCallback((next: Exclude<ConnectivityState, "token-expired">) => {
    if (connectivityRef.current === "token-expired") return;
    connectivityRef.current = next;
    setConnectivity(next);
  }, []);

  // Refresh badge count and conflict count from IndexedDB
  const refreshPending = useCallback(async () => {
    setPending(await pendingCount());
    const conflicted = await pendingGetConflicted();
    setConflicts(conflicted.length);
  }, []);

  // ── Schedule retry based on earliest nextRetryAt in queue ─────────────────
  // Declared as ref to avoid circular dep with flush
  const scheduleRetryRef = useRef<(() => Promise<void>) | null>(null);

  // ── Flush queue ────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    const conn = connectivityRef.current;
    if (_flushing || conn === "offline" || conn === "server-unreachable" || conn === "token-expired") return;

    // Claim the lock BEFORE the first await. flush() is called from four
    // independent listeners (window "online", Capacitor Network status
    // change, Capacitor App foreground, visibility change) that can all fire
    // within the same tick when a phone regains signal. The old code set
    // _flushing = true only after `await pendingGetDue()` returned, leaving a
    // window where a second concurrent call could pass the guard above,
    // read the same due actions, and send the same request twice — e.g. two
    // RUN_COMPLETE POSTs for the same run, where the first succeeds and the
    // second gets rejected by the server as a spurious "someone else edited
    // this" conflict, even though nothing actually conflicted.
    _flushing = true;
    markOfflinePerf("queue_flush_start");

    const due = await pendingGetDue();
    if (due.length === 0) {
      // Nothing to do — release the lock so a later real flush can proceed.
      markOfflinePerf("queue_flush_end");
      _flushing = false;
      // Nothing due — but there may be future-scheduled items; let scheduleRetry handle them
      await scheduleRetryRef.current?.();
      return;
    }

    setSyncing(true);
    setHasError(false);

    let anyError = false;
    let syncedAny = false;
    // Run entityIds whose op was rejected by the server this pass — dependent
    // ops for the SAME run (e.g. signatures after a rejected RUN_COMPLETE)
    // must not proceed against a run the server never actually completed.
    const droppedRunEntityIds = new Set<string>();

    for (const action of due) {
      // Skip if the action this depends on hasn't been synced yet
      if (action.dependsOnOpId) {
        const all = await pendingGetAll();
        const depStillPending = all.some(
          (a) => a.id === action.dependsOnOpId && a.status !== "uploading"
        );
        if (depStillPending) continue;
      }

      // If an earlier op for this run was rejected this pass, don't run
      // dependent ops (e.g. signatures after a rejected RUN_COMPLETE)
      // against a bad state.
      if (action.entityType === "workflow-run" && droppedRunEntityIds.has(action.entityId)) {
        continue;
      }

      // User must resolve flagged conflicts in Sync Center — do not re-send blindly.
      if (action.conflictDetected) {
        anyError = true;
        continue;
      }

      // ── Conflict detection (PATCH / PUT only) ─────────────────────────────
      if (
        (action.method === "PATCH" || action.method === "PUT") &&
        action.snapshotUpdatedAt &&
        action.entityType === "asset"
      ) {
        const cached = await entityGetAsset(action.entityId);
        if (cached) {
          const cachedRecord = cached as { syncedAt?: string };
          const syncedAt  = cachedRecord.syncedAt ? new Date(cachedRecord.syncedAt).getTime() : 0;
          const queuedAt  = new Date(action.createdAt).getTime();
          // If the entity was refreshed from the server MORE THAN 5s after we queued
          // the action, another device/user has written to it — flag as conflict.
          if (syncedAt > queuedAt + 5_000) {
            await pendingMarkConflict(action.id, {
              conflictKind: "concurrency",
              conflictMessage: "Another update arrived while this change was queued.",
            });
            window.dispatchEvent(new CustomEvent("sync-conflict-detected", {
              detail: { actionId: action.id, entityId: action.entityId, entityType: action.entityType },
            }));
            anyError = true;
            continue;
          }
        }
      }

      const attemptStartedAt = Date.now();
      let mappedRunId: string | null = null;
      let requestUrl = action.url;
      let requestData: unknown = action.body;
      const timeoutMs = getSyncOpTimeoutMs(action.opType);

      try {
        await pendingSetStatus(action.id, "uploading");
        if (action.entityType === "workflow-run") {
          await markRunSyncing(action.entityId);
        }
        mappedRunId = action.entityType === "workflow-run"
          ? await offlineStore.getMappedId("workflow-run", action.entityId)
          : null;
        requestUrl = mappedRunId
          ? remapRunIdInUrl(action.url, action.entityId, mappedRunId)
          : action.url;
        requestData = action.opType === "ASSET_DOCUMENT_LINK_UPLOAD"
          ? await buildAssetDocumentLinkUploadRequest(action.body)
          : await mediaStore.resolveUploadPayload(action.body);
        const { payloadBytes } = measurePayload(requestData);
        const response = await api.request({
          url: requestUrl,
          method: action.method,
          data: requestData,
          timeout: timeoutMs,
          syncMeta: {
            source: "sync-engine",
            opType: action.opType,
            payloadBytes,
          },
        });
        await processSyncedAction(action, response.data);
        await pendingRemove(action.id);
        await syncMetaSet(action.entityType);
        syncedAny = true;
      } catch (e: unknown) {
        const httpStatus = (e as { response?: { status?: number } }).response?.status;
        const errorCode = (e as { code?: string } | null)?.code;
        const timedOutAgainstReachableServer =
          errorCode === "ECONNABORTED" && getServerReachable();
        if (httpStatus === 409 || httpStatus === 412) {
          const conflictMessage = extractServerErrorMessage(e, `Conflict (${httpStatus})`);
          await pendingMarkConflict(action.id, {
            conflictKind: "concurrency",
            conflictHttpStatus: httpStatus,
            conflictMessage,
          });
          window.dispatchEvent(new CustomEvent("sync-conflict-detected", {
            detail: {
              actionId: action.id,
              entityId: action.entityId,
              entityType: action.entityType,
              httpStatus,
              message: conflictMessage,
            },
          }));
          anyError = true;
        } else if (httpStatus && httpStatus !== 429 && httpStatus >= 400 && httpStatus < 500) {
          const isWorkflowRunOp = action.entityType === "workflow-run";
          const isRejectableStatus = httpStatus === 422 || httpStatus === 400;
          if (isWorkflowRunOp && isRejectableStatus) {
            // Server rejected a workflow op (e.g. RUN_COMPLETE with open blocking
            // issues). This is NOT "malformed/deleted" — it's a rejection the user
            // must see, and dependent ops (signatures after a rejected complete)
            // must not proceed against a run the server never completed.
            const rejectMessage = extractServerErrorMessage(e, `Server rejected (${httpStatus})`);
            await pendingMarkConflict(action.id, {
              conflictKind: "business_rule",
              conflictHttpStatus: httpStatus,
              conflictMessage: rejectMessage,
            });
            await markRunSyncFailed(action.entityId, rejectMessage);
            window.dispatchEvent(new CustomEvent("sync-conflict-detected", {
              detail: {
                actionId: action.id,
                entityId: action.entityId,
                entityType: action.entityType,
                httpStatus,
                message: rejectMessage,
              },
            }));
            droppedRunEntityIds.add(action.entityId);
            anyError = true;
          } else {
            // Other 4xx: drop — entity deleted or request malformed
            await pendingRemove(action.id);
          }
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          const diagnostics = buildSyncAttemptDiagnostics({
            action,
            requestUrl,
            requestMethod: action.method,
            mappedRunId,
            requestData,
            durationMs: Date.now() - attemptStartedAt,
            timeoutMs,
            error: e,
            serverReachable: getServerReachable(),
            connectivity: connectivityRef.current,
          });
          await pendingMarkRetry(action.id, msg, diagnostics);
          if (action.entityType === "workflow-run") {
            await markRunSyncFailed(action.entityId, msg);
          }
          anyError = true;
          if (isNetworkLikeError(e)) {
            if (timedOutAgainstReachableServer) {
              continue;
            }
            setConnectivityState(hasNetworkSignal() ? "server-unreachable" : "offline");
            break;
          }
        }
      }
    }

    // Poke the Dashboard + notifications to reconcile after a successful sync
    // pass — they don't listen to workflow-runs-cache-updated (that's the
    // Assets page's event), so without this they can stay stale post-sync
    // until something else happens to trigger a refresh. Fired once per pass,
    // not per-op, since the Dashboard has no in-flight guard of its own.
    if (syncedAny) {
      await refreshOpenIssuesCacheFromServer();
      window.dispatchEvent(new Event("notifications:refresh"));
      window.dispatchEvent(new Event("repo:assets:updated"));
    }

    await refreshPending();
    setHasError(anyError);
    setSyncing(false);
    setLastSyncAt(new Date());
    markOfflinePerf("queue_flush_end");
    _flushing = false;

    // Schedule next retry if there are still items with future nextRetryAt
    await scheduleRetryRef.current?.();
  }, [refreshPending, setConnectivityState]);

  flushRef.current = flush;

  // ── Scheduled retry timer ─────────────────────────────────────────────────
  const scheduleRetry = useCallback(async () => {
    // Don't schedule retry timers while offline — the connectivity-restored
    // subscription will trigger flush() the instant the server comes back.
    if (connectivity === "offline" || connectivity === "server-unreachable") return;
    const all = await pendingGetAll();
    if (all.length === 0) return;
    const future = all
      .filter(a => a.nextRetryAt)
      .map(a => new Date(a.nextRetryAt!).getTime());
    if (future.length === 0) return;
    const nextMs = Math.max(Math.min(...future) - Date.now(), 1000);
    setTimeout(() => void flush(), Math.min(nextMs, 300_000)); // cap at 5 min
  }, [flush, connectivity]);

  // Wire up the ref so flush can call scheduleRetry without circular deps
  useEffect(() => {
    scheduleRetryRef.current = scheduleRetry;
  }, [scheduleRetry]);

  // ── Online / offline events ────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline  = () => {
      setConnectivityUnlessTokenExpired("online");
      if (isMobileNativePlatform()) pingNow();
      void reconnectAndFlush();
    };
    const handleOffline = () => setConnectivityState("offline");
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush, setConnectivityState, setConnectivityUnlessTokenExpired]);

  // Native mobile connectivity events are more reliable than window online/offline.
  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    let active = true;
    let remove: (() => void) | undefined;

    void Network.addListener("networkStatusChange", (status) => {
      if (!active) return;
      if (status.connected) {
        setConnectivityUnlessTokenExpired("online");
        if (isMobileNativePlatform()) pingNow();
        void reconnectAndFlush();
      } else {
        setConnectivityState("offline");
      }
    }).then((listener) => {
      remove = () => { void listener.remove(); };
    });

    return () => {
      active = false;
      remove?.();
    };
  }, [flush, setConnectivityState, setConnectivityUnlessTokenExpired]);

  // iOS app foreground - appStateChange is more reliable than visibilitychange in WKWebView.
  // Flushes pending writes when the app comes to the foreground on a native platform.
  // Also dispatches "app-foregrounded" for the stale-pull hook (useStaleOnResume).
  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    let listenerHandle: { remove: () => void } | undefined;
    App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return; // going to background - nothing to do here
      pingNow();
      if (hasNetworkSignal()) {
        setConnectivityUnlessTokenExpired("online");
        void reconnectAndFlush();
      } else {
        setConnectivityState("offline");
      }
      window.dispatchEvent(new CustomEvent("app-foregrounded", {
        detail: { timestamp: Date.now() },
      }));
    }).then((handle) => {
      listenerHandle = handle;
    });
    return () => {
      listenerHandle?.remove();
    };
  }, [flush, setConnectivityState, setConnectivityUnlessTokenExpired]);

  // ── Visibility change (phone unlock / tab switch) ──────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && hasNetworkSignal()) void flush();
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
    const handleUnreachable = () => {
      setConnectivityState(hasNetworkSignal() ? "server-unreachable" : "offline");
    };
    const handleReachable   = () => {
      setConnectivityState("online");
      setLastSyncAt(new Date());
      void reconnectAndFlush();
    };
    const handleAuthError = () => setConnectivityState("token-expired");
    const handleAuthRecovered = () => {
      setConnectivityState("online");
      setLastSyncAt(new Date());
      void reconnectAndFlush();
    };

    window.addEventListener("api-serving-cache",        handleUnreachable);
    window.addEventListener("offline-mode-online",      handleReachable);
    window.addEventListener("api-server-reachable",     handleReachable);
    window.addEventListener("api-auth-error",           handleAuthError);
    window.addEventListener("auth-change",              handleAuthRecovered);
    // Background read failures from repositories — these fire on every screen's
    // data refresh, not just on writes, so they catch "server is down but I have
    // nothing queued" which the write-only paths below can never detect.
    window.addEventListener("repo:assets:fetch-failed",   handleUnreachable);
    window.addEventListener("repo:projects:fetch-failed", handleUnreachable);
    window.addEventListener("repo:issues:fetch-failed",   handleUnreachable);
    return () => {
      window.removeEventListener("api-serving-cache",        handleUnreachable);
      window.removeEventListener("offline-mode-online",      handleReachable);
      window.removeEventListener("api-server-reachable",     handleReachable);
      window.removeEventListener("api-auth-error",           handleAuthError);
      window.removeEventListener("auth-change",              handleAuthRecovered);
      window.removeEventListener("repo:assets:fetch-failed",   handleUnreachable);
      window.removeEventListener("repo:projects:fetch-failed", handleUnreachable);
      window.removeEventListener("repo:issues:fetch-failed",   handleUnreachable);
    };
  }, [flush, setConnectivityState]);

  // ── Server reachability via dedicated background ping ─────────────────────
  // Subscribes to the singleton ping in services/connectivityMonitor.ts.
  // Subscribing also starts the monitor if it isn't already running — safe
  // to call from every instance of this hook, since the module only ever
  // starts its internal timer once regardless of how many subscribers exist.
  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    return subscribeServerReachable((reachable) => setServerReachable(reachable));
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    void refreshPending();
    if (hasNetworkSignal()) void flush();
  }, [flush, refreshPending]);

  // ── queueOrSend ───────────────────────────────────────────────────────────
  const queueOrSend = useCallback(async <T>(opts: QueueOrSendOpts): Promise<T | null> => {
    const { url, method, body, entityType, entityId, optimisticPatch = {}, opType } = opts;

    if (hasNetworkSignal()) {
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

    const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const snapshotUpdatedAt =
      typeof bodyObj["updatedAt"] === "string" ? bodyObj["updatedAt"] : undefined;

    await syncQueue.enqueue({
      opType,
      url,
      method,
      body,
      entityType,
      entityId,
      optimisticPatch,
      snapshotUpdatedAt,
    });
    await refreshPending();
    return null;
  }, [refreshPending]);

  useEffect(() => {
    const handler = () => void reconnectAndFlush();
    window.addEventListener("sync-request-flush", handler);
    return () => window.removeEventListener("sync-request-flush", handler);
  }, [flush]);

  // ── Conflict resolvers ────────────────────────────────────────────────────
  const resolveConflictKeep = useCallback(async (actionId: string) => {
    // Clear the conflict flag — action will be retried and will overwrite server
    await pendingClearConflict(actionId);
    await refreshPending();
    void flush();
  }, [flush, refreshPending]);

  const resolveConflictDiscard = useCallback(async (actionId: string) => {
    const all = await pendingGetAll();
    const action = all.find((item) => item.id === actionId);
    if (action) {
      await revertLocalEntityForConflict(action);
    }
    await pendingRemove(actionId);
    await refreshPending();
  }, [refreshPending]);

  // ── Derived status ────────────────────────────────────────────────────────
  const isOnline = connectivity !== "offline";

  const status: SyncStatus =
    connectivity === "offline" || connectivity === "server-unreachable" ? "offline" :
    connectivity === "token-expired" ? "error" :
    syncing    ? "syncing"  :
    conflicts > 0 || hasError ? "error"    :
    pending > 0 ? "pending"  :
                  "synced";

  return {
    status,
    isOnline,
    connectivity,
    serverReachable,
    pendingCount: pending,
    conflictCount: conflicts,
    lastSyncAt,
    syncing,
    triggerSync: flush,
    resolveConflictKeep,
    resolveConflictDiscard,
    queueOrSend,
  };
}
