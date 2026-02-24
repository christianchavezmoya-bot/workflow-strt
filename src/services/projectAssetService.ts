import api from "./api";
import type { ProjectAsset, CreateProjectAssetInput } from "../types/projectAsset";

const LS_KEY_PROJECT = (projectId: string) => `project_assets_v1_${projectId}`;
const LS_KEY_PRODUCT = (productId: string) => `project_assets_prod_v1_${productId}`;

function fromDto(dto: ProjectAsset): ProjectAsset {
  return dto;
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
        if (raw) return JSON.parse(raw) as ProjectAsset[];
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
        if (raw) return JSON.parse(raw) as ProjectAsset[];
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

  async update(id: string, patch: Partial<CreateProjectAssetInput> & { status?: string; workOrderId?: string }): Promise<ProjectAsset> {
    const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
    return fromDto(res.data);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/project-assets/${id}`);
  },
};
