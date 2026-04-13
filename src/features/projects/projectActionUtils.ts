import { notificationService } from "../../services/notificationService";
import { projectAssetService } from "../../services/projectAssetService";
import type { Project } from "../../types/project";

export type ProjectCompletionSummary = {
  totalAssets: number;
  completedAssets: number;
  percentComplete: number;
};

export async function getProjectCompletionSummary(projectId: string): Promise<ProjectCompletionSummary> {
  const assets = await projectAssetService.listByProject(projectId);
  const totalAssets = assets.length;
  const completedAssets = assets.filter((asset) => asset.status === "Complete").length;
  const percentComplete = totalAssets > 0 ? Math.round((completedAssets / totalAssets) * 100) : 0;
  return { totalAssets, completedAssets, percentComplete };
}

export async function notifyProjectReadyForCompletion(project: Project, actor?: { id?: string | null; fullName?: string | null }) {
  await notificationService.create({
    eventType: "asset-assignment-updated",
    severity: "info",
    title: `Project ready to complete: ${project.jobNumber}`,
    message: `${project.customerName || "Project"} reached 100% asset completion and is ready for PM review.`,
    recipientUserIds: project.assignedPmUserId ? [project.assignedPmUserId] : [],
    recipientRoles: project.assignedPmUserId ? ["Admin"] : ["Admin", "Project Manager"],
    projectId: project.id,
    entityType: "project",
    entityId: project.id,
    triggeredByUserId: actor?.id ?? null,
    triggeredByName: actor?.fullName ?? null,
  });
}
