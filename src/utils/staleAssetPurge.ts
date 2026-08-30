/**
 * Authoritative 404 purge — only call when GET /project-assets/{id} returned HTTP 404.
 */

import { entityDeleteAsset } from "../services/localDB";
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

/** Drop ghost asset from every local index that re-supplies dashboard prefetch ids. */
export async function purgeStaleAssetOnAuthoritative404(
  assetId: string,
  userId?: string,
): Promise<void> {
  if (!assetId) return;
  markKnownMissingAssetId(assetId);
  await entityDeleteAsset(assetId);
  await stripAssetFromWorkspaceCache(assetId, userId);
}
