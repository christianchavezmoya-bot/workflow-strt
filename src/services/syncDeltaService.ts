/**
 * Delta sync — fetch changed entity ids since last bootstrap and refresh locally.
 */

import api from "./api";
import { isMobileNativePlatform } from "../utils/platform";
import { getLastBootstrapMs, clearServerChangeFlag } from "../utils/bootstrapFreshness";
import { projectAssetService } from "./projectAssetService";
import { assetWorkflowRunService } from "./assetWorkflowRunService";
import { prefetchAssetIds } from "./assetPrefetchService";

export interface SyncChangesPayload {
  serverTime: string;
  projectIds: string[];
  assetIds: string[];
  runIds: string[];
  totalChanges: number;
}

/** Max entities a delta pass will handle before falling back to full bootstrap. */
export const DELTA_CHANGE_LIMIT = 150;

export async function fetchSyncChanges(sinceIso: string): Promise<SyncChangesPayload | null> {
  if (!isMobileNativePlatform()) return null;
  try {
    const res = await api.get<SyncChangesPayload>("/sync/changes", { params: { since: sinceIso } });
    return res.data;
  } catch {
    return null;
  }
}

/**
 * Apply server delta when change count is modest. Returns true when delta fully handled
 * and a full bootstrap can be skipped.
 */
export async function tryApplySyncDelta(): Promise<boolean> {
  if (!isMobileNativePlatform()) return false;

  const sinceMs = await getLastBootstrapMs();
  if (sinceMs === null) return false;

  const sinceIso = new Date(sinceMs).toISOString();
  const changes = await fetchSyncChanges(sinceIso);
  if (!changes || changes.totalChanges === 0) {
    await clearServerChangeFlag();
    return true;
  }
  if (changes.totalChanges > DELTA_CHANGE_LIMIT) return false;

  const runAssetIds = changes.runIds.length > 0
    ? await resolveAssetIdsForRuns(changes.runIds)
    : [];
  const allAssetIds = [...new Set([...changes.assetIds, ...runAssetIds])];

  await Promise.allSettled(
    allAssetIds.slice(0, DELTA_CHANGE_LIMIT).map((id) =>
      projectAssetService.getById(id).catch(() => null),
    ),
  );

  if (allAssetIds.length > 0) {
    await prefetchAssetIds(allAssetIds.slice(0, 40));
  }

  for (const runId of changes.runIds.slice(0, 60)) {
    try {
      await assetWorkflowRunService.getById(runId);
    } catch {
      /* non-fatal */
    }
  }

  await clearServerChangeFlag();
  return true;
}

async function resolveAssetIdsForRuns(runIds: string[]): Promise<string[]> {
  const ids: string[] = [];
  await Promise.allSettled(
    runIds.map(async (runId) => {
      const run = await assetWorkflowRunService.getById(runId);
      if (run?.assetId) ids.push(run.assetId);
    }),
  );
  return ids;
}
