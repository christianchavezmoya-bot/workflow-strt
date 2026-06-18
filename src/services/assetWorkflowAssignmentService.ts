import axios from "axios";
import api from "./api";
import type { WorkflowAssignment } from "../types/workflowType";
import { pendingAdd } from "./localDB";
import { isMobileNativePlatform } from "../utils/platform";

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
    if (!isMobileNativePlatform()) {
      await api.delete(`/asset-workflow-assignments/${id}`);
      return;
    }

    try {
      await api.delete(`/asset-workflow-assignments/${id}`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return;
      if (axios.isAxiosError(error) && !error.response) {
        await pendingAdd({
          id: crypto.randomUUID(),
          url: `/asset-workflow-assignments/${id}`,
          method: "DELETE",
          body: undefined,
          entityType: "workflowAssignment",
          entityId: id,
          optimisticPatch: {},
          createdAt: new Date().toISOString(),
        });
        return;
      }
      throw error;
    }
  },
};
