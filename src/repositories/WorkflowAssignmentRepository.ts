import api from "../services/api";
import type { WorkflowAssignment } from "../types/workflowType";
import {
  entityGetAssignmentsByAsset,
  entityReplaceAssignmentsByAsset,
  syncMetaSet,
} from "../services/localDB";
import { shouldSkipBlockingFetch } from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "../utils/platform";
import { shouldDeferPerAssetBackgroundRefresh } from "../utils/nativeReconnectCoordinator";
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
function isLocalId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith("local-");
}

/** Reads later than any real timestamp lose every tie-break, instead of throwing on NaN. */
function assignedAtMs(assignment: WorkflowAssignment): number {
  const raw = assignment.assignedAt ?? (assignment as { createdAt?: string }).createdAt;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * One assignment per workflow config — prefer server id over offline `local-*`
 * temp rows. Defensive against malformed records (missing/non-string id,
 * unparseable assignedAt) instead of throwing, since a thrown error here gets
 * swallowed upstream into "no assignment" by callers' `.catch(() => [])`.
 */
function dedupeAssignmentsByConfig(assignments: WorkflowAssignment[]): WorkflowAssignment[] {
  const byConfig = new Map<string, WorkflowAssignment>();
  for (const assignment of assignments) {
    if (!assignment || typeof assignment.workflowConfigId !== "string" || !assignment.workflowConfigId) {
      continue;
    }
    const key = assignment.workflowConfigId;
    const existing = byConfig.get(key);
    if (!existing) {
      byConfig.set(key, assignment);
      continue;
    }
    const existingIsLocal = isLocalId(existing.id);
    const currentIsLocal = isLocalId(assignment.id);
    if (existingIsLocal && !currentIsLocal) {
      byConfig.set(key, assignment);
      continue;
    }
    if (!existingIsLocal && currentIsLocal) continue;
    if (assignedAtMs(assignment) >= assignedAtMs(existing)) byConfig.set(key, assignment);
  }
  return Array.from(byConfig.values());
}

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
    return dedupeAssignmentsByConfig(local as WorkflowAssignment[]);
  },

  /** Persist a freshly-fetched assignment list for an asset (used by bootstrap + refresh). */
  async replaceByAsset(assetId: string, assignments: WorkflowAssignment[]): Promise<void> {
    const deduped = dedupeAssignmentsByConfig(assignments);
    await entityReplaceAssignmentsByAsset(
      assetId,
      deduped.map((a) => ({ id: a.id, assetId: a.assetId, data: a }))
    );
    prefetchAssignedConfigs(deduped);
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

    // Background refresh keeps the cache warm for offline starts. Skip when offline
    // or while reconnect flush/bootstrap is already prefetching the same assets.
    if (!shouldSkipBlockingFetch() && !shouldDeferPerAssetBackgroundRefresh()) {
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

  /** Single network fetch + cache — used by bootstrap to avoid duplicate background GETs. */
  async prefetchFromNetwork(assetId: string): Promise<void> {
    if (!isMobileNativePlatform() || shouldSkipBlockingFetch()) return;
    try {
      const res = await api.get<WorkflowAssignment[]>(`/asset-workflow-assignments/by-asset/${assetId}`);
      await this.replaceByAsset(assetId, res.data);
      await syncMetaSet("workflow_assignments");
      window.dispatchEvent(new CustomEvent("repo:assignments:updated", { detail: { assetId } }));
    } catch {
      /* non-fatal */
    }
  },
};

export default WorkflowAssignmentRepository;
