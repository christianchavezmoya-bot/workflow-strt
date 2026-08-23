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
import api from "../services/api";
import { scheduleBootstrapAfterUploadDrain } from "../utils/bootstrapAfterDrain";
import { shouldScheduleBootstrap } from "../utils/bootstrapFreshness";
import { dispatchNativeSyncFocusedRequested } from "../utils/nativeForegroundSyncSession";
import { isMobileNativePlatform } from "../utils/platform";
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
  pendingResetStaleUploading,
  pendingRetryNow,
  pendingSetStatus,
  syncMetaSet,
  droppedActionsGetAll,
  droppedActionExists,
  type PendingAction,
  type PendingActionMethod,
} from "../services/localDB";
import offlineStore, { type OfflineRun } from "../services/offlineStore";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import type { SignatureEvent } from "../types/signature";
import type { SubmitSignaturePayload } from "../services/signatureService";
import { isSignatureAlreadyAppliedError, isSignatureOrderingError } from "../utils/signatureSyncHelpers";
import { mediaStore } from "../services/mediaStore";
import syncQueue, { type SyncOpType } from "../services/syncQueue";
import { revertLocalEntityForConflict } from "../services/syncConflictProbe";
import {
  removeCachedLinkById,
  replaceCachedLink,
  type AssetDocumentLink,
  type AssetDocumentLinkUploadBody,
} from "../services/assetDocumentLinkService";
import { isOpenIssuesRefreshRoute } from "../utils/postLoginRoute";
import { isAuthTokenExpired } from "../utils/authToken";
import { isOnlineForAuthSync } from "../services/biometricAuth";
import { secureGet } from "../services/secureStorage";
import type { OpenIssueRecord } from "../services/assetWorkflowRunService";
import { deriveOpenIssuesFromAsset } from "../utils/issueDerivation";
import {
  subscribeServerReachable,
  pingNow,
  getNativeNetworkConnected,
  getServerReachable,
  shouldSkipBlockingFetch,
  shouldDeferBackgroundSync,
} from "../services/connectivityMonitor";
import {
  buildSyncAttemptDiagnostics,
  measurePayload,
} from "../utils/syncDiagnostics";
import { isOfflineNetworkError } from "../utils/offlineNetworkError";
import { markOfflinePerf } from "../utils/offlinePerf";
import { isOfflineModeActive, isManualOfflineModeActive } from "../services/offlineModeState";
import { getSyncOpTimeoutMs, FIELD_SYNC_FORCE_HEADER, FIELD_SYNC_FORCE_VALUE, isPhoneWinsFieldSync } from "../utils/syncPolicy";
import { classifySyncFailure, syncDiagnosticAppend } from "../services/syncDiagnosticsLog";
import { buildRunSyncBundleRequest, collectBundledActionIds, isRunBundleCandidate } from "../services/runSyncBundleService";
import {
  fromWorkInstructionDto,
  removeLocalWorkInstruction,
  replaceLocalWorkInstructionId,
  saveLocalWorkInstruction,
} from "../services/workInstructionService";
import { WorkflowAssignmentRepository } from "../repositories/WorkflowAssignmentRepository";
import type { WorkflowAssignment } from "../types/workflowType";
import type { WorkInstruction } from "../types/workInstruction";
import { setSyncFlushing } from "../utils/syncFlushLock";
import {
  setSyncConnectivityPendingCount,
  setSyncConnectivitySyncing,
  shouldSuppressUnreachableOffline,
} from "../utils/syncConnectivityGuard";
import type { BootstrapProgress } from "../services/offlineBootstrapService";

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
  serverReachable: boolean | null;
  pendingCount: number;
  conflictCount: number;
  lastSyncAt: Date | null;
  syncing: boolean;
  /** True when upload/bootstrap is allowed (native: radio up and server ping confirmed). */
  canSync: boolean;
  /** Manually trigger a sync flush */
  triggerSync: (options?: TriggerSyncOptions) => Promise<TriggerSyncResult>;
  /** Live bootstrap download progress (native Sync Now / reconnect prefetch). */
  bootstrapProgress: BootstrapProgress | null;
  /** Force-proceed a conflicted action (overwrite server version). */
  resolveConflictKeep: (actionId: string) => Promise<void>;
  /** Discard a conflicted action (accept server version). */
  resolveConflictDiscard: (actionId: string) => Promise<void>;
  /** Retry one queued action immediately (failed or conflict). */
  retryPendingAction: (actionId: string) => Promise<void>;
  /** Remove from sync queue but keep local changes (stop retrying). */
  dismissPendingKeepLocal: (actionId: string) => Promise<void>;
  /**
   * Queue or send a write operation.
   * If online: sends immediately, returns server response.
   * If offline: stores in IndexedDB queue, applies optimistic patch locally,
   * returns null (caller should already have applied the optimistic update).
   */
  queueOrSend: <T>(opts: QueueOrSendOpts) => Promise<T | null>;
}

