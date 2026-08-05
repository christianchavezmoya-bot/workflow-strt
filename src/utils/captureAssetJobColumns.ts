import type { CaptureSpreadsheetAssetJobColumn } from "../features/installations/captureSpreadsheetTableLayout";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { Project } from "../types/project";
import type { ProjectAsset } from "../types/projectAsset";
import type { User } from "../types/user";
import type { WorkflowAssignment } from "../types/workflowType";

export interface CaptureAssetJobColumnContext {
  projectMap: Map<string, Project>;
  userMap: Map<string, User>;
  assignmentsMap: Record<string, WorkflowAssignment[]>;
  runsMap: Record<string, AssetWorkflowRun[]>;
}

/** Columns shown on the standalone capture route (Asset & job section). */
export function buildStandaloneCaptureJobColumns(
  ctx: CaptureAssetJobColumnContext,
): CaptureSpreadsheetAssetJobColumn[] {
  return [
    {
      id: "assetName",
      label: "Asset Name",
      valueFor: (asset) => asset.assetName || "-",
    },
    {
      id: "serialNumber",
      label: "Serial #",
      valueFor: (asset) => asset.serialNumber || "-",
    },
    {
      id: "location",
      label: "Location",
      valueFor: (asset) => asset.location || ctx.projectMap.get(asset.projectId)?.siteName || "-",
    },
    {
      id: "assignedTech",
      label: "Assigned Tech",
      valueFor: (asset) =>
        ctx.userMap.get(asset.assignedUserId || "")?.fullName || asset.installedBy || "-",
    },
    {
      id: "workflow",
      label: "Workflow",
      valueFor: (asset) => formatWorkflowConfigNames(asset, ctx),
    },
  ];
}

/** Full Asset & job column set used on the assets page export / native table view. */
export function buildFullCaptureJobColumns(
  ctx: CaptureAssetJobColumnContext,
): CaptureSpreadsheetAssetJobColumn[] {
  return [
    ...buildStandaloneCaptureJobColumns(ctx),
    {
      id: "customer",
      label: "Customer",
      valueFor: (asset) => ctx.projectMap.get(asset.projectId)?.customerName || "-",
    },
    {
      id: "projectNumber",
      label: "Job #",
      valueFor: (asset) =>
        ctx.projectMap.get(asset.projectId)?.jobNumber || asset.projectId.slice(0, 8),
    },
    {
      id: "siteName",
      label: "Site",
      valueFor: (asset) => ctx.projectMap.get(asset.projectId)?.siteName || "-",
    },
    {
      id: "signature",
      label: "Signature",
      valueFor: (asset) => formatSignatureState((ctx.runsMap[asset.id] ?? [])[0]),
    },
    {
      id: "completed",
      label: "Completed",
      valueFor: (asset) => (ctx.runsMap[asset.id] ?? [])[0]?.completedAt?.slice(0, 10) || "-",
    },
  ];
}

function formatWorkflowConfigNames(
  asset: ProjectAsset,
  ctx: CaptureAssetJobColumnContext,
): string {
  const assignments = ctx.assignmentsMap[asset.id] ?? [];
  if (assignments.length > 0) {
    return assignments
      .map((item) => item.workflowConfigName || item.workflowTypeName || "Workflow")
      .join(", ");
  }
  return asset.workflowSummary?.hasWorkflow ? "Configured" : "No workflow";
}

function formatSignatureState(run?: AssetWorkflowRun): string {
  const state = run?.signatureStatus ?? "";
  if (state === "Signed") return "Signed";
  if (state === "PendingCustomer") return "Pending Customer";
  if (state === "PendingInstaller") return "Pending Installer";
  return "-";
}
