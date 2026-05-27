import api from "../services/api";
import type { ProjectAsset, ProjectAssetStatus } from "../types/projectAsset";
import {
  entityGetAsset,
  entityGetAssetsByProduct,
  entityGetAssetsByProject,
  entityPutAssets,
  entityPutAsset,
  pendingAdd,
  pendingGetByEntityId,
  pendingRemove,
} from "../services/localDB";
import { mediaStore } from "../services/mediaStore";

function normalizeStatus(raw: unknown): ProjectAssetStatus {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "inprogress") return "InProgress";
  if (value === "complete" || value === "completed") return "Complete";
  if (value === "issue" || value === "issues") return "Issue";
  return "NotStarted";
}

function fromDto(dto: ProjectAsset): ProjectAsset {
  return {
    ...dto,
    status: normalizeStatus(dto.status),
  };
}

function isQueueableOfflineError(error: unknown): boolean {
  if (!error || typeof error !== "object") return !navigator.onLine;
  const e = error as { response?: unknown; code?: string; message?: string };
  if (e.response) return false;
  return (
    !navigator.onLine ||
    e.code === "ECONNABORTED" ||
    e.code === "ERR_NETWORK" ||
    e.message === "Network Error"
  );
}

export const AssetRepository = {
  async getByProduct(productId: string): Promise<ProjectAsset[]> {
    const local = await entityGetAssetsByProduct(productId);

    // Background network refresh — runs unconditionally to keep IndexedDB fresh
    api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`)
      .then(async (res) => {
        await entityPutAssets(
          res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
        );
        window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { productId } }));
      })
      .catch(() => {});

    if (local.length > 0) return (local as ProjectAsset[]).map(fromDto);

    // No local data — wait for network
    const res = await api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`);
    await entityPutAssets(
      res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
    );
    return res.data.map(fromDto);
  },

  async getByProject(projectId: string): Promise<ProjectAsset[]> {
    const local = await entityGetAssetsByProject(projectId);

    // Background network refresh — runs unconditionally to keep IndexedDB fresh
    api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`)
      .then(async (res) => {
        await entityPutAssets(
          res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
        );
        window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { projectId } }));
      })
      .catch(() => {});

    if (local.length > 0) return (local as ProjectAsset[]).map(fromDto);

    // No local data — wait for network
    const res = await api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`);
    await entityPutAssets(
      res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
    );
    return res.data.map(fromDto);
  },

  async update(
    id: string,
    patch: Partial<ProjectAsset> & Record<string, unknown>
  ): Promise<ProjectAsset> {
    try {
      const requestPatch = await mediaStore.resolveUploadPayload(patch);
      const res = await api.put<ProjectAsset>(`/project-assets/${id}`, requestPatch);
      await entityPutAsset({
        id: res.data.id,
        productId: res.data.productId,
        projectId: res.data.projectId,
        data: res.data,
        dirty: false,
      });
      return fromDto(res.data);
    } catch (error) {
      if (!isQueueableOfflineError(error)) {
        throw error;
      }

      const local = await entityGetAsset(id);
      if (!local) {
        throw error;
      }

      const optimistic = {
        ...(local.data as ProjectAsset),
        ...patch,
        id,
      } as ProjectAsset;

      await entityPutAsset({
        id,
        productId: local.productId,
        projectId: local.projectId,
        data: optimistic,
        dirty: true,
      });

      // Keep only the latest queued PUT for this asset so repeated offline
      // edits don't stack duplicate writes for the same record.
      const existing = await pendingGetByEntityId(id);
      await Promise.all(
        existing
          .filter((a) => a.method === "PUT" && a.url === `/project-assets/${id}`)
          .map((a) => pendingRemove(a.id))
      );

      await pendingAdd({
        id: crypto.randomUUID(),
        url: `/project-assets/${id}`,
        method: "PUT",
        body: patch,
        entityType: "asset",
        entityId: id,
        optimisticPatch: patch as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });
      return fromDto(optimistic);
    }
  },
};
