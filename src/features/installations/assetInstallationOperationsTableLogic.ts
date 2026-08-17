import type { ProjectAsset } from "../../types/projectAsset";
import type { ProductConfig } from "../../services/productConfigService";
import type { WorkflowConfig } from "../../types/workflowConfig";
import { formatAssetTableDate, resolveAssetClosedAt } from "../../utils/assetTableDates";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { Project } from "../../types/project";
import type { User } from "../../types/user";

export function resolveOperationsConfigType(
  asset: ProjectAsset,
  cfg: ProductConfig | null | undefined,
  wfConfigById: Map<string, WorkflowConfig>,
): string {
  return (
    cfg?.configType ||
    (asset.productConfigId ? wfConfigById.get(asset.productConfigId)?.configType : undefined) ||
    "-"
  );
}

export function resolveOperationsConfigName(
  asset: ProjectAsset,
  cfg: ProductConfig | null | undefined,
  wfConfigById: Map<string, WorkflowConfig>,
): string {
  return (
    cfg?.name ||
    (asset.productConfigId ? wfConfigById.get(asset.productConfigId)?.name : undefined) ||
    "-"
  );
}

export type OperationsColumnTextContext = {
  officeZone: string | undefined;
  runs?: AssetWorkflowRun[];
  project?: Project;
  tech?: User;
  cfg?: ProductConfig | null;
  wfConfigById: Map<string, WorkflowConfig>;
  featuresSummary: string;
  statusLabel: string;
};

/** Plain-text cell values for export and sorting (display columns with custom UI pass callbacks). */
export function getOperationsColumnText(
  colId: string,
  asset: ProjectAsset,
  ctx: OperationsColumnTextContext,
): string {
  switch (colId) {
    case "assetName":
      return asset.assetName || "-";
    case "serialNumber":
      return asset.serialNumber || "-";
    case "assetModel":
      return asset.assetModel || "-";
    case "manufacturer":
      return asset.manufacturer || "-";
    case "configType":
      return resolveOperationsConfigType(asset, ctx.cfg, ctx.wfConfigById);
    case "configName":
      return resolveOperationsConfigName(asset, ctx.cfg, ctx.wfConfigById);
    case "project":
      return ctx.project ? ctx.project.jobNumber : asset.projectId.slice(0, 8);
    case "siteName":
      return ctx.project?.siteName || "-";
    case "location":
      return asset.location || "-";
    case "dateCreated":
      return formatAssetTableDate(asset.createdAt, ctx.officeZone);
    case "dateClosed":
      return formatAssetTableDate(resolveAssetClosedAt(asset, ctx.runs), ctx.officeZone);
    case "assignedTech":
      return ctx.tech?.fullName || "-";
    case "features":
      return ctx.featuresSummary;
    case "status":
      return ctx.statusLabel;
    default:
      return "-";
  }
}