export type TriggerSyncOptions = {
  /** When true (default), force a full field download after upload. Pull-to-sync passes false. */
  forceDownload?: boolean;
};

export type TriggerSyncResult = {
  uploaded: boolean;
  downloadScheduled: boolean;
  upToDate: boolean;
};

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
  scheduleReconnectFlush();
}

let reconnectFlushTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectFlushInFlight = false;
const RECONNECT_FLUSH_DEBOUNCE_MS = 1500;

/** After a pass syncs deps, chain another flush so dependent ops (TIME_ENTRY → RUN_COMPLETE → signatures) run without waiting for user action. */
let chainFlushTimer: ReturnType<typeof setTimeout> | null = null;
const CHAIN_FLUSH_DELAY_MS = 100;

function scheduleChainFlush(): void {
  if (chainFlushTimer) clearTimeout(chainFlushTimer);
  chainFlushTimer = setTimeout(() => {
    chainFlushTimer = null;
    void flushRef.current?.();
  }, CHAIN_FLUSH_DELAY_MS);
}

function scheduleReconnectFlush(): void {
  if (reconnectFlushTimer) clearTimeout(reconnectFlushTimer);
  reconnectFlushTimer = setTimeout(() => {
    reconnectFlushTimer = null;
    void reconnectAndFlushNow();
  }, RECONNECT_FLUSH_DEBOUNCE_MS);
}

async function reconnectAndFlushNow(): Promise<void> {
  if (reconnectFlushInFlight) return;
  if (!canAttemptSyncFlush()) return;
  reconnectFlushInFlight = true;
  try {
    await pendingResetRetrySchedule();
    if (isMobileNativePlatform() && isAuthTokenExpired() && isOnlineForAuthSync()) {
      window.dispatchEvent(new Event("api-auth-error"));
      return;
    }
    await flushRef.current?.();
  } finally {
    reconnectFlushInFlight = false;
  }
}

const flushRef = { current: null as (() => Promise<void>) | null };

function dispatchSyncEngineSyncing(syncing: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("sync-engine:syncing", { detail: { syncing } }));
}

// ── Singleton flush lock so multiple hook instances don't double-flush ────────
let _flushing = false;
/** Count of mounted useSyncEngine() instances — only the first starts the boot flush. */
let syncEngineMounts = 0;

function hasNetworkSignal(): boolean {
  if (isMobileNativePlatform()) {
    return getNativeNetworkConnected() !== false;
  }
  return typeof navigator === "undefined" || navigator.onLine;
}

/** True when the sync engine should attempt uploads (radio up + server reachable). */
function canAttemptSyncFlush(): boolean {
  if (isOfflineModeActive()) return false;
  if (!hasNetworkSignal()) return false;
  if (isMobileNativePlatform()) {
    // Unknown (null) means ping has not confirmed the server yet — wait.
    if (getServerReachable() !== true) return false;
    if (shouldDeferBackgroundSync()) return false;
  }
  return true;
}

/** Radio up but server health ping has not confirmed reachability yet. */
function setConnectivityAwaitingServerPing(
  setState: (next: ConnectivityState) => void,
): void {
  setState(hasNetworkSignal() ? "server-unreachable" : "offline");
}

function isNetworkLikeError(error: unknown): boolean {
  if (!hasNetworkSignal()) return true;
  return isOfflineNetworkError(error);
}

