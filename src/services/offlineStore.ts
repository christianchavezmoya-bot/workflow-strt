import {
  cacheGet,
  cachePut,
  entityGetWorkflowRun,
  entityGetWorkflowRunsByAsset,
  entityGetWorkflowRunsByProject,
  entityDeleteWorkflowRun,
  entityPutWorkflowRun,
} from "./localDB";
import type { AssetWorkflowRun, RunStatus } from "../types/assetWorkflowRun";

export type OfflineEntitySyncStatus =
  | "InProgress"
  | "Completed"
  | "PendingSync"
  | "Syncing"
  | "FailedSync"
  | "Synced";

export interface OfflineMediaRef {
  mediaId: string;
  kind: "photo" | "video" | "signature" | "document";
  path: string;
  mimeType: string;
  fileName: string;
  size?: number;
  linkedToType: "run-step" | "issue-report" | "issue-resolution" | "signature" | "document";
  linkedToId: string;
  createdAt: string;
  uploaded: boolean;
  serverUrl?: string;
  serverDocumentId?: string;
  syncError?: string;
}

export interface OfflineRun extends AssetWorkflowRun {
  projectId: string;
  serverRunId?: string;
  localRunId?: string;
  localStatus: OfflineEntitySyncStatus;
  lastLocalSavedAt: string;
  dirty: boolean;
  syncError?: string;
}

const CACHE_PREFIX = "offline-cache:";
const ID_MAP_PREFIX = "offline-id-map:";
const PREVIOUS_RUN_PREFIX = "offline-prev-run:";

function defaultRunSyncStatus(status: RunStatus, dirty: boolean): OfflineEntitySyncStatus {
  if (dirty) return status === "Complete" ? "Completed" : "PendingSync";
  return "Synced";
}

function normalizeOfflineRun(run: OfflineRun): OfflineRun {
  return {
    ...run,
    localStatus: run.localStatus ?? defaultRunSyncStatus(run.status, run.dirty),
    lastLocalSavedAt: run.lastLocalSavedAt ?? new Date().toISOString(),
    dirty: run.dirty ?? run.localStatus !== "Synced",
  };
}

export const offlineStore = {
  async saveRun(run: OfflineRun): Promise<void> {
    const normalized = normalizeOfflineRun(run);
    await entityPutWorkflowRun({
      id: normalized.id,
      assetId: normalized.assetId,
      projectId: normalized.projectId,
      data: normalized,
      dirty: normalized.dirty,
    });
    await this.savePreviousRunRef(normalized.assetId, normalized.workflowConfigId, normalized.id);
  },

  async getRun(runId: string): Promise<OfflineRun | null> {
    const record = await entityGetWorkflowRun(runId);
    return record ? (record.data as OfflineRun) : null;
  },

  async deleteRun(runId: string): Promise<void> {
    await entityDeleteWorkflowRun(runId);
  },

  async listRunsByAsset(assetId: string): Promise<OfflineRun[]> {
    const runs = await entityGetWorkflowRunsByAsset(assetId);
    return runs as OfflineRun[];
  },

  async listRunsByProject(projectId: string): Promise<OfflineRun[]> {
    const runs = await entityGetWorkflowRunsByProject(projectId);
    return runs as OfflineRun[];
  },

  async saveCache<T>(key: string, data: T): Promise<void> {
    await cachePut(`${CACHE_PREFIX}${key}`, data);
  },

  async getCache<T>(key: string): Promise<T | null> {
    return await cacheGet<T>(`${CACHE_PREFIX}${key}`);
  },

  async saveIdMapping(entityType: string, localId: string, serverId: string): Promise<void> {
    await cachePut(`${ID_MAP_PREFIX}${entityType}:${localId}`, { serverId, mappedAt: new Date().toISOString() });
  },

  async getMappedId(entityType: string, localId: string): Promise<string | null> {
    const entry = await cacheGet<{ serverId: string }>(`${ID_MAP_PREFIX}${entityType}:${localId}`);
    return entry?.serverId ?? null;
  },

  async savePreviousRunRef(assetId: string, workflowConfigId: string, runId: string): Promise<void> {
    await cachePut(`${PREVIOUS_RUN_PREFIX}${assetId}:${workflowConfigId}`, {
      runId,
      savedAt: new Date().toISOString(),
    });
  },

  async getPreviousRunRef(assetId: string, workflowConfigId: string): Promise<string | null> {
    const entry = await cacheGet<{ runId: string }>(`${PREVIOUS_RUN_PREFIX}${assetId}:${workflowConfigId}`);
    return entry?.runId ?? null;
  },
};

export default offlineStore;
