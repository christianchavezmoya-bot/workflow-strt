import api from "../services/api";
import type { ProjectAsset, ProjectAssetStatus } from "../types/projectAsset";
import {
  entityGetAssetsByProduct,
  entityGetAssetsByProject,
  entityPutAssets,
  entityPutAsset,
  pendingAdd,
} from "../services/localDB";

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
  ): Promise<ProjectAsset | null> {
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
