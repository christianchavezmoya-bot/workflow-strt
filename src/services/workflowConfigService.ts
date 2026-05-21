import api from "./api";
import type { WorkflowConfig, UpsertWorkflowConfigInput, WorkflowConfigStatus } from "../types/workflowConfig";

export const workflowConfigService = {
  async getAll(status?: WorkflowConfigStatus): Promise<WorkflowConfig[]> {
    const params = status ? `?status=${status}` : "";
    const res = await api.get<WorkflowConfig[]>(`/workflow-configs${params}`);
    return res.data;
  },

  async listByProduct(productId: string, status?: WorkflowConfigStatus): Promise<WorkflowConfig[]> {
    const params = status ? `?status=${status}` : "";
    const res = await api.get<WorkflowConfig[]>(`/workflow-configs/by-product/${productId}${params}`);
    return res.data;
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
    return res.data;
  },

  async update(id: string, input: Partial<UpsertWorkflowConfigInput>): Promise<WorkflowConfig> {
    const res = await api.put<WorkflowConfig>(`/workflow-configs/${id}`, input);
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

  async remove(id: string, _productId: string): Promise<void> {
    await api.delete(`/workflow-configs/${id}`);
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
