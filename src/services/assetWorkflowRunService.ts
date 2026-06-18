import api from "./api";
import { IssueRepository } from "../repositories/IssueRepository";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import offlineStore, { type OfflineRun } from "./offlineStore";
import syncQueue from "./syncQueue";
import { entityGetAsset, entityPutAsset } from "./localDB";
import { mediaStore } from "./mediaStore";
import { workflowConfigService } from "./workflowConfigService";
import type { RunTimeEntry } from "../types/assetWorkflowRun";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, invalidateWebCache, invalidateWebCacheByPrefix } from "./webFreshCache";

export interface PendingSignatureRecord {
  runId:        string;
  assetId:      string;
  assetTag:     string;
  assetName:    string;
  projectId:    string;
  jobNumber:    string;
  customerName: string;
  completedAt:  string;
  completedBy:  string;
  signatureStatus: string;
}

export interface OpenIssueRecord {
  issueId:      string;
  description:  string;
  issueType:    "blocking" | "observation" | "scope-deviation";
  severity:     "low" | "medium" | "high";
  isBlocking:   boolean;
  reportedAt:   string;
  createdBy:    string | null;
  stepTitle:    string | null;
  runId:        string;
  assetId:      string;
  assetTag:     string;
  assetName:    string;
  assetLocation: string;
  projectId:    string;
  jobNumber:    string;
  customerName: string;
  /** "run" = from a workflow run; "asset" = manually added via the chevron */
  source:       "run" | "asset";
}

export interface ClosedIssueRecord extends OpenIssueRecord {
  resolvedAt:      string | null;
  resolvedBy:      string | null;
  resolutionNote:  string | null;
}

function isOfflineNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return !navigator.onLine;
  const candidate = error as { code?: string; message?: string; response?: unknown };
  if (candidate.response) return false;
  return (
    candidate.code === "ECONNABORTED" ||
    candidate.code === "ERR_NETWORK" ||
    candidate.message === "Network Error" ||
    !navigator.onLine
  );
}

async function resolveProjectId(assetId: string, runId?: string): Promise<string> {
  const assetRecord = await entityGetAsset(assetId);
  if (assetRecord?.projectId) return assetRecord.projectId;
  if (runId) {
    const cachedRun = await offlineStore.getRun(runId);
    if (cachedRun?.projectId) return cachedRun.projectId;
  }
  return "";
}

async function resolveRunId(runId: string): Promise<string> {
  return await offlineStore.getMappedId("workflow-run", runId) ?? runId;
}

async function getCachedRun(runId: string): Promise<OfflineRun | null> {
  const direct = await offlineStore.getRun(runId);
  if (direct) return direct;
  const mappedId = await resolveRunId(runId);
  if (mappedId !== runId) {
    return await offlineStore.getRun(mappedId);
  }
  return null;
}

function buildRunSnapshot(config: { id: string; name: string; version: number; stepsJson: string; mediaJson: string; featureSelectionsJson: string }): string {
  return JSON.stringify({
    id: config.id,
    name: config.name,
    version: config.version,
    stepsJson: config.stepsJson,
    mediaJson: config.mediaJson,
    featureSelectionsJson: config.featureSelectionsJson,
    snapshotAt: new Date().toISOString(),
  });
}

function buildInitialTimeTracking(now: string): string {
  const entries: RunTimeEntry[] = [{
    id: crypto.randomUUID(),
    category: "productive",
    startedAtUtc: now,
    endedAtUtc: null,
    reason: "Run started",
  }];
  return JSON.stringify(entries);
}

function toOfflineRun(run: AssetWorkflowRun, projectId: string, overrides: Partial<OfflineRun> = {}): OfflineRun {
  const now = new Date().toISOString();
  return {
    ...run,
    projectId,
    serverRunId: run.id,
    localRunId: overrides.localRunId ?? run.id,
    localStatus: overrides.localStatus ?? "Synced",
    lastLocalSavedAt: overrides.lastLocalSavedAt ?? now,
    dirty: overrides.dirty ?? false,
    syncError: overrides.syncError,
    ...overrides,
  };
}

