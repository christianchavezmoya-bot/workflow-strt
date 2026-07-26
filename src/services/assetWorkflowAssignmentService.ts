import axios from "axios";
import api from "./api";
import type { WorkflowAssignment } from "../types/workflowType";
import syncQueue from "./syncQueue";
import { isMobileNativePlatform } from "../utils/platform";
import { randomId } from "../utils/randomId";
import { invalidateWebCache } from "./webFreshCache";
import { WorkflowAssignmentRepository } from "../repositories/WorkflowAssignmentRepository";
import { isOfflineNetworkError } from "../utils/offlineNetworkError";

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
    // Web path — always goes to the server, no offline handling needed.
    if (!isMobileNativePlatform()) {
      const res = await api.post<WorkflowAssignment>("/asset-workflow-assignments", {
        assetId,
        workflowConfigId,
        workflowTypeId,
      });
      invalidateWebCache(`/asset-workflow-assignments/by-asset/${assetId}`);
      return res.data;
    }

    // ── Mobile native path ──────────────────────────────────────────
    // 1. Optimistically write a temp assignment to the local cache so the
    //    UI updates immediately (the workflow becomes startable offline).
    const tempId = `local-${randomId()}`;
    const optimistic = {
      id: tempId,
      assetId,
      workflowConfigId,
      workflowTypeId,
      createdAt: new Date().toISOString(),
    } as unknown as WorkflowAssignment;

    try {
      const current = await WorkflowAssignmentRepository.getLocalByAsset(assetId);
      await WorkflowAssignmentRepository.replaceByAsset(assetId, [
        ...current.filter((a) => a.workflowConfigId !== workflowConfigId),
        optimistic,
      ]);
    } catch { /* non-fatal — optimistic write best-effort */ }

    // 2. Try the server call.
    try {
      const res = await api.post<WorkflowAssignment>("/asset-workflow-assignments", {
        assetId,
        workflowConfigId,
        workflowTypeId,
      });
      // Replace the temp entry with the real server record.
      try {
        const updated = await WorkflowAssignmentRepository.getLocalByAsset(assetId);
        await WorkflowAssignmentRepository.replaceByAsset(assetId, [
          ...updated.filter((a) => a.id !== tempId && a.id !== res.data.id),
          res.data,
        ]);
      } catch { /* non-fatal */ }
      return res.data;
    } catch (error) {
      if (isOfflineNetworkError(error)) {
        await syncQueue.enqueue({
          opType: "WORKFLOW_ASSIGNMENT_CREATE",
          url: "/asset-workflow-assignments",
          method: "POST",
          body: { assetId, workflowConfigId, workflowTypeId },
          entityType: "workflowAssignment",
          entityId: tempId,
          optimisticPatch: { assetId, workflowConfigId, workflowTypeId } as unknown as Record<string, unknown>,
        });
        return optimistic;
      }
      throw error;
    }
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
      if (isOfflineNetworkError(error)) {
        await syncQueue.enqueue({
          opType: "WORKFLOW_ASSIGNMENT_DELETE",
          url: `/asset-workflow-assignments/${id}`,
          method: "DELETE",
          entityType: "workflowAssignment",
          entityId: id,
          optimisticPatch: {},
        });
        return;
      }
      throw error;
    }
  },
};
