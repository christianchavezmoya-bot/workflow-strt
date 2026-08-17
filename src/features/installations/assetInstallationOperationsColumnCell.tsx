import { Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { ProductConfig } from "../../services/productConfigService";
import type { ProjectAsset } from "../../types/projectAsset";
import type { Project } from "../../types/project";
import type { User } from "../../types/user";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { WorkflowConfig } from "../../types/workflowConfig";
import { formatAssetTableDate, resolveAssetClosedAt } from "../../utils/assetTableDates";
import { resolveOperationsConfigName, resolveOperationsConfigType } from "./assetInstallationOperationsTableLogic";

export type OperationsColumnCellContext = {
  officeZone: string | undefined;
  runsMap: Record<string, AssetWorkflowRun[]>;
  wfConfigMap: Map<string, WorkflowConfig>;
  renderFeatureCompletenessChip: (asset: ProjectAsset) => ReactNode;
  renderStatusChip: (asset: ProjectAsset, projectWorkflowMode?: string | null) => ReactNode;
};

export function createOperationsColumnCellRenderer(ctx: OperationsColumnCellContext) {
  return function renderColumnCell(
    colId: string,
    asset: ProjectAsset,
    cfg: ProductConfig | null | undefined,
    proj: Project | undefined,
    tech: User | undefined,
  ): ReactNode {
    switch (colId) {
      case "assetName":
        return <Typography variant="body2">{asset.assetName || "-"}</Typography>;
      case "serialNumber":
        return <Typography variant="body2" color="text.secondary">{asset.serialNumber || "-"}</Typography>;
      case "assetModel":
        return <Typography variant="body2" color="text.secondary">{asset.assetModel || "-"}</Typography>;
      case "manufacturer":
        return <Typography variant="body2" color="text.secondary">{asset.manufacturer || "-"}</Typography>;
      case "configType":
        return (
          <Typography variant="body2" color="text.secondary">
            {resolveOperationsConfigType(asset, cfg, ctx.wfConfigMap)}
          </Typography>
        );
      case "configName":
        return (
          <Typography variant="body2" color="text.secondary">
            {resolveOperationsConfigName(asset, cfg, ctx.wfConfigMap)}
          </Typography>
        );
      case "project":
        return (
          <Typography variant="body2" color="text.secondary">
            {proj ? proj.jobNumber : asset.projectId.slice(0, 8)}
          </Typography>
        );
      case "siteName":
        return <Typography variant="body2" color="text.secondary">{proj?.siteName || "-"}</Typography>;
      case "location":
        return <Typography variant="body2" color="text.secondary">{asset.location || "-"}</Typography>;
      case "dateCreated":
        return (
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
            {formatAssetTableDate(asset.createdAt, ctx.officeZone)}
          </Typography>
        );
      case "dateClosed":
        return (
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
            {formatAssetTableDate(resolveAssetClosedAt(asset, ctx.runsMap[asset.id]), ctx.officeZone)}
          </Typography>
        );
      case "assignedTech":
        return <Typography variant="body2" color="text.secondary">{tech ? tech.fullName : "-"}</Typography>;
      case "features":
        return ctx.renderFeatureCompletenessChip(asset);
      case "status":
        return ctx.renderStatusChip(asset, proj?.workflowMode);
      default:
        return null;
    }
  };
}
