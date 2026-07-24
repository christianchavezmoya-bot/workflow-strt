import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import type { Workflow } from "../types/workflow";
import type { WorkflowConfig } from "../types/workflowConfig";
import { isMobileNativePlatform } from "../utils/platform";
import { markOfflinePerf, startWorkflowLocalReadSpan } from "../utils/offlinePerf";
import {
  getCachedWorkflowShell,
  parseWorkflowFromConfig,
  setCachedWorkflowShell,
} from "../utils/workflowOpenCache";
import { assetWorkflowRunService } from "./assetWorkflowRunService";
import { workflowConfigService } from "./workflowConfigService";

export type WorkflowOpenPayload = {
  workflow: Workflow;
  config: WorkflowConfig;
  existingRunId?: string;
};

/**
 * Local-first workflow load for opening the runner. Never waits on network when
 * cached config/steps exist on device. Background refresh is fire-and-forget.
 */
export async function loadWorkflowOpenPayload(
  configId: string,
  asset: Pick<ProjectAsset, "id">,
  options?: {
    configFromMemory?: WorkflowConfig | null;
    runs?: AssetWorkflowRun[];
    workflowConfigIdForRun?: string;
  },
): Promise<WorkflowOpenPayload | null> {
  markOfflinePerf("navigation_start", configId);
  const endLocalRead = startWorkflowLocalReadSpan(configId);

  const cfg =
    options?.configFromMemory
    ?? await workflowConfigService.getByIdLocalFirst(configId);

  if (!cfg) {
    endLocalRead();
    return null;
  }

  let workflow = getCachedWorkflowShell(configId);
  if (!workflow) {
    workflow = parseWorkflowFromConfig(cfg);
    if (workflow) setCachedWorkflowShell(configId, workflow);
  }

  if (!workflow || workflow.steps.length === 0) {
    endLocalRead();
    return null;
  }

  let existingRunId: string | undefined;
  const runs = options?.runs ?? await assetWorkflowRunService.listByAsset(asset.id);
  const matchConfigId = options?.workflowConfigIdForRun ?? configId;
  const activeRun = runs.find((r) => r.workflowConfigId === matchConfigId && !r.isLocked);
  if (activeRun) existingRunId = activeRun.id;

  endLocalRead();
  markOfflinePerf("interactive_ready", configId);

  if (isMobileNativePlatform()) {
    void workflowConfigService.refreshByIdInBackground(configId);
    void assetWorkflowRunService.refreshByAssetInBackground(asset.id);
  }

  return { workflow, config: cfg, existingRunId };
}

/** Resume reconcile after local-first runner open — authoritative server state. */
export function refreshWorkflowOpenDataInBackground(assetId: string, configId: string): void {
  if (!isMobileNativePlatform()) return;
  void workflowConfigService.refreshByIdInBackground(configId);
  void assetWorkflowRunService.listByAssetFresh(assetId).catch(() => []);
}
