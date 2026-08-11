/**
 * Proactive conflict detection when SSE signals remote asset changes.
 * Marks queued asset writes when the server version is newer than our snapshot.
 */
import api from "./api";
import {
  entityGetAllAssets,
  entityGetAsset,
  entityPutAsset,
  pendingGetAll,
  pendingMarkConflict,
} from "./localDB";
import offlineStore from "./offlineStore";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import { isMobileNativePlatform } from "../utils/platform";
import { isPhoneWinsFieldSync } from "../utils/syncPolicy";

export type SseAssetUpdateDetail = {
  productId?: string;
  projectId?: string;
};

export async function probePendingConflictsFromSse(detail: SseAssetUpdateDetail): Promise<void> {
  if (!isMobileNativePlatform()) return;
  if (isPhoneWinsFieldSync()) return;

  const pending = await pendingGetAll();
  const candidates = pending.filter(
    (action) =>
      !action.conflictDetected &&
      action.entityType === "asset" &&
      (action.method === "PATCH" || action.method === "PUT") &&
      action.snapshotUpdatedAt,
  );
  if (candidates.length === 0) return;

  let assetRecords: Array<{ id: string; productId: string; projectId: string }> = [];
  try {
    assetRecords = (await entityGetAllAssets()) as Array<{ id: string; productId: string; projectId: string }>;
  } catch {
    return;
  }

  const scopedIds = new Set(
    assetRecords
      .filter((record) => {
        if (detail.projectId && record.projectId !== detail.projectId) return false;
        if (detail.productId && record.productId !== detail.productId) return false;
        return true;
      })
      .map((record) => record.id),
  );

  for (const action of candidates) {
    if (!scopedIds.has(action.entityId)) continue;

    try {
      const response = await api.get<ProjectAsset>(`/project-assets/${action.entityId}`);
      const serverUpdated = new Date(response.data.updatedAt).getTime();
      const snapshot = new Date(action.snapshotUpdatedAt!).getTime();
      if (!Number.isFinite(serverUpdated) || !Number.isFinite(snapshot)) continue;
      if (serverUpdated <= snapshot) continue;

      await pendingMarkConflict(action.id, {
        conflictKind: "concurrency",
        conflictMessage: "Someone else updated this asset while your change was queued.",
      });
      window.dispatchEvent(new CustomEvent("sync-conflict-detected", {
        detail: {
          actionId: action.id,
          entityId: action.entityId,
          entityType: action.entityType,
          message: "Someone else updated this asset while your change was queued.",
        },
      }));
    } catch {
      // Offline or fetch failed — skip; flush loop will retry later.
    }
  }
}

/** Best-effort revert of local optimistic state when discarding a conflicted action. */
export async function revertLocalEntityForConflict(action: {
  entityType: string;
  entityId: string;
}): Promise<void> {
  if (action.entityType === "asset") {
    const existing = await entityGetAsset(action.entityId);
    try {
      const response = await api.get<ProjectAsset>(`/project-assets/${action.entityId}`);
      await entityPutAsset({
        id: action.entityId,
        productId: existing?.productId ?? response.data.productId,
        projectId: existing?.projectId ?? response.data.projectId,
        data: response.data,
        dirty: false,
      });
      window.dispatchEvent(new Event("repo:assets:updated"));
    } catch {
      // Keep local state if server fetch fails.
    }
    return;
  }

  if (action.entityType === "workflow-run") {
    try {
      const mappedId = await offlineStore.getMappedId("workflow-run", action.entityId) ?? action.entityId;
      const response = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${mappedId}`);
      const run = response.data;
      const cachedRun = await offlineStore.getRun(action.entityId);
      const assetRecord = await entityGetAsset(run.assetId);
      await offlineStore.saveRun({
        ...run,
        projectId: cachedRun?.projectId ?? assetRecord?.projectId ?? "",
        serverRunId: run.id,
        localRunId: cachedRun?.localRunId ?? action.entityId,
        localStatus: "Synced",
        lastLocalSavedAt: new Date().toISOString(),
        dirty: false,
        syncError: undefined,
      });
      window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
        detail: { assetId: run.assetId, runs: [run], mergeById: true },
      }));
    } catch {
      // Keep local state if server fetch fails.
    }
  }
}
