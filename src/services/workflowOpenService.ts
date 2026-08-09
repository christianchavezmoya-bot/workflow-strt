import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import type { Workflow } from "../types/workflow";
import type { WorkflowConfig } from "../types/workflowConfig";
import { isMobileNativePlatform } from "../utils/platform";
import { startWorkflowLocalReadSpan } from "../utils/offlinePerf";
import {
  getCachedWorkflowShell,
  mergeWorkflowConfigMedia,
  parseWorkflowFromConfig,
  setCachedWorkflowShell,
} from "../utils/workflowOpenCache";
import { shouldSkipBlockingNetworkRead } from "./connectivityMonitor";
import { assetWorkflowRunService, resolveOpenRunId } from "./assetWorkflowRunService";
import { workflowConfigService } from "./workflowConfigService";
import offlineBootstrapService from "./offlineBootstrapService";

export const OFFLINE_CONFIG_MISSING_MESSAGE =
  "This work order hasn't been downloaded to this device yet. Connect to the internet once to load it, then it will work offline.";

/** True when native offline and network reads are skipped (config likely not cached). */
export function isOfflineConfigMissingContext(): boolean {
  return isMobileNativePlatform() && shouldSkipBlockingNetworkRead();
}

/** Fire-and-forget bootstrap retry when online (assigned scope = faster). */
export function retryOfflineDownload(): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  void offlineBootstrapService.retry({ scope: "assigned" });
}

export type WorkflowOpenPayload = {
  workflow: Workflow;
  config: WorkflowConfig;
  existingRunId?: string;
};

export type LoadWorkflowOpenOptions = {
  /** Preloaded config (in-memory maps on Assets page). */
  configFromMemory?: WorkflowConfig | null;
  /** Preloaded runs — skips listByAsset when provided. */
  runs?: AssetWorkflowRun[];
  /** Match active run against this config id (defaults to configId). */
  workflowConfigIdForRun?: string;
  /** Builder preview — skip asset run lookup and asset refresh. */
  previewOnly?: boolean;
  /** Merge config mediaJson into workflow shell (Assets page). */
  mergeMedia?: boolean;
};

async function resolveWorkflowConfig(
  configId: string,
  configFromMemory?: WorkflowConfig | null,
): Promise<WorkflowConfig | null> {
  if (configFromMemory) return configFromMemory;

  const local = await workflowConfigService.getByIdLocalFirst(configId);
  if (local) return local;

  if (isMobileNativePlatform() && shouldSkipBlockingNetworkRead()) {
    return null;
  }

  try {
    return await workflowConfigService.getById(configId);
  } catch {
    return null;
  }
}

/**
 * Local-first workflow load for opening the runner. Never waits on network when
 * cached config/steps exist on device. Caller marks navigation_start at tap;
 * WorkOrderRunner marks interactive_ready when the UI is usable.
 */
export async function loadWorkflowOpenPayload(
  configId: string,
  asset: Pick<ProjectAsset, "id"> | null,
  options?: LoadWorkflowOpenOptions,
): Promise<WorkflowOpenPayload | null> {
  const endLocalRead = startWorkflowLocalReadSpan(configId);

  try {
    const cfg = await resolveWorkflowConfig(configId, options?.configFromMemory);
    if (!cfg) return null;

    let workflow = getCachedWorkflowShell(configId);
    if (!workflow) {
      workflow = parseWorkflowFromConfig(cfg);
      if (workflow) setCachedWorkflowShell(configId, workflow);
    }

    if (!workflow || workflow.steps.length === 0) return null;

    if (options?.mergeMedia) {
      workflow = mergeWorkflowConfigMedia(workflow, cfg);
    }

    let existingRunId: string | undefined;
    if (!options?.previewOnly && asset) {
      const matchConfigId = options?.workflowConfigIdForRun ?? configId;
      existingRunId = await resolveOpenRunId(
        asset.id,
        matchConfigId,
        options?.runs ?? undefined,
      );
    }

    if (isMobileNativePlatform() && !options?.previewOnly && asset) {
      void workflowConfigService.refreshByIdInBackground(configId);
      void assetWorkflowRunService.refreshByAssetInBackground(asset.id);
    }

    return { workflow, config: cfg, existingRunId };
  } finally {
    endLocalRead();
  }
}

/** Resume reconcile after local-first runner open — authoritative server state. */
export function refreshWorkflowOpenDataInBackground(assetId: string, configId: string): void {
  if (!isMobileNativePlatform()) return;
  void workflowConfigService.refreshByIdInBackground(configId);
  // Fire-and-forget — runner already opened from local cache; avoid a second
  // boundedFreshRead on every reopen (that was doubling network work with
  // Dashboard's own background refresh on the same tap).
  assetWorkflowRunService.refreshByAssetInBackground(assetId);
}
