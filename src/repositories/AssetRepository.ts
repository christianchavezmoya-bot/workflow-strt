import api from "../services/api";
import type { ProjectAsset, ProjectAssetStatus } from "../types/projectAsset";
import {
  entityGetAssetsByProduct,
  entityGetAssetsByProject,
  entityPutAsset,
  entityReplaceAssetsByProduct,
  entityReplaceAssetsByProject,
  pendingAdd,
  syncMetaSet,
} from "../services/localDB";
import { isMobileNativePlatform } from "../utils/platform";

function normalizeStatus(raw: unknown): ProjectAssetStatus {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "inprogress" || value === "running") return "InProgress";
  if (value === "paused") return "Paused";
  if (value === "pending") return "Pending";
  if (value === "complete" || value === "completed" || value === "done") return "Complete";
  if (value === "closed") return "Closed";
  if (value === "issue" || value === "issues" || value === "missing") return "Issue";
  return "NotStarted";
}

function fromDto(dto: ProjectAsset): ProjectAsset {
  return {
    ...dto,
    status: normalizeStatus(dto.status),
  };
}

export const AssetRepository = {
  async getLocalByProduct(productId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    const local = await entityGetAssetsByProduct(productId);
    return (local as ProjectAsset[])
      .filter((asset) => includeDeleted || !asset.isDeleted)
      .map(fromDto);
  },

  async getLocalByProject(projectId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    const local = await entityGetAssetsByProject(projectId);
    return (local as ProjectAsset[])
      .filter((asset) => includeDeleted || !asset.isDeleted)
      .map(fromDto);
  },

  async getByProduct(productId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`, { params: { includeDeleted: includeDeleted || undefined } });
      return res.data.map(fromDto);
    }

    const local = await this.getLocalByProduct(productId, includeDeleted);

    // Background network refresh — runs unconditionally to keep IndexedDB fresh
    api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`, { params: { includeDeleted: includeDeleted || undefined } })
      .then(async (res) => {
        await entityReplaceAssetsByProduct(
          productId,
          res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
        );
        await syncMetaSet("assets");
        window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { productId } }));
      })
      .catch(() => { window.dispatchEvent(new Event("repo:assets:fetch-failed")); });

    if (local.length > 0) return local;

    // No local data — wait for network
    const res = await api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`, { params: { includeDeleted: includeDeleted || undefined } });
    await entityReplaceAssetsByProduct(
      productId,
      res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
    );
    return res.data.map(fromDto);
  },

  async getByProject(projectId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`, { params: { includeDeleted: includeDeleted || undefined } });
      return res.data.map(fromDto);
    }

    const local = await this.getLocalByProject(projectId, includeDeleted);

    // Background network refresh — runs unconditionally to keep IndexedDB fresh
    api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`, { params: { includeDeleted: includeDeleted || undefined } })
      .then(async (res) => {
        await entityReplaceAssetsByProject(
          projectId,
          res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
        );
        await syncMetaSet("assets");
        window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { projectId } }));
      })
      .catch(() => { window.dispatchEvent(new Event("repo:assets:fetch-failed")); });

    if (local.length > 0) return local;

    // No local data — wait for network
    const res = await api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`, { params: { includeDeleted: includeDeleted || undefined } });
    await entityReplaceAssetsByProject(
      projectId,
      res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
    );
    return res.data.map(fromDto);
  },

  async update(
    id: string,
    patch: Partial<ProjectAsset> & Record<string, unknown>
  ): Promise<ProjectAsset | null> {
    if (!isMobileNativePlatform()) {
      const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
      return fromDto(res.data);
    }

    try {
      const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
      await entityPutAsset({
        id: res.data.id,
        productId: res.data.productId,
        projectId: res.data.projectId,
        data: res.data,
        dirty: false,
      });
      return fromDto(res.data);
    } catch {
      // Queue for later — caller has already applied optimistic update
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
      return null;
    }
  },
};
