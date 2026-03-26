import api from "./api";
import type { ProjectAsset, CreateProjectAssetInput, ProjectAssetStatus } from "../types/projectAsset";
import { pendingGetAll } from "./localDB";
import { AssetRepository } from "../repositories/AssetRepository";

function normalizeStatus(raw: unknown): ProjectAssetStatus {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "inprogress") return "InProgress";
  if (value === "complete" || value === "completed") return "Complete";
  if (value === "issue" || value === "issues") return "Issue";
  return "NotStarted";
}

function fromDto(dto: ProjectAsset): ProjectAsset {
  return { ...dto, status: normalizeStatus(dto.status) };
}

/** Return all asset IDs that have a pending action queued. */
export async function pendingAssetIds(): Promise<Set<string>> {
  const all = await pendingGetAll();
  return new Set(all.filter((a) => a.entityType === "asset").map((a) => a.entityId));
}

export const projectAssetService = {
  async listByProject(projectId: string): Promise<ProjectAsset[]> {
    try { return await AssetRepository.getByProject(projectId); }
    catch { return []; }
  },

  async listByProduct(productId: string): Promise<ProjectAsset[]> {
    try { return await AssetRepository.getByProduct(productId); }
    catch { return []; }
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
    const result = await AssetRepository.update(id, patch as Partial<ProjectAsset> & Record<string, unknown>);
    if (result === null) throw new Error("Offline — change queued");
    return result;
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
