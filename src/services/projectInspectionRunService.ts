import api from "./api";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import { assetWorkflowRunService } from "./assetWorkflowRunService";
import { projectAssetService } from "./projectAssetService";
import { workflowConfigService } from "./workflowConfigService";
import { isMobileNativePlatform } from "../utils/platform";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";
import {
  filterInspectionRuns,
  inspectionConfigIdsFrom,
  isInspectionWorkflowConfig,
} from "../utils/inspectionWorkflow";
import { webCachedGet } from "./webFreshCache";

async function resolveInspectionConfigIds(productId: string): Promise<Set<string>> {
  const configs = await workflowConfigService.listByProduct(productId, "Published").catch(() => []);
  return inspectionConfigIdsFrom(configs);
}

async function listInspectionRunsForAsset(projectAssetId: string): Promise<AssetWorkflowRun[]> {
  const asset = await projectAssetService.getById(projectAssetId);
  if (!asset) return [];

  const inspectionConfigIds = await resolveInspectionConfigIds(asset.productId);
  if (inspectionConfigIds.size === 0) return [];

  const runs = await assetWorkflowRunService.listByAsset(projectAssetId);
  return filterInspectionRuns(runs, inspectionConfigIds);
}

/**
 * Inspection runs are AssetWorkflowRun rows filtered to inspection workflow configs.
 * Native offline create/list/resume delegates to assetWorkflowRunService + cached configs.
 */
export const projectInspectionRunService = {
  async list(projectId: string, projectAssetId: string): Promise<AssetWorkflowRun[]> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(
        `/projects/${projectId}/assets/${projectAssetId}/inspection-runs-v2`,
        async () => {
          const res = await api.get<AssetWorkflowRun[]>("/asset-workflow-runs", {
            params: { assetId: projectAssetId, workflowType: "Inspection" },
          });
          return res.data;
        },
      );
    }

    if (!shouldSkipBlockingFetch()) {
      void assetWorkflowRunService.listByAssetFresh(projectAssetId).catch(() => {});
    }

    return listInspectionRunsForAsset(projectAssetId);
  },

  /** IndexedDB-first list for inspection page paint on native. */
  async listLocalFirst(_projectId: string, projectAssetId: string): Promise<AssetWorkflowRun[]> {
    if (!isMobileNativePlatform()) {
      return this.list(_projectId, projectAssetId);
    }
    return listInspectionRunsForAsset(projectAssetId);
  },

  async create(
    _projectId: string,
    projectAssetId: string,
    payload: { workflowConfigId: string; technicianUserId?: string },
  ): Promise<AssetWorkflowRun> {
    const config =
      (await workflowConfigService.getByIdLocalFirst(payload.workflowConfigId))
      ?? (await workflowConfigService.getById(payload.workflowConfigId).catch(() => null));
    if (config && !isInspectionWorkflowConfig(config)) {
      throw new Error("Selected workflow is not an inspection configuration.");
    }

    return assetWorkflowRunService.startRun(
      projectAssetId,
      payload.workflowConfigId,
      payload.technicianUserId,
    );
  },

  refreshInBackground(_projectId: string, projectAssetId: string): void {
    if (!isMobileNativePlatform()) return;
    assetWorkflowRunService.refreshByAssetInBackground(projectAssetId);
  },
};

export default projectInspectionRunService;
