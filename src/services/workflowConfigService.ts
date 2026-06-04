import api from "./api";
import type { WorkflowConfig, UpsertWorkflowConfigInput, WorkflowConfigStatus } from "../types/workflowConfig";
import offlineStore from "./offlineStore";

const LS_KEY = (productId: string) => `workflow_configs_v1_${productId}`;
const CACHE_ALL_KEY = "workflow-configs:all";
const CACHE_PRODUCT_KEY = (productId: string) => `workflow-configs:product:${productId}`;
const CACHE_ID_KEY = (id: string) => `workflow-configs:id:${id}`;

function lsRead(productId: string): WorkflowConfig[] {
  try {
    const raw = localStorage.getItem(LS_KEY(productId));
    if (raw) return JSON.parse(raw) as WorkflowConfig[];
  } catch {}
  return [];
}

function lsWrite(productId: string, configs: WorkflowConfig[]) {
  try { localStorage.setItem(LS_KEY(productId), JSON.stringify(configs)); } catch {}
}

function lsReadAll(): WorkflowConfig[] {
  try {
    const prefix = "workflow_configs_v1_";
    const all: WorkflowConfig[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const items = JSON.parse(raw) as WorkflowConfig[];
          for (const item of items) {
            if (!seen.has(item.id)) { seen.add(item.id); all.push(item); }
          }
        }
      }
    }
    return all;
  } catch { return []; }
}

async function cacheConfigs(configs: WorkflowConfig[]): Promise<void> {
  await Promise.all(configs.map((config) => offlineStore.saveCache(CACHE_ID_KEY(config.id), config)));
}

export const workflowConfigService = {
  async getAll(status?: WorkflowConfigStatus): Promise<WorkflowConfig[]> {
    try {
      const params = status ? `?status=${status}` : "";
      const res = await api.get<WorkflowConfig[]>(`/workflow-configs${params}`);
      if (!status) await offlineStore.saveCache(CACHE_ALL_KEY, res.data);
      await cacheConfigs(res.data);
      return res.data;
    } catch {
      const cached = !status ? await offlineStore.getCache<WorkflowConfig[]>(CACHE_ALL_KEY) : null;
      const all = cached ?? lsReadAll();
      return status ? all.filter((c) => c.status === status) : all;
    }
  },

  async listByProduct(productId: string, status?: WorkflowConfigStatus): Promise<WorkflowConfig[]> {
    try {
      const params = status ? `?status=${status}` : "";
      const res = await api.get<WorkflowConfig[]>(`/workflow-configs/by-product/${productId}${params}`);
      // Only cache unfiltered results — a status-filtered response would corrupt the cache
      // for callers that need all statuses (e.g. WorkInstructions table).
      if (!status) {
        lsWrite(productId, res.data);
        await offlineStore.saveCache(CACHE_PRODUCT_KEY(productId), res.data);
      }
      await cacheConfigs(res.data);
      return res.data;
    } catch (err: unknown) {
      console.warn("[workflowConfigService] API unavailable, falling back to localStorage", err);
      const cached = !status ? await offlineStore.getCache<WorkflowConfig[]>(CACHE_PRODUCT_KEY(productId)) : null;
      if (cached && cached.length > 0) return status ? cached.filter((c) => c.status === status) : cached;
      const local = lsRead(productId);
      return status ? local.filter((c) => c.status === status) : local;
    }
  },

  async getById(id: string): Promise<WorkflowConfig | null> {
    try {
      const res = await api.get<WorkflowConfig>(`/workflow-configs/${id}`);
      await offlineStore.saveCache(CACHE_ID_KEY(id), res.data);
      return res.data;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      const cached = await offlineStore.getCache<WorkflowConfig>(CACHE_ID_KEY(id));
      if (cached) return cached;
      const all = lsReadAll();
      const local = all.find((c) => c.id === id);
      if (local) return local;
      return null;
    }
  },

  async create(input: UpsertWorkflowConfigInput): Promise<WorkflowConfig> {
    const res = await api.post<WorkflowConfig>("/workflow-configs", input);
    const configs = lsRead(input.productId);
    configs.unshift(res.data);
    lsWrite(input.productId, configs);
    return res.data;
  },

  async update(id: string, input: Partial<UpsertWorkflowConfigInput>): Promise<WorkflowConfig> {
    const res = await api.put<WorkflowConfig>(`/workflow-configs/${id}`, input);
    const configs = lsRead(res.data.productId).map((c) => (c.id === id ? res.data : c));
    lsWrite(res.data.productId, configs);
    return res.data;
  },

  async publish(id: string): Promise<WorkflowConfig> {
    const res = await api.post<WorkflowConfig>(`/workflow-configs/${id}/publish`);
    return res.data;
  },

  async archive(id: string): Promise<WorkflowConfig> {
    const res = await api.post<WorkflowConfig>(`/workflow-configs/${id}/archive`);
    return res.data;
  },

  async clone(id: string): Promise<WorkflowConfig> {
    const res = await api.post<WorkflowConfig>(`/workflow-configs/${id}/clone`);
    return res.data;
  },

  async remove(id: string, productId: string): Promise<void> {
    await api.delete(`/workflow-configs/${id}`);
    const configs = lsRead(productId).filter((c) => c.id !== id);
    lsWrite(productId, configs);
  },

  async uploadMedia(id: string, file: File): Promise<WorkflowConfig> {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post<WorkflowConfig>(`/workflow-configs/${id}/media`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async deleteMedia(id: string, mediaId: string): Promise<WorkflowConfig> {
    const res = await api.delete<WorkflowConfig>(`/workflow-configs/${id}/media/${mediaId}`);
    return res.data;
  },
};
