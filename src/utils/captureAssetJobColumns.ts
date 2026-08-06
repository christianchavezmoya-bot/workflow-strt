import type { CaptureSpreadsheetAssetJobColumn } from "../features/installations/captureSpreadsheetTableLayout";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { Project } from "../types/project";
import type { ProjectAsset } from "../types/projectAsset";
import type { User } from "../types/user";
import type { WorkflowAssignment } from "../types/workflowType";
import type { WorkflowConfig } from "../types/workflowConfig";
import { pickCaptureRun } from "./captureSpreadsheet";
import { formatAssetTableDate, resolveAssetClosedAt } from "./assetTableDates";

export interface CaptureAssetJobColumnContext {
  projectMap: Map<string, Project>;
  userMap: Map<string, User>;
  assignmentsMap: Record<string, WorkflowAssignment[]>;
  runsMap: Record<string, AssetWorkflowRun[]>;
  workflowConfigMap?: Map<string, WorkflowConfig>;
  /** Office/site zone for date columns (defaults to UTC when omitted). */
  timeZoneId?: string | null;
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
    {
      id: "dateCreated",
      label: "Date Created",
      valueFor: (asset) => formatAssetTableDate(asset.createdAt, ctx.timeZoneId),
    },
    {
      id: "dateClosed",
      label: "Date Closed",
      valueFor: (asset) => formatAssetTableDate(resolveAssetClosedAt(asset, ctx.runsMap[asset.id]), ctx.timeZoneId),
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

function resolveConfigName(
  configId: string | undefined,
  ctx: CaptureAssetJobColumnContext,
): string | null {
  if (!configId || !ctx.workflowConfigMap) return null;
  const cfg = ctx.workflowConfigMap.get(configId);
  return cfg?.displayName?.trim() || cfg?.name?.trim() || null;
}

function formatWorkflowConfigNames(
  asset: ProjectAsset,
  ctx: CaptureAssetJobColumnContext,
): string {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined | null) => {
    const label = raw?.trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(label);
  };

  // One label per workflow config — assignments can repeat the same config.
  const assignments = ctx.assignmentsMap[asset.id] ?? [];
  const byConfigId = new Map<string, WorkflowAssignment>();
  for (const item of assignments) {
    if (!byConfigId.has(item.workflowConfigId)) byConfigId.set(item.workflowConfigId, item);
  }
  for (const item of byConfigId.values()) {
    add(item.workflowConfigName || item.workflowTypeName);
    if (!item.workflowConfigName) add(resolveConfigName(item.workflowConfigId, ctx));
  }

  const run = pickCaptureRun(ctx.runsMap[asset.id] ?? []);
  if (run) add(resolveConfigName(run.workflowConfigId, ctx));

  add(asset.configLabel);
  if (names.length === 0) add(resolveConfigName(asset.productConfigId, ctx));

  if (names.length > 0) return names.join(", ");
  return asset.workflowSummary?.hasWorkflow ? "Configured" : "No workflow";
}

function formatSignatureState(run?: AssetWorkflowRun): string {
  const state = run?.signatureStatus ?? "";
  if (state === "Signed") return "Signed";
  if (state === "PendingCustomer") return "Pending Customer";
  if (state === "PendingInstaller") return "Pending Installer";
  return "-";
}
