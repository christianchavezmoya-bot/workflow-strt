import api from "./api";
import type { WorkflowConfigFeature } from "../types/workflowConfigFeature";

export interface UpsertWorkflowConfigFeaturePayload {
  workflowConfigId: string;
  featureId: string;
  quantity?: number;
  inclusionsJson?: string;
  sortOrder?: number;
}

export const workflowConfigFeatureService = {
  async getByConfig(workflowConfigId: string): Promise<WorkflowConfigFeature[]> {
    const res = await api.get<WorkflowConfigFeature[]>("/workflow-config-features", {
      params: { workflowConfigId },
    });
    return res.data;
  },

  /** Create or replace the feature entry for a config (upsert by configId+featureId). */
  async upsert(payload: UpsertWorkflowConfigFeaturePayload): Promise<WorkflowConfigFeature> {
    const res = await api.post<WorkflowConfigFeature>("/workflow-config-features", payload);
    return res.data;
  },

  async update(id: string, payload: Omit<UpsertWorkflowConfigFeaturePayload, "workflowConfigId" | "featureId">): Promise<WorkflowConfigFeature> {
    const res = await api.put<WorkflowConfigFeature>(`/workflow-config-features/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/workflow-config-features/${id}`);
  },
};