async function cacheServerRun(run: AssetWorkflowRun): Promise<AssetWorkflowRun> {
  const projectId = await resolveProjectId(run.assetId, run.id);
  const existing = await offlineStore.getRun(run.id);
  if (existing?.dirty) {
    // Local data is newer (pending sync) — merge server metadata but keep local payload intact
    await offlineStore.saveRun({
      ...toOfflineRun(run, projectId),
      stepResultsJson: existing.stepResultsJson,
      issuesJson: existing.issuesJson,
      status: existing.status,
      timeTrackingJson: existing.timeTrackingJson,
      productiveSeconds: existing.productiveSeconds,
      downtimeSeconds: existing.downtimeSeconds,
      dirty: true,
      localStatus: existing.localStatus,
      syncError: existing.syncError,
      lastLocalSavedAt: existing.lastLocalSavedAt,
    });
    return run;
  }
  await offlineStore.saveRun(toOfflineRun(run, projectId));
  return run;
}

async function cacheServerRuns(runs: AssetWorkflowRun[]): Promise<AssetWorkflowRun[]> {
  await Promise.all(runs.map((run) => cacheServerRun(run)));
  return runs;
}

function refreshRunsInBackground(
  scope: { type: "project"; id: string } | { type: "asset"; id: string },
  endpoint: string,
): void {
  api.get<AssetWorkflowRun[]>(endpoint)
    .then(async (res) => {
      const runs = await cacheServerRuns(res.data);
      window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
        detail: scope.type === "project"
          ? { projectId: scope.id, runs }
          : { assetId: scope.id, runs },
      }));
    })
    .catch(() => {
      window.dispatchEvent(new Event("api-serving-cache"));
    });
}

async function enqueueRunMutation(
  runId: string,
  input: {
    opType: "RUN_UPDATE" | "RUN_COMPLETE";
    method: "PUT" | "POST";
    url: string;
    body: Record<string, unknown>;
    optimisticPatch: Record<string, unknown>;
  },
): Promise<void> {
  const existing = (await syncQueue.listByEntityId(runId))
    .filter((op) => op.opType === input.opType && op.url === input.url && op.method === input.method)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (existing && existing.status !== "uploading") {
    await syncQueue.updateQueuedOp(existing.id, {
      body: input.body,
      optimisticPatch: input.optimisticPatch,
    });
    return;
  }

  await syncQueue.enqueue({
    opType: input.opType,
    url: input.url,
    method: input.method,
    entityType: "workflow-run",
    entityId: runId,
    body: input.body,
    optimisticPatch: input.optimisticPatch,
  });
}

