import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import { resolveConfigWorkflowTypeId } from "./assetInstallationPageLogic";

export type AssignFormState = {
  workflowTypeId: string;
  workflowConfigId: string;
};

/** Matches ?workflowType= query param against workflow type id or name. */
export function resolveRequestedWorkflowTypeId(
  requestedWorkflowType: string | null | undefined,
  types: WorkflowType[],
): string {
  if (!requestedWorkflowType) return "";
  const normalized = requestedWorkflowType.trim().toLowerCase();
  return (
    types.find(
      (type) =>
        type.id.trim().toLowerCase() === normalized ||
        type.name.trim().toLowerCase() === normalized,
    )?.id ?? ""
  );
}

/** Published configs that match the requested workflow type (by FK or configType label). */
export function filterPublishedConfigsForRequestedType(
  configs: WorkflowConfig[],
  requestedWorkflowTypeId: string,
  requestedWorkflowTypeLabel: string | null | undefined,
): WorkflowConfig[] {
  if (!requestedWorkflowTypeId) return [];
  const normalizedLabel = requestedWorkflowTypeLabel?.trim().toLowerCase() ?? "";
  return configs.filter(
    (config) =>
      config.workflowTypeId === requestedWorkflowTypeId ||
      (normalizedLabel !== "" &&
        config.configType?.trim().toLowerCase() === normalizedLabel),
  );
}

/** Preselects the sole matching config when URL workflowType narrows to exactly one option. */
export function buildAssignFormPreselection(
  configs: WorkflowConfig[],
  types: WorkflowType[],
  requestedWorkflowTypeId: string,
  requestedWorkflowTypeLabel: string | null | undefined,
): AssignFormState {
  const matchingConfigs = filterPublishedConfigsForRequestedType(
    configs,
    requestedWorkflowTypeId,
    requestedWorkflowTypeLabel,
  );
  const preselected = matchingConfigs.length === 1 ? matchingConfigs[0] : null;
  return {
    workflowTypeId: preselected ? resolveConfigWorkflowTypeId(preselected, types) : "",
    workflowConfigId: preselected?.id ?? "",
  };
}

/** Form state when the user picks a config from the assign dialog select. */
export function assignFormFromConfigSelection(
  configId: string,
  configs: WorkflowConfig[],
  types: WorkflowType[],
): AssignFormState {
  const cfg = configs.find((c) => c.id === configId);
  return {
    workflowConfigId: configId,
    workflowTypeId: cfg ? resolveConfigWorkflowTypeId(cfg, types) : "",
  };
}

/**
 * Resolves workflowTypeId for create() — uses form value when set, otherwise re-derives
 * from the selected config (offline recovery when types list was empty at dialog open).
 */
export function resolveAssignmentWorkflowTypeId(
  formWorkflowTypeId: string,
  workflowConfigId: string,
  configs: WorkflowConfig[],
  types: WorkflowType[],
): string {
  if (formWorkflowTypeId) return formWorkflowTypeId;
  const cfg = configs.find((c) => c.id === workflowConfigId);
  if (!cfg) return "";
  return resolveConfigWorkflowTypeId(cfg, types) || (cfg.workflowTypeId ?? "");
}
