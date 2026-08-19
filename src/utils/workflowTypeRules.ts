import type { Project, WorkflowMode } from "../types/project";
import type { WorkflowType } from "../types/workflowType";

export function isInspectionWorkflowType(type?: Pick<WorkflowType, "id" | "name"> | null): boolean {
  if (!type) return false;
  const id = type.id.toLowerCase();
  const name = type.name.toLowerCase();
  return id.includes("inspection") || name.includes("inspection");
}

/** Derives legacy WorkflowMode from a single catalog workflow type. */
export function deriveWorkflowMode(type: Pick<WorkflowType, "id" | "name">): WorkflowMode {
  return isInspectionWorkflowType(type) ? "INSPECTION_ONLY" : "INSTALLATION_ONLY";
}

export function isInstallationProjectMode(workflowMode?: WorkflowMode | null): boolean {
  return workflowMode === "INSTALLATION_ONLY" || workflowMode === "MIXED" || !workflowMode;
}

/** Backfill WorkflowTypeId from legacy WorkflowMode (not for MIXED). */
export function defaultTypeIdForLegacyMode(workflowMode?: WorkflowMode | null): string | null {
  switch (workflowMode) {
    case "INSPECTION_ONLY":
      return "wftype-inspection";
    case "MIXED":
      return null;
    default:
      return "wftype-installation";
  }
}

/** Resolve the form/catalog type id from a project row (post-migration backfill aware). */
export function resolveProjectWorkflowTypeId(
  project: Pick<Project, "workflowTypeId" | "workflowMode" | "isInstallationProject">,
): string {
  if (project.workflowTypeId) return project.workflowTypeId;
  const legacyMode =
    project.workflowMode ?? (project.isInstallationProject ? "INSTALLATION_ONLY" : "INSPECTION_ONLY");
  return defaultTypeIdForLegacyMode(legacyMode) ?? "";
}

export function findWorkflowType(types: WorkflowType[], id?: string | null): WorkflowType | undefined {
  if (!id) return undefined;
  return types.find((type) => type.id === id);
}
