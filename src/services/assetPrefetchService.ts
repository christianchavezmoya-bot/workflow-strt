/**
 * Targeted prefetch of workflow data for one asset — used when PM creates/assigns
 * an asset so the installer can start a run offline without a full bootstrap pass.
 */

import { isMobileNativePlatform } from "../utils/platform";
import { entityGetAsset } from "./localDB";
import { assetWorkflowAssignmentService } from "./assetWorkflowAssignmentService";
import { assetWorkflowRunService } from "./assetWorkflowRunService";
import { assetDocumentLinkService } from "./assetDocumentLinkService";
import { workflowConfigService } from "./workflowConfigService";
import { prefetchAssetLinkedDocuments } from "./documentService";
import type { ProjectAsset } from "../types/projectAsset";

/** Download assignments, runs, config, and linked docs for a single asset. */
export async function prefetchAssetWorkflowData(assetId: string): Promise<void> {
  if (!isMobileNativePlatform()) return;

  const assignments = await assetWorkflowAssignmentService.listByAsset(assetId);
  await assetWorkflowRunService.listByAssetFresh(assetId);

  const record = await entityGetAsset(assetId);
  const asset = record?.data as ProjectAsset | undefined;
  const configIds = new Set<string>();
  if (asset?.productConfigId) configIds.add(asset.productConfigId);
  for (const a of assignments) {
    if (a.workflowConfigId) configIds.add(a.workflowConfigId);
  }

  await Promise.allSettled(
    [...configIds].map((id) => workflowConfigService.getById(id)),
  );

  try {
    const links = await assetDocumentLinkService.listByAsset(assetId);
    await prefetchAssetLinkedDocuments(links.map((l) => ({ document: l.document })));
  } catch {
    // Non-fatal — documents can load on first open.
  }
}

/** Prefetch workflow data for every asset assigned to the current user in a project. */
export async function prefetchAssignedAssetsInProject(projectId: string, userId: string): Promise<void> {
  if (!isMobileNativePlatform()) return;

  const { projectAssetService } = await import("./projectAssetService");
  const assets = await projectAssetService.listByProject(projectId);
  const mine = assets.filter((a) => a.assignedUserId === userId);
  await Promise.allSettled(mine.map((a) => prefetchAssetWorkflowData(a.id)));
}