async function markRunSyncedFromServer(
  run: AssetWorkflowRun,
  fallbackRunId: string,
  syncedActionId?: string,
): Promise<void> {
  const cachedRun = await offlineStore.getRun(fallbackRunId);
  const otherPending = (await pendingGetByEntityId(fallbackRunId))
    .filter((item) => item.id !== syncedActionId);
  const hasFollowUpOps = otherPending.length > 0;
  const preserveLocal = Boolean(
    cachedRun
    && (hasFollowUpOps || cachedRun.dirty || (cachedRun.isLocked && !run.isLocked)),
  );

  const assetRecord = await entityGetAsset(run.assetId);
  const projectId = cachedRun?.projectId ?? assetRecord?.projectId ?? "";

  if (preserveLocal && cachedRun) {
    const syncedRun: OfflineRun = {
      ...run,
      projectId,
      serverRunId: run.id,
      localRunId: cachedRun.localRunId ?? run.id,
      stepResultsJson: cachedRun.stepResultsJson ?? run.stepResultsJson,
      issuesJson: cachedRun.issuesJson ?? run.issuesJson,
      timeTrackingJson: cachedRun.timeTrackingJson ?? run.timeTrackingJson,
      productiveSeconds: cachedRun.productiveSeconds ?? run.productiveSeconds,
      downtimeSeconds: cachedRun.downtimeSeconds ?? run.downtimeSeconds,
      downtimeEvents: cachedRun.downtimeEvents ?? run.downtimeEvents,
      status: cachedRun.status ?? run.status,
      isLocked: cachedRun.isLocked ?? run.isLocked,
      completedAt: cachedRun.completedAt ?? run.completedAt,
      completedByName: cachedRun.completedByName ?? run.completedByName,
      bomActualJson: cachedRun.bomActualJson ?? run.bomActualJson,
      installerSignedAt: cachedRun.installerSignedAt ?? run.installerSignedAt,
      customerSignedAt: cachedRun.customerSignedAt ?? run.customerSignedAt,
      signatureStatus: cachedRun.signatureStatus ?? run.signatureStatus,
      localStatus: hasFollowUpOps ? "PendingSync" : "Synced",
      lastLocalSavedAt: cachedRun.lastLocalSavedAt ?? new Date().toISOString(),
      dirty: hasFollowUpOps,
      syncError: undefined,
    };
    await offlineStore.saveRun(syncedRun);
    if (fallbackRunId !== run.id) {
      await offlineStore.deleteRun(fallbackRunId);
    }
    return;
  }

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
  if (fallbackRunId !== run.id) {
    await offlineStore.deleteRun(fallbackRunId);
  }
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

async function processSyncedBundleAction(
  runEntityId: string,
  _bundledActionIds: string[],
  responseData: unknown,
): Promise<void> {
  const data = responseData as { run?: AssetWorkflowRun; signatures?: SignatureEvent[] } | AssetWorkflowRun;
  const pending = await pendingGetByEntityId(runEntityId);
  const runPayload = (data && typeof data === "object" && "run" in data)
    ? (data as { run?: AssetWorkflowRun }).run
    : (data as AssetWorkflowRun | undefined);
  const signatures = (data && typeof data === "object" && "signatures" in data)
    ? (data as { signatures?: SignatureEvent[] }).signatures
    : undefined;

  const completeAction = pending.find((item) => item.opType === "RUN_COMPLETE");
  if (runPayload && completeAction) {
    await processSyncedAction(completeAction, runPayload);
  }

  if (signatures?.length) {
    for (const signature of signatures) {
      const sigAction = pending.find((item) =>
        item.opType === "SIGNATURE_SUBMIT"
        && (item.body as SubmitSignaturePayload | undefined)?.signerRole === signature.signerRole,
      );
      if (sigAction) {
        await processSyncedAction(sigAction, signature);
      }
    }
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
    const payload = action.body as SubmitSignaturePayload | undefined;
    if (cachedRun && payload?.signerRole) {
      const signedAt = signature?.signedAtUtc ?? new Date().toISOString();
      const signedRun = await buildSignatureStatusAfterSubmit(
        cachedRun,
        payload.signerRole,
        payload,
        signedAt,
      );
      const otherPending = (await pendingGetByEntityId(action.entityId))
        .filter((item) => item.id !== action.id);
      const hasFollowUpOps = otherPending.length > 0;
      const syncedSignedRun: OfflineRun = {
        ...signedRun,
        localStatus: hasFollowUpOps ? "PendingSync" : "Synced",
        dirty: hasFollowUpOps,
      };
      await offlineStore.saveRun(syncedSignedRun);
      await refreshAssetAfterRunSync(syncedSignedRun.assetId);
      window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
        detail: { assetId: syncedSignedRun.assetId, runs: [syncedSignedRun], mergeById: true },
      }));
    }
    return;
  }

  if (action.entityType === "workflow-run" && responseData && typeof responseData === "object") {
    const syncedRun = responseData as AssetWorkflowRun;
    await markRunSyncedFromServer(syncedRun, action.entityId, action.id);
    if (action.opType === "RUN_COMPLETE") {
      await refreshAssetAfterRunSync(syncedRun.assetId);
    }
    const cachedRun = (await offlineStore.getRun(syncedRun.id))
      ?? (await offlineStore.getRun(action.entityId));
    const emitRun = cachedRun ?? syncedRun;
    window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
      detail: { assetId: emitRun.assetId, runs: [emitRun], mergeById: true },
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

/** Treat server 422 as success when the signature for this role is already recorded. */
async function tryCompleteSignatureFromServer(
  action: PendingAction,
  runId: string,
  errorMessage: string,
): Promise<boolean> {
  const payload = action.body as SubmitSignaturePayload | undefined;
  const role = payload?.signerRole;
  if (!role || action.opType !== "SIGNATURE_SUBMIT") return false;
  if (isSignatureOrderingError(errorMessage)) return false;
  if (!isSignatureAlreadyAppliedError(errorMessage)) return false;

  try {
    const eventsRes = await api.get<SignatureEvent[]>("/signature-events", { params: { runId } });
    const existing = eventsRes.data.find((event) => event.signerRole === role);
    if (existing) {
      await processSyncedAction(action, existing);
      return true;
    }

    const runRes = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${runId}`);
    const run = runRes.data;
    const signedAt = role === "Installer" ? run.installerSignedAt : run.customerSignedAt;
    if (!signedAt) return false;

    await processSyncedAction(action, {
      id: `server-${role.toLowerCase()}-${runId}`,
      runId,
      signerRole: role,
      signerName: payload.signerName,
      signedAtUtc: signedAt,
      hasDrawnSignature: Boolean(payload.signatureData),
      reasonCode: payload.reasonCode ?? "Completed",
    } as SignatureEvent);
    return true;
  } catch {
    return false;
  }
}

async function buildStepMediaUploadRequest(body: unknown): Promise<FormData> {
  const payload = body as {
    itemsJson: string;
    files: Array<{ fileName: string; fileRef: string; mimeType: string }>;
    amendedAt: string;
    amendedByName?: string | null;
  };
  const form = new FormData();
  form.append("itemsJson", payload.itemsJson);
  form.append("amendedAt", payload.amendedAt);
  if (payload.amendedByName) form.append("amendedByName", payload.amendedByName);
  for (const fileEntry of payload.files) {
    const fileDataUrl = await mediaStore.resolveMediaValue(fileEntry.fileRef);
    const response = await fetch(fileDataUrl);
    const fileBlob = await response.blob();
    form.append(
      "files",
      new Blob([await fileBlob.arrayBuffer()], {
        type: fileEntry.mimeType || fileBlob.type || "application/octet-stream",
      }),
      fileEntry.fileName,
    );
  }
  return form;
}

function fieldSyncRequestHeaders(action: PendingAction): Record<string, string> | undefined {
  if (!isMobileNativePlatform() || !isPhoneWinsFieldSync()) return undefined;
  if (action.entityType !== "workflow-run") return undefined;
  return { [FIELD_SYNC_FORCE_HEADER]: FIELD_SYNC_FORCE_VALUE };
}

async function buildSignatureStatusAfterSubmit(
  cachedRun: OfflineRun,
  signerRole: "Installer" | "Customer",
  payload: SubmitSignaturePayload,
  signedAt: string,
): Promise<OfflineRun> {
  const declined = payload.reasonCode === "Declined";
  return {
    ...cachedRun,
    installerSignedAt: signerRole === "Installer" ? signedAt : cachedRun.installerSignedAt,
    customerSignedAt: signerRole === "Customer" ? signedAt : cachedRun.customerSignedAt,
    signatureStatus: signerRole === "Customer"
      ? (declined ? "Declined" : "Signed")
      : (cachedRun.customerSignedAt ? "Signed" : "PendingCustomer"),
    syncError: undefined,
    lastLocalSavedAt: signedAt,
  };
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
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [bootstrapProgress, setBootstrapProgress] = useState<BootstrapProgress | null>(null);

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
    const count = await pendingCount();
    setPending(count);
    setSyncConnectivityPendingCount(count);
    const conflicted = await pendingGetConflicted();
    setConflicts(conflicted.length);
  }, []);

  // ── Schedule retry based on earliest nextRetryAt in queue ─────────────────
  // Declared as ref to avoid circular dep with flush
  const scheduleRetryRef = useRef<(() => Promise<void>) | null>(null);

  // ── Flush queue ────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    const conn = connectivityRef.current;
    if (_flushing || conn === "token-expired") return;
    if (!canAttemptSyncFlush()) return;

    _flushing = true;
    markOfflinePerf("queue_flush_start");

    let due: PendingAction[] = [];
    let syncedAny = false;
    let anyError = false;
    let networkFailureStoppedPass = false;
    try {
      due = await pendingGetDue();
      if (due.length === 0) {
        markOfflinePerf("queue_flush_end");
        await refreshPending();
        setHasError(false);
        await scheduleRetryRef.current?.();
        return;
      }

      // Only advertise "syncing" when there is real work — empty-queue probes
      // must not start the overlay / keep-alive (native felt stuck in sync mode).
      setSyncFlushing(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("sync-engine:flush-start"));
      }
      setSyncing(true);
      dispatchSyncEngineSyncing(true);
      setSyncConnectivitySyncing(true);
      setHasError(false);

      let authExpired = false;
      // Run entityIds whose op was rejected by the server this pass — dependent
      // ops for the SAME run (e.g. signatures after a rejected RUN_COMPLETE)
      // must not proceed against a run the server never actually completed.
      const droppedRunEntityIds = new Set<string>();

      for (const action of due) {
        if (authExpired) break;
      // Skip if the action this depends on hasn't been synced yet
      if (action.dependsOnOpId) {
        const all = await pendingGetAll();
        const depStillPending = all.some((a) => a.id === action.dependsOnOpId);
        if (depStillPending) continue;
        const depWasDropped = await droppedActionExists(action.dependsOnOpId);
        if (depWasDropped) {
          const dropped = (await droppedActionsGetAll()).find((d) => d.id === action.dependsOnOpId);
          const message = dropped?.lastError
            ? `Blocked: required step permanently failed (${dropped.lastError})`
            : "Blocked: required earlier sync step permanently failed";
          await syncDiagnosticAppend({
            actionId: action.id,
            opType: action.opType,
            entityType: action.entityType,
            entityId: action.entityId,
            reason: "DEPENDENCY_DROPPED",
            message,
            retries: action.retries,
          });
          await pendingMarkConflict(action.id, {
            conflictKind: "business_rule",
            conflictMessage: message,
          });
          if (action.entityType === "workflow-run") {
            await markRunSyncFailed(action.entityId, message);
          }
          anyError = true;
          continue;
        }
      }

      // Signatures for this run flush atomically with RUN_COMPLETE when both are queued.
      if (action.opType === "SIGNATURE_SUBMIT" && await isRunBundleCandidate(action.entityId)) {
        continue;
      }

      // If an earlier op for this run was rejected this pass, don't run
      // dependent ops (e.g. signatures after a rejected RUN_COMPLETE)
      // against a bad state.
      if (action.entityType === "workflow-run" && droppedRunEntityIds.has(action.entityId)) {
        continue;
      }

      // Phone-wins field sync auto-retries conflict-flagged ops instead of blocking in Sync Center.
      if (action.conflictDetected) {
        if (isPhoneWinsFieldSync() && isMobileNativePlatform()) {
          await pendingClearConflict(action.id);
        } else {
          anyError = true;
          continue;
        }
      }

      // ── Conflict detection (PATCH / PUT only) ─────────────────────────────
      if (
        !isPhoneWinsFieldSync()
        && (action.method === "PATCH" || action.method === "PUT")
        && action.snapshotUpdatedAt
        && action.entityType === "asset"
      ) {
        try {
          const response = await api.get<ProjectAsset>(`/project-assets/${action.entityId}`);
          const serverUpdated = new Date(response.data.updatedAt).getTime();
          const snapshot = new Date(action.snapshotUpdatedAt).getTime();
          if (Number.isFinite(serverUpdated) && Number.isFinite(snapshot) && serverUpdated > snapshot) {
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
        } catch {
          // Offline or fetch failed — attempt upload anyway.
        }
      }

      const attemptStartedAt = Date.now();
      let mappedRunId: string | null = null;
      let requestUrl = action.url;
      let requestData: unknown = action.body;
      let bundledActionIds: string[] = [];

      if (action.opType === "RUN_BUNDLE" || (action.opType === "RUN_COMPLETE" && await isRunBundleCandidate(action.entityId))) {
        const bundle = await buildRunSyncBundleRequest(action.entityId);
        if (bundle) {
          requestUrl = `/asset-workflow-runs/${encodeURIComponent(bundle.runId)}/sync-bundle`;
          bundledActionIds = collectBundledActionIds(bundle);
          const apiRequest = {
            stepResultsJson: bundle.request.stepResultsJson,
            issuesJson: bundle.request.issuesJson,
            completedByName: bundle.request.completedByName,
            completedAtUtc: bundle.request.completedAtUtc,
            bomActualJson: bundle.request.bomActualJson,
            idempotencyKey: bundle.request.idempotencyKey,
            signatures: bundle.request.signatures.map(({ signerRole, payload }) => ({ signerRole, payload })),
          };
          const { payload, missingMedia } = await mediaStore.resolveUploadPayloadWithDiagnostics(apiRequest);
          if (missingMedia.length > 0) {
            const message = `Missing ${missingMedia.length} media file(s) on disk`;
            await syncDiagnosticAppend({
              actionId: action.id,
              opType: action.opType ?? "RUN_BUNDLE",
              entityType: action.entityType,
              entityId: action.entityId,
              reason: "MEDIA_MISSING",
              message,
              mediaPathsInvolved: missingMedia.map((m) => m.path),
              retries: action.retries,
            });
            await pendingMarkRetry(action.id, message, buildSyncAttemptDiagnostics({
              action,
              requestUrl,
              requestMethod: "POST",
              mappedRunId: bundle.runId,
              requestData: payload,
              durationMs: Date.now() - attemptStartedAt,
              timeoutMs: getSyncOpTimeoutMs("RUN_BUNDLE"),
              error: new Error(message),
              serverReachable: getServerReachable(),
              connectivity: connectivityRef.current,
            }));
            if (action.entityType === "workflow-run") {
              await markRunSyncFailed(action.entityId, message);
            }
            anyError = true;
            continue;
          }
          requestData = payload;
        }
      } else if (action.opType === "ASSET_DOCUMENT_LINK_UPLOAD") {
        requestData = await buildAssetDocumentLinkUploadRequest(action.body);
      } else if (action.opType === "STEP_MEDIA_UPLOAD") {
        requestData = await buildStepMediaUploadRequest(action.body);
      } else {
        const { payload, missingMedia } = await mediaStore.resolveUploadPayloadWithDiagnostics(action.body);
        requestData = payload;
        if (missingMedia.length > 0) {
          const message = `Missing ${missingMedia.length} media file(s) on disk`;
          await syncDiagnosticAppend({
            actionId: action.id,
            opType: action.opType,
            entityType: action.entityType,
            entityId: action.entityId,
            reason: "MEDIA_MISSING",
            message,
            mediaPathsInvolved: missingMedia.map((m) => m.path),
            retries: action.retries,
          });
          await pendingMarkRetry(action.id, message, buildSyncAttemptDiagnostics({
            action,
            requestUrl,
            requestMethod: action.method,
            mappedRunId,
            requestData: payload,
            durationMs: Date.now() - attemptStartedAt,
            timeoutMs: getSyncOpTimeoutMs(action.opType, measurePayload(payload).payloadBytes),
            error: new Error(message),
            serverReachable: getServerReachable(),
            connectivity: connectivityRef.current,
          }));
          if (action.entityType === "workflow-run") {
            await markRunSyncFailed(action.entityId, message);
          }
          anyError = true;
          continue;
        }
      }
      const { payloadBytes } = measurePayload(requestData);
      const timeoutMs = getSyncOpTimeoutMs(action.opType, payloadBytes);

      try {
        await pendingSetStatus(action.id, "uploading");
        if (action.entityType === "workflow-run") {
          await markRunSyncing(action.entityId);
        }
        mappedRunId = action.entityType === "workflow-run"
          ? await offlineStore.getMappedId("workflow-run", action.entityId)
          : null;
        const usingBundle = bundledActionIds.length > 0;
        if (usingBundle) {
          const serverRunId = mappedRunId ?? action.entityId;
          requestUrl = `/asset-workflow-runs/${encodeURIComponent(serverRunId)}/sync-bundle`;
        } else {
          requestUrl = mappedRunId
            ? remapRunIdInUrl(action.url, action.entityId, mappedRunId)
            : action.url;
        }
        const response = await api.request({
          url: requestUrl,
          method: usingBundle ? "POST" : action.method,
          data: requestData,
          timeout: timeoutMs,
          headers: fieldSyncRequestHeaders(action),
          syncMeta: {
            source: "sync-engine",
            opType: usingBundle ? "RUN_BUNDLE" : action.opType,
            payloadBytes,
          },
        });
        if (usingBundle) {
          await processSyncedBundleAction(action.entityId, bundledActionIds, response.data);
          await Promise.all(bundledActionIds.map((id) => pendingRemove(id)));
        } else {
          await processSyncedAction(action, response.data);
          await pendingRemove(action.id);
        }
        await syncMetaSet(action.entityType);
        syncedAny = true;
      } catch (e: unknown) {
        const httpStatus = (e as { response?: { status?: number } }).response?.status;
        const errorCode = (e as { code?: string } | null)?.code;
        const timedOutAgainstReachableServer =
          errorCode === "ECONNABORTED" && getServerReachable();
        if (httpStatus === 409 || httpStatus === 412) {
          if (isPhoneWinsFieldSync() && isMobileNativePlatform() && action.entityType === "workflow-run") {
            await pendingClearConflict(action.id);
            await pendingMarkRetry(action.id, extractServerErrorMessage(e, `Conflict (${httpStatus})`), buildSyncAttemptDiagnostics({
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
            }));
            anyError = true;
          } else {
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
          }
        } else if (httpStatus === 401) {
          // Session expired mid-flush — keep queued work for post-login retry.
          await pendingSetStatus(action.id, "pending");
          window.dispatchEvent(new Event("api-auth-error"));
          anyError = true;
          authExpired = true;
        } else if (httpStatus && httpStatus !== 429 && httpStatus >= 400 && httpStatus < 500) {
          const isWorkflowRunOp = action.entityType === "workflow-run";
          const isRejectableStatus = httpStatus === 422 || httpStatus === 400;
          const rejectMessage = extractServerErrorMessage(e, `Server rejected (${httpStatus})`);

          if (action.opType === "SIGNATURE_SUBMIT" && isRejectableStatus) {
            if (isSignatureOrderingError(rejectMessage)) {
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
              await pendingMarkRetry(action.id, rejectMessage, diagnostics);
              anyError = true;
            } else if (mappedRunId && await tryCompleteSignatureFromServer(action, mappedRunId, rejectMessage)) {
              await pendingRemove(action.id);
              await syncMetaSet(action.entityType);
              syncedAny = true;
            } else if (isWorkflowRunOp) {
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
              anyError = true;
            } else {
              await pendingRemove(action.id);
            }
          } else if (isWorkflowRunOp && isRejectableStatus) {
            const terminalSigned = /signed and closed|customer-signed|signed.*closed/i.test(rejectMessage);
            if (isPhoneWinsFieldSync() && isMobileNativePlatform() && !terminalSigned) {
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
              await pendingMarkRetry(action.id, rejectMessage, diagnostics);
              anyError = true;
            } else {
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
            }
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
            // Deliberate offline fast-bail — don't burn retry budget; try again on reconnect.
            const isOfflineSkip = (e as { isOfflineSkip?: boolean; message?: string }).isOfflineSkip
              || (e instanceof Error && e.message === "offline-skip");
            if (isOfflineSkip) {
              await pendingSetStatus(action.id, "pending");
              setConnectivityState(hasNetworkSignal() ? "server-unreachable" : "offline");
              networkFailureStoppedPass = true;
              break;
            }
            setConnectivityState(hasNetworkSignal() ? "server-unreachable" : "offline");
            networkFailureStoppedPass = true;
            break;
          }
        }
      }
    }

      // pass — they don't listen to workflow-runs-cache-updated (that's the
      // Assets page's event), so without this they can stay stale post-sync
      // until something else happens to trigger a refresh. Fired once per pass,
      // not per-op, since the Dashboard has no in-flight guard of its own.
      if (syncedAny && isOpenIssuesRefreshRoute(window.location.pathname)) {
        await refreshOpenIssuesCacheFromServer();
        window.dispatchEvent(new Event("notifications:refresh"));
        window.dispatchEvent(new Event("repo:assets:updated"));
      }

      await refreshPending();
      setHasError(anyError);
      if (due.length > 0) {
        setLastSyncAt(new Date());
      }
      await scheduleRetryRef.current?.();
    } finally {
      await pendingResetStaleUploading();
      if (due.length > 0) {
        setSyncing(false);
        dispatchSyncEngineSyncing(false);
        setSyncConnectivitySyncing(false);
      }
      markOfflinePerf("queue_flush_end");
      _flushing = false;
      setSyncFlushing(false);
      const pendingRemaining = await pendingCount();
      window.dispatchEvent(new CustomEvent("sync-engine:flush-complete", {
        detail: { syncedAny, pendingRemaining, anyError },
      }));
      if (
        syncedAny
        && pendingRemaining > 0
        && !networkFailureStoppedPass
        && canAttemptSyncFlush()
        && connectivityRef.current !== "token-expired"
      ) {
        scheduleChainFlush();
      }
    }
  }, [refreshPending, setConnectivityState]);

  flushRef.current = flush;

  // ── Scheduled retry timer ─────────────────────────────────────────────────
  const scheduleRetry = useCallback(async () => {
    // Don't schedule retry timers while offline — the connectivity-restored
    // subscription will trigger flush() the instant the server comes back.
    if (!canAttemptSyncFlush()) return;
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
      if (isMobileNativePlatform()) {
        // Radio up ≠ server reachable — ping first; flush runs from subscribeServerReachable.
        setConnectivityAwaitingServerPing(setConnectivityState);
        pingNow();
        return;
      }
      setConnectivityUnlessTokenExpired("online");
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
        setConnectivityAwaitingServerPing(setConnectivityState);
        pingNow();
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
  }, [setConnectivityState]);

  // ── Visibility change (phone unlock / tab switch) ──────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (canAttemptSyncFlush()) void flush();
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
      // Background read failures while radio is up must not block sync flush.
      if (!hasNetworkSignal()) {
        setConnectivityState("offline");
      }
    };
    const handleReachable   = () => {
      setConnectivityState("online");
      setLastSyncAt(new Date());
      void reconnectAndFlush();
    };
    /** Amber banner cleared — flush immediately instead of waiting on debounce + ping cycle. */
    const handleBackOnline = () => {
      pingNow();
      setConnectivityState("online");
      setLastSyncAt(new Date());
      void reconnectAndFlushNow();
    };
    const handleAuthError = () => setConnectivityState("token-expired");
    const handleAuthRecovered = () => {
      // Fresh login must unblock sync even if a prior 401 left token-expired set.
      connectivityRef.current = "online";
      setConnectivity("online");
      setLastSyncAt(new Date());
      void reconnectAndFlush();
    };

    window.addEventListener("api-serving-cache",        handleUnreachable);
    window.addEventListener("offline-mode-online",      handleBackOnline);
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
      window.removeEventListener("offline-mode-online",      handleBackOnline);
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
    return subscribeServerReachable((reachable) => {
      setServerReachable(reachable);
      // The ping is the only signal that catches "link up, server unreachable"
      // (e.g. Wi-Fi off, fell back to cellular, backend is LAN-only) without
      // waiting for the user to trigger a real request via navigation.
      if (!reachable) {
        setConnectivityState(hasNetworkSignal() ? "server-unreachable" : "offline");
      } else {
        setConnectivityUnlessTokenExpired("online");
        void reconnectAndFlushNow();
      }
    });
  }, [setConnectivityState, setConnectivityUnlessTokenExpired]);

  // ── Keep every hook instance's `syncing` in lockstep with the overlay ──────
  useEffect(() => {
    const onSyncing = (event: Event) => {
      const detail = (event as CustomEvent<{ syncing?: boolean }>).detail;
      setSyncing(Boolean(detail?.syncing));
    };
    window.addEventListener("sync-engine:syncing", onSyncing);
    return () => window.removeEventListener("sync-engine:syncing", onSyncing);
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────────
  // ~10 UI consumers mount this hook; only the first instance probes the queue.
  useEffect(() => {
    syncEngineMounts += 1;
    const isPrimary = syncEngineMounts === 1;
    void refreshPending();
    if (isPrimary && canAttemptSyncFlush() && !shouldSkipBlockingFetch()) void flush();
    return () => {
      syncEngineMounts -= 1;
    };
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
    const handlerNow = () => void reconnectAndFlushNow();
    window.addEventListener("sync-request-flush", handler);
    window.addEventListener("sync-request-flush-now", handlerNow);
    return () => {
      window.removeEventListener("sync-request-flush", handler);
      window.removeEventListener("sync-request-flush-now", handlerNow);
    };
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
      // Accepting server for a run drops every queued op for that run (e.g. stale time entries).
      if (action.entityType === "workflow-run") {
        const siblings = all.filter(
          (item) => item.id !== actionId
            && item.entityType === "workflow-run"
            && item.entityId === action.entityId,
        );
        await Promise.all(siblings.map((item) => pendingRemove(item.id)));
      }
    }
    await pendingRemove(actionId);
    await refreshPending();
  }, [refreshPending]);

  const retryPendingAction = useCallback(async (actionId: string) => {
    await pendingRetryNow(actionId);
    await refreshPending();
    void flush();
  }, [flush, refreshPending]);

  /** Drop from queue without reverting local optimistic data. */
  const dismissPendingKeepLocal = useCallback(async (actionId: string) => {
    await pendingRemove(actionId);
    await refreshPending();
  }, [refreshPending]);

  /** Upload pending ops, then download field data when freshness gate allows. */
  const triggerSync = useCallback(async (options?: TriggerSyncOptions): Promise<TriggerSyncResult> => {
    const result: TriggerSyncResult = { uploaded: false, downloadScheduled: false, upToDate: false };
    if (!canAttemptSyncFlush()) return result;

    if (isMobileNativePlatform()) {
      dispatchNativeSyncFocusedRequested();
    }

    const pendingBefore = pending;
    await reconnectAndFlushNow();
    if (pendingBefore > 0) result.uploaded = true;

    if (isMobileNativePlatform() && canAttemptSyncFlush()) {
      const forceDownload = options?.forceDownload ?? true;
      if (forceDownload) {
        scheduleBootstrapAfterUploadDrain("all", 0, true, "sync-now");
        result.downloadScheduled = true;
      } else {
        const shouldDownload = await shouldScheduleBootstrap({
          reason: "pull-sync",
          scope: "assigned",
          force: false,
        });
        if (shouldDownload) {
          scheduleBootstrapAfterUploadDrain("assigned", 0, false, "pull-sync");
          result.downloadScheduled = true;
        } else {
          result.upToDate = true;
          window.dispatchEvent(new CustomEvent("sync:up-to-date", {
            detail: { uploaded: result.uploaded },
          }));
        }
      }
    } else if (!result.uploaded) {
      result.upToDate = true;
      window.dispatchEvent(new CustomEvent("sync:up-to-date", {
        detail: { uploaded: false },
      }));
    }

    return result;
  }, [pending]);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    const onProgress = (event: Event) => {
      setBootstrapProgress((event as CustomEvent<BootstrapProgress>).detail);
    };
    const onDone = () => setBootstrapProgress(null);
    window.addEventListener("bootstrap:progress", onProgress);
    window.addEventListener("bootstrap:complete", onDone);
    window.addEventListener("bootstrap:error", onDone);
    return () => {
      window.removeEventListener("bootstrap:progress", onProgress);
      window.removeEventListener("bootstrap:complete", onDone);
      window.removeEventListener("bootstrap:error", onDone);
    };
  }, []);

  // ── Derived status ────────────────────────────────────────────────────────
  const isOnline = connectivity !== "offline" && !isOfflineModeActive();

  const suppressOfflineBadge =
    shouldSuppressUnreachableOffline()
    && hasNetworkSignal()
    && !isManualOfflineModeActive();

  const wouldShowOffline =
    connectivity === "offline"
    || connectivity === "server-unreachable"
    || isOfflineModeActive();

  const canSync = canAttemptSyncFlush();

  const status: SyncStatus =
    connectivity === "token-expired" ? "error" :
    syncing ? "syncing" :
    pending > 0 ? "pending" :
    wouldShowOffline && !suppressOfflineBadge ? "offline" :
    conflicts > 0 || hasError ? "error" :
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
    canSync,
    triggerSync,
    resolveConflictKeep,
    resolveConflictDiscard,
    retryPendingAction,
    dismissPendingKeepLocal,
    queueOrSend,
    bootstrapProgress,
  };
}
