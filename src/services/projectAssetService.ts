import api from "./api";
import type { ProjectAsset, CreateProjectAssetInput, ProjectAssetStatus } from "../types/projectAsset";

const LS_KEY_PROJECT = (projectId: string) => `project_assets_v1_${projectId}`;
const LS_KEY_PRODUCT = (productId: string) => `project_assets_prod_v1_${productId}`;

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
      const res = await api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`);
      try { localStorage.setItem(LS_KEY_PROJECT(projectId), JSON.stringify(res.data)); } catch {}
      return res.data.map(fromDto);
    } catch (err: unknown) {
      console.warn("[projectAssetService] API unavailable, falling back to localStorage", err);
      try {
        const raw = localStorage.getItem(LS_KEY_PROJECT(projectId));
        if (raw) return (JSON.parse(raw) as ProjectAsset[]).map(fromDto);
      } catch {}
      return [];
    }
  },

  async listByProduct(productId: string): Promise<ProjectAsset[]> {
    try {
      const res = await api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`);
      try { localStorage.setItem(LS_KEY_PRODUCT(productId), JSON.stringify(res.data)); } catch {}
      return res.data.map(fromDto);
    } catch (err: unknown) {
      console.warn("[projectAssetService] API unavailable, falling back to localStorage", err);
      try {
        const raw = localStorage.getItem(LS_KEY_PRODUCT(productId));
        if (raw) return (JSON.parse(raw) as ProjectAsset[]).map(fromDto);
      } catch {}
      return [];
    }
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

  async getById(id: string): Promise<ProjectAsset | null> {
    try {
      const res = await api.get<ProjectAsset>(`/project-assets/${id}`);
      return fromDto(res.data);
    } catch {
      return null;
    }
  },

  async update(id: string, patch: Partial<CreateProjectAssetInput> & { status?: string; workOrderId?: string }): Promise<ProjectAsset> {
    const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
    return fromDto(res.data);
  },

  async patchIssues(id: string, issuesJson: string): Promise<ProjectAsset> {
    const res = await api.patch<ProjectAsset>(`/project-assets/${id}/issues`, { issuesJson });
    return fromDto(res.data);
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

  async listOpen(): Promise<OpenAssetItem[]> {
    try {
      const res = await api.get<OpenAssetItem[]>("/project-assets/open");
      return res.data;
    } catch {
      return [];
    }
  },
};

export interface OpenAssetItem {
  id: string;
  projectId: string;
  jobNumber: string;
  office: string;
  officeId?: string;
  assetTag?: string;
  assetName?: string;
  assetModel?: string;
  manufacturer?: string;
  status: string;
  assignedUserId?: string;
  location?: string;
}

export interface WorkloadSummaryItem {
  userId: string;
  fullName: string;
  notStarted: number;
  inProgress: number;
  totalAssigned: number;
  jobNumbers: string[];
  hasIssues: boolean;
  completedSteps: number;
  totalSteps: number;
  startedAt?: string;
}
