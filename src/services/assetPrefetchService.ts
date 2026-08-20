/**
 * Targeted prefetch of workflow data for one asset after PM assignment / SSE push.
 */

import { isMobileNativePlatform } from "../utils/platform";
import { clearServerChangeFlag } from "../utils/bootstrapFreshness";
import { entityGetAsset } from "./localDB";
import { assetWorkflowAssignmentService } from "./assetWorkflowAssignmentService";
import { assetWorkflowRunService } from "./assetWorkflowRunService";
import { assetDocumentLinkService } from "./assetDocumentLinkService";
import { workflowConfigService } from "./workflowConfigService";
import { prefetchAssetLinkedDocuments } from "./documentService";
import offlineStore from "./offlineStore";
import type { DashboardWorkspace } from "./projectAssetService";
import type { ProjectAsset } from "../types/projectAsset";

const DASHBOARD_WORKSPACE_CACHE_KEY = (userId: string) => `dashboard-workspace:${userId}`;

/** Coalesce concurrent prefetch for the same asset (workspace boot + quick actions). */
const prefetchInFlight = new Map<string, Promise<void>>();

export async function prefetchAssetWorkflowData(assetId: string): Promise<void> {
  if (!isMobileNativePlatform()) return;

  const existing = prefetchInFlight.get(assetId);
  if (existing) return existing;

  const flight = prefetchAssetWorkflowDataInner(assetId).finally(() => {
    prefetchInFlight.delete(assetId);
  });
  prefetchInFlight.set(assetId, flight);
  return flight;
}

async function prefetchAssetWorkflowDataInner(assetId: string): Promise<void> {
  const { projectAssetService } = await import("./projectAssetService");
  const cached = await entityGetAsset(assetId);
  const cachedAsset = cached?.data as ProjectAsset | undefined;
  if (!cachedAsset?.productId) {
    try {
      const full = await projectAssetService.getById(assetId);
      if (full) {
        const { entityPutAsset } = await import("./localDB");
        await entityPutAsset({
          id: full.id,
          productId: full.productId,
          projectId: full.projectId,
          data: full,
          dirty: false,
        });
      }
    } catch {
      // Continue — assignments/documents may still cache.
    }
  }

  const assignments = await assetWorkflowAssignmentService.listByAsset(assetId);
  await assetWorkflowRunService.listByAssetFresh(assetId);

  const record = await entityGetAsset(assetId);
  const asset = record?.data as ProjectAsset | undefined;
  const configIds = new Set<string>();
  if (asset?.productConfigId) configIds.add(asset.productConfigId);
  for (const a of assignments) {
    if (a.workflowConfigId) configIds.add(a.workflowConfigId);
  }

  await Promise.allSettled([...configIds].map((id) => workflowConfigService.getById(id)));

  try {
    const links = await assetDocumentLinkService.listByAsset(assetId);
    await prefetchAssetLinkedDocuments(links.map((l) => ({ document: l.document })));
  } catch {
    // Non-fatal
  }
}

export async function prefetchAssetIds(assetIds: string[]): Promise<void> {
  if (!isMobileNativePlatform() || assetIds.length === 0) return;
  const unique = [...new Set(assetIds)];
  await Promise.allSettled(unique.map((id) => prefetchAssetWorkflowData(id)));
  await clearServerChangeFlag();
}

function assignedAssetIdsFromWorkspace(workspace: DashboardWorkspace, projectId: string, userId: string): string[] {
  const rows = [
    ...workspace.currentInstalls,
    ...workspace.currentInspections,
    ...workspace.installHistory,
    ...workspace.inspectionHistory,
  ];
  return [...new Set(
    rows
      .filter((row) => row.projectId === projectId && row.assignedUserId === userId)
      .map((row) => row.id),
  )];
}

export async function prefetchAssignedAssetsFromWorkspace(
  workspace: DashboardWorkspace,
  userId: string,
): Promise<void> {
  if (!isMobileNativePlatform()) return;
  const projectIds = [...new Set([
    ...workspace.currentInstalls,
    ...workspace.currentInspections,
    ...workspace.installHistory,
    ...workspace.inspectionHistory,
  ].map((row) => row.projectId).filter(Boolean))];

  const assetIds = projectIds.flatMap((projectId) => assignedAssetIdsFromWorkspace(workspace, projectId, userId));
  await prefetchAssetIds(assetIds);
}

export async function prefetchAssignedAssetsInProject(projectId: string, userId: string): Promise<void> {
  if (!isMobileNativePlatform()) return;

  const workspace = await offlineStore.getCache<DashboardWorkspace>(DASHBOARD_WORKSPACE_CACHE_KEY(userId));
  if (workspace) {
    const fromWorkspace = assignedAssetIdsFromWorkspace(workspace, projectId, userId);
    if (fromWorkspace.length > 0) {
      await prefetchAssetIds(fromWorkspace);
      return;
    }
  }

  const { projectAssetService } = await import("./projectAssetService");
  const assets = await projectAssetService.listByProjectFresh(projectId);
  const mine = assets.filter((a) => a.assignedUserId === userId);
  await Promise.allSettled(mine.map((a) => prefetchAssetWorkflowData(a.id)));
}
