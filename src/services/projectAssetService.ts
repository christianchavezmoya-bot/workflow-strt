import api from "./api";
import type { ProjectAsset, CreateProjectAssetInput, ProjectAssetStatus } from "../types/projectAsset";
import { pendingAdd, pendingGetAll } from "./localDB";

const LS_KEY_PROJECT = (projectId: string) => `project_assets_v1_${projectId}`;
const LS_KEY_PRODUCT = (productId: string) => `project_assets_prod_v1_${productId}`;

// ── Optimistic cache helpers ──────────────────────────────────────────────────

/** Apply a patch to every localStorage cache entry that contains this asset id. */
function applyPatchToCache(id: string, patch: Record<string, unknown>): void {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || (!key.startsWith("project_assets_v1_") && !key.startsWith("project_assets_prod_v1_"))) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const list = JSON.parse(raw) as ProjectAsset[];
      const idx = list.findIndex((a) => a.id === id);
      if (idx === -1) continue;
      list[idx] = { ...list[idx], ...patch };
      localStorage.setItem(key, JSON.stringify(list));
    }
  } catch { /* quota — ignore */ }
}

/** Build an optimistic asset from cache + patch. Returns null if not in cache. */
function buildOptimistic(id: string, patch: Record<string, unknown>): ProjectAsset | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || (!key.startsWith("project_assets_v1_") && !key.startsWith("project_assets_prod_v1_"))) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const list = JSON.parse(raw) as ProjectAsset[];
      const asset = list.find((a) => a.id === id);
      if (asset) return fromDto({ ...asset, ...patch } as ProjectAsset);
    }
  } catch { /* ignore */ }
  return null;
}

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

  async update(id: string, patch: Partial<CreateProjectAssetInput> & { status?: string; workOrderId?: string }): Promise<ProjectAsset> {
    try {
      const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
      const updated = fromDto(res.data);
      // Keep localStorage cache in sync after a successful server write
      applyPatchToCache(id, res.data as unknown as Record<string, unknown>);
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
      applyPatchToCache(id, patchRecord);
      const optimistic = buildOptimistic(id, patchRecord);
      if (optimistic) return optimistic;
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
