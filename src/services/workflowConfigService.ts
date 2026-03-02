import api from "./api";
import type { WorkflowConfig, UpsertWorkflowConfigInput, WorkflowConfigStatus } from "../types/workflowConfig";

const LS_KEY = (productId: string) => `workflow_configs_v1_${productId}`;

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

export const workflowConfigService = {
  async listByProduct(productId: string, status?: WorkflowConfigStatus): Promise<WorkflowConfig[]> {
    try {
      const params = status ? `?status=${status}` : "";
      const res = await api.get<WorkflowConfig[]>(`/workflow-configs/by-product/${productId}${params}`);
      // Only cache unfiltered results — a status-filtered response would corrupt the cache
      // for callers that need all statuses (e.g. WorkInstructions table).
      if (!status) lsWrite(productId, res.data);
      return res.data;
    } catch (err: unknown) {
      console.warn("[workflowConfigService] API unavailable, falling back to localStorage", err);
      const cached = lsRead(productId);
      return status ? cached.filter((c) => c.status === status) : cached;
    }
  },

  async getById(id: string): Promise<WorkflowConfig | null> {
    try {
      const res = await api.get<WorkflowConfig>(`/workflow-configs/${id}`);
      return res.data;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      console.warn("[workflowConfigService] getById failed", err);
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