export const assetWorkflowRunService = {
  async listLatestByProject(projectId: string): Promise<AssetWorkflowRun[]> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(`/asset-workflow-runs/by-project/${projectId}`, async () => {
        const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-project/${projectId}`);
        return res.data;
      });
    }

    const cachedRuns = await offlineStore.listRunsByProject(projectId);
    if (cachedRuns.length > 0) {
      refreshRunsInBackground({ type: "project", id: projectId }, `/asset-workflow-runs/by-project/${projectId}`);
      return cachedRuns;
    }

    try {
      const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-project/${projectId}`);
      const runs = res.data;
      return await cacheServerRuns(runs);
    } catch {
      return await offlineStore.listRunsByProject(projectId);
    }
  },

  async listByAsset(assetId: string): Promise<AssetWorkflowRun[]> {
    if (!isMobileNativePlatform()) {
      // Shorter TTL than the default — this feeds run-state decisions (e.g.
      // "Continue Run" vs "Start Run") that should stay close to live.
      return webCachedGet(
        `/asset-workflow-runs/by-asset/${assetId}`,
        async () => {
          const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${assetId}`);
          return res.data;
        },
        { ttlMs: 8_000 }
      );
    }

    const cachedRuns = await offlineStore.listRunsByAsset(assetId);
    if (cachedRuns.length > 0) {
      refreshRunsInBackground({ type: "asset", id: assetId }, `/asset-workflow-runs/by-asset/${assetId}`);
      return cachedRuns;
    }

    try {
      const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${assetId}`);
      const runs = res.data;
      return await cacheServerRuns(runs);
    } catch {
      return await offlineStore.listRunsByAsset(assetId);
    }
  },

  async listByAssetFresh(assetId: string): Promise<AssetWorkflowRun[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${assetId}`);
      return res.data;
    }

    try {
      const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${assetId}`);
      return await cacheServerRuns(res.data);
    } catch {
      return await offlineStore.listRunsByAsset(assetId);
    }
  },

  async getById(id: string): Promise<AssetWorkflowRun | null> {
    if (!isMobileNativePlatform()) {
      try {
        return await webCachedGet(`/asset-workflow-runs/${id}`, async () => {
          const res = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${id}`);
          return res.data;
        });
      } catch {
        return null;
      }
    }

    const resolvedId = await resolveRunId(id);
    try {
      const res = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedId}`);
      return await cacheServerRun(res.data);
    } catch {
      return await getCachedRun(id);
    }
  },

  async startRun(assetId: string, workflowConfigId: string, technicianUserId?: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const res = await api.post<AssetWorkflowRun>("/asset-workflow-runs", {
        assetId,
        workflowConfigId,
        technicianUserId: technicianUserId ?? null,
      });
      invalidateWebCache(`/asset-workflow-runs/by-asset/${assetId}`);
      return res.data;
    }

    const body = {
      assetId,
      workflowConfigId,
      technicianUserId: technicianUserId ?? null,
    };
    try {
      const res = await api.post<AssetWorkflowRun>("/asset-workflow-runs", body);
      return await cacheServerRun(res.data);
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const existingRunId = await offlineStore.getPreviousRunRef(assetId, workflowConfigId);
      if (existingRunId) {
        const cachedExisting = await getCachedRun(existingRunId);
        if (cachedExisting && !cachedExisting.isLocked) return cachedExisting;
      }

      const config = await workflowConfigService.getById(workflowConfigId);
      if (!config) throw error;

      const now = new Date().toISOString();
      const localRunId = `offline-run-${crypto.randomUUID()}`;
      const projectId = await resolveProjectId(assetId);
      const existingRuns = await offlineStore.listRunsByAsset(assetId);
      const offlineRun: OfflineRun = {
        id: localRunId,
        assetId,
        workflowConfigId,
        workflowVersion: config.version,
        workflowSnapshotJson: buildRunSnapshot(config),
        status: "InProgress",
        isLocked: false,
        technicianUserId,
        stepResultsJson: "[]",
        issuesJson: "[]",
        timeTrackingJson: buildInitialTimeTracking(now),
        productiveSeconds: 0,
        downtimeSeconds: 0,
        downtimeEvents: 0,
        runNumber: existingRuns.filter((run) => run.workflowConfigId === workflowConfigId).length + 1,
        completedByName: undefined,
        signatureStatus: "None",
        installerSignedAt: undefined,
        customerSignedAt: undefined,
        startedAt: now,
        completedAt: undefined,
        createdAt: now,
        updatedAt: now,
        projectId,
        localRunId,
        serverRunId: undefined,
        localStatus: "PendingSync",
        lastLocalSavedAt: now,
        dirty: true,
        syncError: undefined,
      };

      await offlineStore.saveRun(offlineRun);
      await syncQueue.enqueue({
        opType: "RUN_CREATE",
        url: "/asset-workflow-runs",
        method: "POST",
        entityType: "workflow-run",
        entityId: localRunId,
        body,
        optimisticPatch: {
          status: "InProgress",
          isLocked: false,
          startedAt: now,
          updatedAt: now,
        },
      });
      return offlineRun;
    }
  },

  async saveProgress(runId: string, stepResultsJson: string, issuesJson?: string, status?: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const requestBody = await mediaStore.resolveUploadPayload({
        stepResultsJson,
        issuesJson: issuesJson ?? null,
        status: status ?? null,
      });
      const res = await api.put<AssetWorkflowRun>(`/asset-workflow-runs/${runId}`, requestBody);
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const body = {
      stepResultsJson,
      issuesJson: issuesJson ?? null,
      status: status ?? null,
    };
    try {
      const requestBody = await mediaStore.resolveUploadPayload(body);
      const res = await api.put<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}`, requestBody);
      return await cacheServerRun(res.data);
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedRun = await getCachedRun(runId);
      if (!cachedRun) throw error;

      const now = new Date().toISOString();
      const offlineRun: OfflineRun = {
        ...cachedRun,
        stepResultsJson,
        issuesJson: issuesJson ?? cachedRun.issuesJson,
        status: (status as AssetWorkflowRun["status"] | undefined) ?? cachedRun.status,
        updatedAt: now,
        lastLocalSavedAt: now,
        dirty: true,
        localStatus: "PendingSync",
        syncError: undefined,
      };

      await offlineStore.saveRun(offlineRun);
      await enqueueRunMutation(resolvedRunId, {
        opType: "RUN_UPDATE",
        method: "PUT",
        url: `/asset-workflow-runs/${resolvedRunId}`,
        body,
        optimisticPatch: {
          stepResultsJson,
          issuesJson: issuesJson ?? cachedRun.issuesJson,
          status: status ?? cachedRun.status,
          updatedAt: now,
        },
      });
      return offlineRun;
    }
  },

  async completeRun(runId: string, stepResultsJson: string, issuesJson: string, completedByName?: string, bomActualJson?: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const requestBody = await mediaStore.resolveUploadPayload({
        stepResultsJson,
        issuesJson,
        completedByName: completedByName ?? null,
        bomActualJson: bomActualJson ?? null,
      });
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/complete`, requestBody);
      // Completing a run also changes the asset's own status server-side
      // (see AssetWorkflowRunsController.CompleteRun) — invalidate both so
      // the very next read of either is guaranteed live, not a stale
      // pre-completion snapshot.
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      invalidateWebCache(`/project-assets/${res.data.assetId}`);
      invalidateWebCache(`/asset-workflow-runs/by-asset/${res.data.assetId}`);
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const body = {
      stepResultsJson,
      issuesJson,
      completedByName: completedByName ?? null,
      bomActualJson: bomActualJson ?? null,
    };
    try {
      const requestBody = await mediaStore.resolveUploadPayload(body);
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/complete`, requestBody);
      const cachedRun = await cacheServerRun(res.data);
      // Fix: the server's /complete response only contains the run, but completing
      // a run also changes the asset's own status server-side (e.g. to "Pending"
      // awaiting signature). Without this refetch, the locally cached asset stays
      // stuck on its pre-completion status (usually "InProgress"), which causes
      // the asset list to show the wrong action button ("Continue Run" instead of
      // "Installer Sign-off") until some unrelated full refresh happens to overwrite it.
      try {
        const assetRes = await api.get<{ id: string; productId: string; projectId: string; status: string }>(
          `/project-assets/${res.data.assetId}`
        );
        await entityPutAsset({
          id: assetRes.data.id,
          productId: assetRes.data.productId,
          projectId: assetRes.data.projectId,
          data: assetRes.data,
          dirty: false,
        });
      } catch {
        // Non-fatal — the run itself completed successfully. The asset will
        // self-correct on its next normal refresh if this refetch fails.
      }
      return cachedRun;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedRun = await getCachedRun(runId);
      if (!cachedRun) throw error;

      const now = new Date().toISOString();
      const offlineRun: OfflineRun = {
        ...cachedRun,
        stepResultsJson,
        issuesJson,
        completedByName,
        bomActualJson: bomActualJson ?? cachedRun.bomActualJson,
        status: "Complete",
        isLocked: true,
        // Fix: the server always sets this to "PendingInstaller" on completion
        // (see AssetWorkflowRunsController.CompleteRun). The offline fallback
        // previously never set it, so the run stayed on whatever signatureStatus
        // it had before completing — meaning the installer signature screen
        // never appeared until after reconnecting and re-syncing.
        signatureStatus: "PendingInstaller",
        completedAt: now,
        updatedAt: now,
        lastLocalSavedAt: now,
        dirty: true,
        localStatus: "PendingSync",
        syncError: undefined,
      };

      await offlineStore.saveRun(offlineRun);
      await enqueueRunMutation(resolvedRunId, {
        opType: "RUN_COMPLETE",
        method: "POST",
        url: `/asset-workflow-runs/${resolvedRunId}/complete`,
        body,
        optimisticPatch: {
          stepResultsJson,
          issuesJson,
          status: "Complete",
          isLocked: true,
          completedAt: now,
          updatedAt: now,
          bomActualJson: bomActualJson ?? cachedRun.bomActualJson,
        },
      });
      return offlineRun;
    }
  },

  async reopen(runId: string): Promise<AssetWorkflowRun> {
    const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/reopen`);
    return res.data;
  },

  /** Patch issues only — works on locked and in-progress runs. */
  async patchIssues(runId: string, issuesJson: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const requestBody = await mediaStore.resolveUploadPayload({ issuesJson });
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/issues`, requestBody);
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const body = { issuesJson };
    try {
      const requestBody = await mediaStore.resolveUploadPayload(body);
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/issues`, requestBody);
      const updatedRun = await cacheServerRun(res.data);
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return updatedRun;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedRun = await getCachedRun(runId);
      if (!cachedRun) throw error;

      const now = new Date().toISOString();
      const offlineRun: OfflineRun = {
        ...cachedRun,
        issuesJson,
        updatedAt: now,
        lastLocalSavedAt: now,
        dirty: true,
        localStatus: "PendingSync",
        syncError: undefined,
      };

      await offlineStore.saveRun(offlineRun);
      const existing = (await syncQueue.listByEntityId(resolvedRunId))
        .filter((op) => op.opType === "ISSUE_UPDATE" && op.url === `/asset-workflow-runs/${resolvedRunId}/issues`)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (existing && existing.status !== "uploading") {
        await syncQueue.updateQueuedOp(existing.id, {
          body,
          optimisticPatch: { issuesJson, updatedAt: now },
        });
      } else {
        await syncQueue.enqueue({
          opType: "ISSUE_UPDATE",
          url: `/asset-workflow-runs/${resolvedRunId}/issues`,
          method: "PATCH",
          entityType: "workflow-run",
          entityId: resolvedRunId,
          body,
          optimisticPatch: { issuesJson, updatedAt: now },
        });
      }
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return offlineRun;
    }
  },

  /**
   * After resolving a blocking issue, call this to auto-lock the run if no
   * blocking issues remain and the run is still in-progress.
   * Returns the updated run if it was auto-completed, null otherwise.
   */
  async tryAutoComplete(runId: string, completedByName?: string): Promise<AssetWorkflowRun | null> {
    const run = await this.getById(runId);
    if (!run || run.status !== "InProgress") return null;
    let issues: Array<{ isBlocking: boolean; resolved: boolean }> = [];
    try { issues = JSON.parse(run.issuesJson ?? "[]"); } catch { /* empty */ }
    const stillBlocking = issues.some((i) => i.isBlocking && !i.resolved);
    if (stillBlocking) return null;
    return await this.completeRun(runId, run.stepResultsJson ?? "[]", run.issuesJson ?? "[]", completedByName, run.bomActualJson);
  },

  /** Patch step results on a locked/complete run — used to add missing photos after completion. */
  async patchStepResults(runId: string, stepResultsJson: string, amendedByName?: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const requestBody = await mediaStore.resolveUploadPayload({
        stepResultsJson,
        amendedByName: amendedByName ?? null,
        amendedAt: new Date().toISOString(),
      });
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/step-results`, requestBody);
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const requestBody = await mediaStore.resolveUploadPayload({
      stepResultsJson,
      amendedByName: amendedByName ?? null,
      amendedAt: new Date().toISOString(),
    });
    const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/step-results`, requestBody);
    const updatedRun = await cacheServerRun(res.data);
    window.dispatchEvent(new Event("notifications:run-state-changed"));
    window.dispatchEvent(new Event("notifications:refresh"));
    return updatedRun;
  },

  /** Replace the full time-entries array and recompute metrics. Works on locked runs. */
  async patchTimeEntries(runId: string, timeEntriesJson: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/time-entries`, { timeEntriesJson });
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/time-entries`, { timeEntriesJson });
    return res.data;
  },

  /** Mark customer signature as waived — run stays complete but skips customer sign-off. */
  async waiveCustomerSignature(runId: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/waive-customer-signature`);
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/waive-customer-signature`);
    const updatedRun = await cacheServerRun(res.data);
    window.dispatchEvent(new Event("notifications:run-state-changed"));
    window.dispatchEvent(new Event("notifications:refresh"));
    return updatedRun;
  },

  async trackTimeEntry(
    runId: string,
    action: "StartProductive" | "ResumeProductive" | "StartDowntime" | "StopDowntime" | "StopAll",
    reason?: string,
    startedAtUtc?: string,
    endedAtUtc?: string
  ): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/time-entry`, {
        action,
        reason: reason ?? null,
        startedAtUtc: startedAtUtc ?? null,
        endedAtUtc: endedAtUtc ?? null,
      });
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/time-entry`, {
      action,
      reason: reason ?? null,
      startedAtUtc: startedAtUtc ?? null,
      endedAtUtc: endedAtUtc ?? null,
    });
    return res.data;
  },

  async listPendingSignatures(userId?: string): Promise<PendingSignatureRecord[]> {
    try {
      const res = await api.get<PendingSignatureRecord[]>("/asset-workflow-runs/pending-signatures", {
        params: userId ? { userId } : undefined,
      });
      return res.data;
    } catch {
      return [];
    }
  },

  async listOpenIssues(userId?: string): Promise<OpenIssueRecord[]> {
    try { return await IssueRepository.getAll(userId); }
    catch { return []; }
  },

  async listClosedIssues(): Promise<ClosedIssueRecord[]> {
    try {
      const res = await api.get<ClosedIssueRecord[]>("/asset-workflow-runs/resolved-issues");
      return res.data;
    } catch { return []; }
  },
};
