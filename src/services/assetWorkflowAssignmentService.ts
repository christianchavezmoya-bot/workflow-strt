import axios from "axios";
import api from "./api";
import type { WorkflowAssignment } from "../types/workflowType";
import { pendingAdd } from "./localDB";
import { isMobileNativePlatform } from "../utils/platform";
import { invalidateWebCache } from "./webFreshCache";
import { WorkflowAssignmentRepository } from "../repositories/WorkflowAssignmentRepository";

export const assetWorkflowAssignmentService = {
  /**
   * Local-first on native (via WorkflowAssignmentRepository) so a technician can
   * start a not-yet-opened workflow while offline; short-lived server-confirmed
   * cache on web.
   */
  async listByAsset(assetId: string): Promise<WorkflowAssignment[]> {
    return WorkflowAssignmentRepository.listByAsset(assetId);
  },

  async create(assetId: string, workflowConfigId: string, workflowTypeId: string): Promise<WorkflowAssignment> {
    const res = await api.post<WorkflowAssignment>("/asset-workflow-assignments", {
      assetId,
      workflowConfigId,
      workflowTypeId,
    });
    invalidateWebCache(`/asset-workflow-assignments/by-asset/${assetId}`);
    // Keep the offline cache in sync so the new assignment is immediately
    // startable offline without waiting for the next background refresh.
    if (isMobileNativePlatform()) {
      try {
        const current = await WorkflowAssignmentRepository.getLocalByAsset(assetId);
        await WorkflowAssignmentRepository.replaceByAsset(assetId, [
          ...current.filter((a) => a.id !== res.data.id),
          res.data,
        ]);
      } catch { /* non-fatal */ }
    }
    return res.data;
  },

  async remove(id: string, assetId?: string): Promise<void> {
    // Drop from the offline cache first so the UI reflects the removal even
    // if the network call is queued.
    if (isMobileNativePlatform() && assetId) {
      try {
        const current = await WorkflowAssignmentRepository.getLocalByAsset(assetId);
        await WorkflowAssignmentRepository.replaceByAsset(assetId, current.filter((a) => a.id !== id));
      } catch { /* non-fatal */ }
    }

    if (!isMobileNativePlatform()) {
      await api.delete(`/asset-workflow-assignments/${id}`);
      if (assetId) invalidateWebCache(`/asset-workflow-assignments/by-asset/${assetId}`);
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
