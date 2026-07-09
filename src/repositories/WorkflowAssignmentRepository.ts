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
import { workflowConfigService } from "../services/workflowConfigService";

/**
 * Ensure each assignment's workflow config (steps + reference media, via
 * workflowConfigService.getById's own caching) is on the device the moment
 * the assignment itself becomes known — not only when the technician opens
 * or starts that specific run. Without this, a workflow assigned from the
 * web while the phone never happens to fetch that product's full config
 * list (e.g. bootstrap hasn't re-run since) stays invisible/unusable offline
 * even though the assignment record itself is cached. Fire-and-forget,
 * idempotent (getById/prefetchConfig both skip already-cached work).
 */
function prefetchAssignedConfigs(assignments: WorkflowAssignment[]): void {
  if (!isMobileNativePlatform()) return;
  const configIds = [...new Set(assignments.map((a) => a.workflowConfigId).filter(Boolean))];
  for (const configId of configIds) {
    workflowConfigService.getById(configId).catch(() => {});
  }
}

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
    prefetchAssignedConfigs(assignments);
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

    // Background refresh keeps the cache warm for offline starts. Skip when offline.
    if (!shouldSkipBlockingFetch()) {
      api.get<WorkflowAssignment[]>(`/asset-workflow-assignments/by-asset/${assetId}`)
        .then(async (res) => {
          await this.replaceByAsset(assetId, res.data);
          await syncMetaSet("workflow_assignments");
          window.dispatchEvent(new CustomEvent("repo:assignments:updated", { detail: { assetId } }));
        })
        .catch(() => { /* offline — local cache is the source of truth */ });
    }

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
