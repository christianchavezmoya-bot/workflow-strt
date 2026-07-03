import api from "../services/api";
import type { WorkflowAssignment } from "../types/workflowType";
import {
  entityGetAssignmentsByAsset,
  entityReplaceAssignmentsByAsset,
  syncMetaSet,
} from "../services/localDB";
import { shouldSkipBlockingFetch } from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet } from "../services/webFreshCache";

/**
 * WorkflowAssignmentRepository — local-first access to asset → workflow config
 * assignments. This is the piece that lets a technician START a workflow they
 * have never opened before while offline: the assignment (which config to run)
 * must already be on the device.
 *
 * Mobile native: read IndexedDB immediately, refresh from the network in the
 * background. Web: short-lived in-memory cache confirmed against the server.
 */
export const WorkflowAssignmentRepository = {
  async getLocalByAsset(assetId: string): Promise<WorkflowAssignment[]> {
    const local = await entityGetAssignmentsByAsset(assetId);
    return local as WorkflowAssignment[];
  },

  /** Persist a freshly-fetched assignment list for an asset (used by bootstrap + refresh). */
  async replaceByAsset(assetId: string, assignments: WorkflowAssignment[]): Promise<void> {
    await entityReplaceAssignmentsByAsset(
      assetId,
      assignments.map((a) => ({ id: a.id, assetId: a.assetId, data: a }))
    );
  },

  async listByAsset(assetId: string): Promise<WorkflowAssignment[]> {
    if (!isMobileNativePlatform()) {
      try {
        // Short TTL — feeds the "assigned to someone else" reassignment check,
        // which should stay close to live.
        return await webCachedGet(
          `/asset-workflow-assignments/by-asset/${assetId}`,
          async () => {
            const res = await api.get<WorkflowAssignment[]>(`/asset-workflow-assignments/by-asset/${assetId}`);
            return res.data;
          },
          { ttlMs: 8_000 }
        );
      } catch {
        return [];
      }
    }

    const local = await this.getLocalByAsset(assetId);

    // Background refresh keeps the cache warm for offline starts.
    api.get<WorkflowAssignment[]>(`/asset-workflow-assignments/by-asset/${assetId}`)
      .then(async (res) => {
        await this.replaceByAsset(assetId, res.data);
        await syncMetaSet("workflow_assignments");
        window.dispatchEvent(new CustomEvent("repo:assignments:updated", { detail: { assetId } }));
      })
      .catch(() => { /* offline — local cache is the source of truth */ });

    if (local.length > 0) return local;

    if (shouldSkipBlockingFetch()) return [];

    try {
      const res = await api.get<WorkflowAssignment[]>(`/asset-workflow-assignments/by-asset/${assetId}`);
      await this.replaceByAsset(assetId, res.data);
      return res.data;
    } catch {
      return [];
    }
  },
};

export default WorkflowAssignmentRepository;
