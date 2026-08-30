/**
 * Authoritative 404 purge — only call when GET /project-assets/{id} returned HTTP 404.
 *
 * "Known missing" and "safe to delete locally" are separate states. A 404 always
 * stops further background GETs for the id, but the local asset row, its runs,
 * and any queued sync actions are only deleted once nothing queued still
 * depends on them — otherwise field work (photos, signatures, time entries,
 * issues, step results — all queued as PendingAction rows keyed by the asset or
 * one of its runs) would silently disappear out from under the technician.
 */

import {
  entityDeleteAsset,
  entityGetAsset,
  entityGetWorkflowRunsByAsset,
  pendingGetAll,
  pendingMarkConflict,
  type PendingAction,
} from "../services/localDB";
import offlineStore from "../services/offlineStore";
import type { DashboardWorkspace } from "../services/projectAssetService";
import { markKnownMissingAssetId } from "./staleAssetIds";
import { stripAssetIdFromWorkspace } from "./staleAssetWorkspace";
import { secureGet } from "../services/secureStorage";
import { isMobileNativePlatform } from "./platform";

export const DASHBOARD_WORKSPACE_CACHE_KEY = (userId: string) => `dashboard-workspace:${userId}`;

function resolveUserIdFromAuthCache(): string | undefined {
  try {
    const raw = secureGet("auth_user");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function stripAssetFromWorkspaceCache(
  assetId: string,
  userId?: string,
): Promise<void> {
  if (!isMobileNativePlatform()) return;
  const uid = userId ?? resolveUserIdFromAuthCache();
  if (!uid) return;

  const key = DASHBOARD_WORKSPACE_CACHE_KEY(uid);
  const cached = await offlineStore.getCache<DashboardWorkspace>(key);
  if (!cached) return;

  const next = stripAssetIdFromWorkspace(cached, assetId);
  await offlineStore.saveCache(key, next);
}

/**
 * Every offline mutation (asset edits, run create/step/complete, document links,
 * and the photos/signatures/time entries/issues bundled into run payloads) is
 * queued as a PendingAction keyed by either the asset's own id or one of its
 * run ids. Match on both, plus a substring fallback on the serialized action so
 * a queued mutation type we haven't enumerated here still counts as "unsynced
 * work tied to this asset" rather than being silently missed.
 */
async function findUnsyncedActionsForAsset(assetId: string): Promise<PendingAction[]> {
  const [actions, runs] = await Promise.all([
    pendingGetAll(),
    entityGetWorkflowRunsByAsset(assetId) as Promise<Array<{ id?: string } | undefined>>,
  ]);
  const runIds = new Set(runs.map((r) => r?.id).filter((id): id is string => Boolean(id)));

  return actions.filter((action) => {
    if (action.entityId === assetId) return true;
    if (action.entityId && runIds.has(action.entityId)) return true;
    try {
      return JSON.stringify(action).includes(assetId);
    } catch {
      return false;
    }
  });
}

async function assetHasUnsyncedLocalWork(assetId: string): Promise<{
  hasUnsyncedWork: boolean;
  unsyncedActions: PendingAction[];
}> {
  const [asset, runs, unsyncedActions] = await Promise.all([
    entityGetAsset(assetId),
    entityGetWorkflowRunsByAsset(assetId) as Promise<Array<{ dirty?: boolean } | undefined>>,
    findUnsyncedActionsForAsset(assetId),
  ]);

  const hasUnsyncedWork =
    Boolean(asset?.dirty)
    || runs.some((run) => run?.dirty === true)
    || unsyncedActions.length > 0;

  return { hasUnsyncedWork, unsyncedActions };
}

/**
 * Handle a confirmed server-missing asset. Always marks the id known-missing so
 * background prefetch/verify stops requesting it — regardless of which branch
 * below runs. Only deletes local data when nothing queued depends on it; when
 * unsynced work exists, the asset row, its runs, and every queued action are
 * left untouched and the queued actions are flagged via the existing
 * conflict-diagnostics channel for the user to resolve — never auto-discarded,
 * never auto-recreated on the server.
 */
export async function purgeStaleAssetOnAuthoritative404(
  assetId: string,
  userId?: string,
): Promise<void> {
  if (!assetId) return;

  const { hasUnsyncedWork, unsyncedActions } = await assetHasUnsyncedLocalWork(assetId);

  markKnownMissingAssetId(assetId);

  if (hasUnsyncedWork) {
    await Promise.all(unsyncedActions.map((action) =>
      pendingMarkConflict(action.id, {
        conflictHttpStatus: 404,
        conflictKind: "business_rule",
        conflictMessage: "This asset no longer exists on the server. Resolve before it can sync.",
      })
    ));
    return;
  }

  await entityDeleteAsset(assetId);
  await stripAssetFromWorkspaceCache(assetId, userId);
}
