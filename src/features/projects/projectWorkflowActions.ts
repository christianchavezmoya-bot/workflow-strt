import type { NavigateFunction } from "react-router-dom";
import type { AppDispatch } from "../../store/index";
import { updateProjectStatus } from "../../store/projectSlice";
import type { Project, WorkflowMode } from "../../types/project";
import type { ProjectAssetSummaryItem } from "../../services/projectAssetService";
import { isProjectReadyToCloseFromSummary } from "./projectCloseReadiness";

export type ProjectWorkflowAction =
  | "Submit for Approval"
  | "Approve"
  | "Request Info"
  | "Reject"
  | "Start Work"
  | "Mark as Closed";

export type ProjectActionSurface = "list-web" | "list-mobile" | "detail";

export type ProjectActionOptions = {
  userRole?: string;
  canApprove?: boolean;
  canEditProject: boolean;
  installationEnabled?: boolean;
  surface: ProjectActionSurface;
  /** When provided, gates "Mark as Closed" on signatures as well as field completion. */
  assetSummary?: Pick<ProjectAssetSummaryItem, "complete" | "total" | "pendingSignature"> | null;
  /** Per-asset fallback when summary is unavailable (e.g. project detail). */
  readyToClose?: boolean;
};

export const installationEnabledForProject = (workflowMode?: WorkflowMode) =>
  workflowMode === "INSTALLATION_ONLY" || workflowMode === "MIXED" || !workflowMode;

export function getProjectWorkflowActions(
  project: Project,
  options: ProjectActionOptions
): ProjectWorkflowAction[] {
  const actions: ProjectWorkflowAction[] = [];
  const { userRole, canApprove, canEditProject, installationEnabled = true, surface, assetSummary, readyToClose } = options;
  const isPm = userRole === "Project Manager";

  if (project.status === "Draft" && isPm && canEditProject) {
    actions.push("Submit for Approval");
  }

  if (project.status === "Pending Approval" && canApprove) {
    actions.push("Approve", "Request Info", "Reject");
  }

  if (project.status === "Approved" && canEditProject && installationEnabled) {
    if (surface !== "list-mobile") {
      actions.push("Start Work");
    }
  }

  if (project.status === "Completed" && canEditProject) {
    const canClose = typeof readyToClose === "boolean"
      ? readyToClose
      : isProjectReadyToCloseFromSummary(project, assetSummary);
    if (canClose) {
      actions.push("Mark as Closed");
    }
  }

  return actions;
}

export async function executeProjectWorkflowAction(
  dispatch: AppDispatch,
  navigate: NavigateFunction,
  project: Project,
  label: ProjectWorkflowAction,
  hooks?: {
    onBeforeClose?: () => void;
    onAfterClose?: () => void;
    onError?: (message: string) => void;
  }
): Promise<Project | void> {
  if (!project.id) return;

  if (label === "Submit for Approval") {
    return dispatch(
      updateProjectStatus({ id: project.id, payload: { status: "Pending Approval" } })
    ).unwrap();
  }

  if (label === "Approve") {
    return dispatch(
      updateProjectStatus({
        id: project.id,
        payload: { status: "Approved", approvalDecision: "Approved" },
      })
    ).unwrap();
  }

  if (label === "Request Info") {
    return dispatch(
      updateProjectStatus({
        id: project.id,
        payload: { status: "Pending Approval", approvalDecision: "More Info Required" },
      })
    ).unwrap();
  }

  if (label === "Reject") {
    return dispatch(
      updateProjectStatus({
        id: project.id,
        payload: { status: "Cancelled", approvalDecision: "Rejected" },
      })
    ).unwrap();
  }

  if (label === "Start Work") {
    const updated = await dispatch(
      updateProjectStatus({ id: project.id, payload: { status: "In Progress" } })
    ).unwrap();
    navigate(
      `/installations/assets?product=${encodeURIComponent(updated.productIds?.[0] ?? project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`
    );
    return updated;
  }

  if (label === "Mark as Closed") {
    hooks?.onBeforeClose?.();
    try {
      return await dispatch(
        updateProjectStatus({ id: project.id, payload: { status: "Closed" } })
      ).unwrap();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to close this project right now.";
      hooks?.onError?.(message);
      throw error;
    } finally {
      hooks?.onAfterClose?.();
    }
  }
}
