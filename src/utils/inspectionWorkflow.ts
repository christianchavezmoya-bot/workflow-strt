import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { WorkflowConfig } from "../types/workflowConfig";

/** True when a workflow config is an inspection type (not installation). */
export function isInspectionWorkflowConfig(
  config: Pick<WorkflowConfig, "configType" | "workflowTypeId">,
): boolean {
  const normalized = (config.configType ?? "").trim().toLowerCase();
  if (normalized === "inspection" || normalized === "wftype-inspection") return true;
  const typeId = (config.workflowTypeId ?? "").trim().toLowerCase();
  return typeId === "wftype-inspection";
}

export function filterInspectionRuns(
  runs: AssetWorkflowRun[],
  inspectionConfigIds: ReadonlySet<string>,
): AssetWorkflowRun[] {
  return runs.filter((run) => inspectionConfigIds.has(run.workflowConfigId));
}

export function inspectionConfigIdsFrom(configs: WorkflowConfig[]): Set<string> {
  return new Set(configs.filter(isInspectionWorkflowConfig).map((config) => config.id));
}
