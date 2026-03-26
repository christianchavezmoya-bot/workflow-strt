import api, { cachedGet } from "./api";
import type { ProjectAsset, CreateProjectAssetInput, ProjectAssetStatus } from "../types/projectAsset";
import { pendingAdd, pendingGetAll, entityPutAsset, entityPutAssets } from "./localDB";

/** Return all asset IDs that have a pending action queued. */
export async function pendingAssetIds(): Promise<Set<string>> {
  const all = await pendingGetAll();
  return new Set(all.filter((a) => a.entityType === "asset").map((a) => a.entityId));
}

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

export const projectAssetService = {
  async listByProject(projectId: string): Promise<ProjectAsset[]> {
    try {
      const data = await cachedGet<ProjectAsset[]>(`/project-assets/by-project/${projectId}`);
      entityPutAssets(
        data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
      ).catch(() => {});
      return data.map(fromDto);
    } catch { return []; }
  },

  async listByProduct(productId: string): Promise<ProjectAsset[]> {
    try {
      const data = await cachedGet<ProjectAsset[]>(`/project-assets/by-product/${productId}`);
      entityPutAssets(
        data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
      ).catch(() => {});
      return data.map(fromDto);
    } catch { return []; }
  },

  async create(input: CreateProjectAssetInput): Promise<ProjectAsset> {
    const res = await api.post<ProjectAsset>("/project-assets", input);
    return fromDto(res.data);
  },

  async bulkCreate(projectId: string, productId: string, assets: CreateProjectAssetInput[]): Promise<ProjectAsset[]> {
    const res = await api.post<ProjectAsset[]>("/project-assets/bulk", {
      projectId,
      productId,
      assets,
    });
    return res.data.map(fromDto);
  },

  async update(id: string, patch: Partial<CreateProjectAssetInput> & { status?: string; workOrderId?: string }): Promise<ProjectAsset> {
    try {
      const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
      const updated = fromDto(res.data);
      // Keep IndexedDB entity store in sync after a successful server write
      entityPutAsset({
        id: res.data.id,
        productId: res.data.productId,
        projectId: res.data.projectId,
        data: res.data,
        dirty: false,
      }).catch(() => {});
      return updated;
    } catch {
      // Offline or network failure — queue and return optimistic value
      const patchRecord = patch as Record<string, unknown>;
      await pendingAdd({
        id: crypto.randomUUID(),
        url: `/project-assets/${id}`,
        method: "PUT",
        body: patch,
        entityType: "asset",
        entityId: id,
        optimisticPatch: patchRecord,
        createdAt: new Date().toISOString(),
      });
      // Mark the asset as dirty in IndexedDB using whatever we know
      entityPutAsset({
        id,
        productId: (patchRecord.productId as string) ?? "",
        projectId: (patchRecord.projectId as string) ?? "",
        data: patchRecord,
        dirty: true,
      }).catch(() => {});
      throw new Error("Offline — change queued");
    }
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/project-assets/${id}`);
  },

  async workloadSummary(): Promise<WorkloadSummaryItem[]> {
    try {
      const res = await api.get<WorkloadSummaryItem[]>("/project-assets/workload-summary");
      return res.data;
    } catch {
      return [];
    }
  },

  async activeSummary(): Promise<ProjectAssetSummaryItem[]> {
    try {
      const res = await api.get<ProjectAssetSummaryItem[]>("/project-assets/active-summary");
      return res.data;
    } catch {
      return [];
    }
  },

  async myProjectIds(): Promise<string[]> {
    try {
      const res = await api.get<string[]>("/project-assets/my-project-ids");
      return res.data;
    } catch {
      return [];
    }
  },
};

export interface WorkloadSummaryItem {
  userId: string;
  fullName: string;
  notStarted: number;
  inProgress: number;
  totalAssigned: number;
}

export interface ProjectAssetSummaryItem {
  projectId: string;
  notStarted: number;
  inProgress: number;
  complete: number;
  total: number;
}
