import api from "./api";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";

export const projectInspectionRunService = {
  async list(projectId: string, projectAssetId: string): Promise<AssetWorkflowRun[]> {
    const res = await api.get<AssetWorkflowRun[]>(`/projects/${projectId}/assets/${projectAssetId}/inspections/runs`);
    return res.data;
  },

  async create(projectId: string, projectAssetId: string, payload: { workflowConfigId: string; technicianUserId?: string }): Promise<AssetWorkflowRun> {
    const res = await api.post<AssetWorkflowRun>(
      `/projects/${projectId}/assets/${projectAssetId}/inspections/runs`,
      payload
    );
    return res.data;
  },
};

