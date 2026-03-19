import api from "./api";
import type { WorkflowAssignment } from "../types/workflowType";

export const assetWorkflowAssignmentService = {
  async listByAsset(assetId: string): Promise<WorkflowAssignment[]> {
    try {
      const res = await api.get<WorkflowAssignment[]>(`/asset-workflow-assignments/by-asset/${assetId}`);
      return res.data;
    } catch (err: unknown) {
      console.warn("[assetWorkflowAssignmentService] listByAsset failed", err);
      return [];
    }
  },

  async create(assetId: string, workflowConfigId: string, workflowTypeId: string): Promise<WorkflowAssignment> {
    const res = await api.post<WorkflowAssignment>("/asset-workflow-assignments", {
      assetId,
      workflowConfigId,
      workflowTypeId,
    });
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/asset-workflow-assignments/${id}`);
  },
};
