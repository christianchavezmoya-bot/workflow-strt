import {
  ArticleOutlined,
  DeleteForeverOutlined,
  DeleteOutline,
  EditOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  FolderOutlined,
  RestoreOutlined,
} from "@mui/icons-material";
import {
  Badge,
  Box,
  Checkbox,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Stack,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import type { ProductConfig } from "../../services/productConfigService";
import type { ProjectAsset } from "../../types/projectAsset";
import type { Project } from "../../types/project";
import type { User } from "../../types/user";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import { operationsStickyPrefixSx, type ColumnDef } from "./assetInstallationPageLogic";
import { OPERATIONS_CHECKBOX_W, OPERATIONS_TAG_STICKY_LEFT } from "./operationsTableLayout";

export type OperationsAssetRowContext = {
  visibleColumns: ColumnDef[];
  expandedAssetId: string | null;
  selectedAssetIds: Set<string>;
  configMap: Map<string, ProductConfig>;
  projectMap: Map<string, Project>;
  userMap: Map<string, User>;
  runsMap: Record<string, AssetWorkflowRun[]>;
  docsCountMap: Record<string, number>;
  reportGenerating: string | null;
  archiveMode: boolean;
  deletingAsset: boolean;
  purgingAsset: boolean;
  canRunAssetWorkflow: boolean;
  canManageAssetDocuments: boolean;
  canViewInstallationAssets: boolean;
  canEditInstallationAssets: boolean;
  canDeleteInstallationAssets: boolean;
  onToggleSelect: (assetId: string, checked: boolean) => void;
  onToggleExpand: (assetId: string) => void;
  loadAssignmentsForAsset: (assetId: string) => void;
  setDocsAsset: (asset: ProjectAsset) => void;
  setDocsOpen: (open: boolean) => void;
  openReportExportDialog: (asset: ProjectAsset) => void;
  openEditAsset: (asset: ProjectAsset) => void;
  setDeleteAsset: (asset: ProjectAsset) => void;
  confirmRestoreAsset: (asset: ProjectAsset) => void;
  setPurgeAsset: (asset: ProjectAsset) => void;
  canEditAssetFromWebTable: (asset: ProjectAsset) => boolean;
  computeAssetHealth: (asset: ProjectAsset, runs?: AssetWorkflowRun[]) => "green" | "amber" | "red" | null;
  issuesBadge: (asset: ProjectAsset) => ReactNode;
  actionButton: (asset: ProjectAsset, projectWorkflowMode?: string | null) => ReactNode;
  renderColumnCell: (
    colId: string,
    asset: ProjectAsset,
    cfg: ProductConfig | null | undefined,
    proj: Project | undefined,
    tech: User | undefined,
  ) => ReactNode;
  renderFeatureExpandedRow: (asset: ProjectAsset) => ReactNode;
  renderIssuesPanel: (asset: ProjectAsset) => ReactNode;
  renderTimeTrackingPanel: (asset: ProjectAsset) => ReactNode | null;
  renderWorkflowAssignmentsPanel: (asset: ProjectAsset) => ReactNode;
};

export function createOperationsAssetRowRenderer(ctx: OperationsAssetRowContext) {
  return function renderOperationsAssetRows(asset: ProjectAsset): [ReactNode, ReactNode] {
    const cfg = asset.productConfigId ? ctx.configMap.get(asset.productConfigId) : null;
    const proj = ctx.projectMap.get(asset.projectId);
    const tech = asset.assignedUserId ? ctx.userMap.get(asset.assignedUserId) : null;
    const isExpanded = ctx.expandedAssetId === asset.id;
    const hasIssue = asset.status === "Issue";

    return [
      <TableRow
        key={asset.id}
        hover
        sx={{
          bgcolor: hasIssue
            ? "rgba(211,47,47,0.04)"
            : ctx.selectedAssetIds.has(asset.id)
              ? "rgba(var(--primary-rgb,25,118,210),0.08)"
              : undefined,
        }}
      >
        <TableCell sx={{ px: 0.5, ...operationsStickyPrefixSx(0, 2) }}>
          <Checkbox
            size="small"
            checked={ctx.selectedAssetIds.has(asset.id)}
            onChange={(e) => ctx.onToggleSelect(asset.id, e.target.checked)}
          />
        </TableCell>
        <TableCell sx={{ px: 1, ...operationsStickyPrefixSx(OPERATIONS_CHECKBOX_W, 2) }}>
          <IconButton
            size="small"
            onClick={() => {
              ctx.onToggleExpand(asset.id);
              if (!isExpanded) ctx.loadAssignmentsForAsset(asset.id);
            }}
          >
            {isExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={operationsStickyPrefixSx(OPERATIONS_TAG_STICKY_LEFT, 2)}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            {hasIssue && (
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor:
                    ctx.computeAssetHealth(asset, ctx.runsMap[asset.id] ?? []) === "red"
                      ? "error.main"
                      : "warning.main",
                  flexShrink: 0,
                }}
              />
            )}
            <Typography variant="body2" fontWeight={600}>
              {asset.assetTag}
            </Typography>
            {ctx.issuesBadge(asset)}
          </Stack>
        </TableCell>
        {ctx.visibleColumns.map((col) => (
          <TableCell key={col.id}>
            {ctx.renderColumnCell(col.id, asset, cfg, proj, tech ?? undefined)}
          </TableCell>
        ))}
        <TableCell align="right">
          <Stack direction="row" spacing={0.25} justifyContent="flex-end" alignItems="center">
            {(ctx.canRunAssetWorkflow ||
              asset.status === "Complete" ||
              asset.status === "Closed" ||
              asset.status === "Cancelled") &&
              ctx.actionButton(asset, proj?.workflowMode)}
            {ctx.canManageAssetDocuments && (
              <Tooltip title={`Documents (${ctx.docsCountMap[asset.id] ?? 0}/3)`}>
                <IconButton
                  size="small"
                  onClick={() => {
                    ctx.setDocsAsset(asset);
                    ctx.setDocsOpen(true);
                  }}
                >
                  <Badge
                    badgeContent={`${ctx.docsCountMap[asset.id] ?? 0}/3`}
                    color={
                      (ctx.docsCountMap[asset.id] ?? 0) === 0
                        ? "default"
                        : (ctx.docsCountMap[asset.id] ?? 0) === 3
                          ? "success"
                          : "primary"
                    }
                    sx={{ "& .MuiBadge-badge": { fontSize: 9, minWidth: 28, height: 16 } }}
                  >
                    <FolderOutlined fontSize="small" />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}
            {ctx.canViewInstallationAssets && (
              <Tooltip title="View/Export report">
                <span>
                  <IconButton
                    size="small"
                    disabled={ctx.reportGenerating === asset.id}
                    onClick={() => ctx.openReportExportDialog(asset)}
                  >
                    {ctx.reportGenerating === asset.id ? (
                      <CircularProgress size={16} />
                    ) : (
                      <ArticleOutlined fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {ctx.canEditInstallationAssets && ctx.canEditAssetFromWebTable(asset) && !ctx.archiveMode && (
              <Tooltip title="Edit asset">
                <IconButton size="small" onClick={() => ctx.openEditAsset(asset)}>
                  <EditOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {ctx.canDeleteInstallationAssets && ctx.canEditAssetFromWebTable(asset) && !ctx.archiveMode && (
              <Tooltip title="Archive asset">
                <IconButton size="small" color="error" onClick={() => ctx.setDeleteAsset(asset)}>
                  <DeleteOutline fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {ctx.canDeleteInstallationAssets && ctx.canEditAssetFromWebTable(asset) && ctx.archiveMode && (
              <Tooltip title="Restore asset">
                <span>
                  <IconButton
                    size="small"
                    disabled={ctx.deletingAsset}
                    onClick={() => ctx.confirmRestoreAsset(asset)}
                  >
                    <RestoreOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {ctx.canDeleteInstallationAssets && ctx.canEditAssetFromWebTable(asset) && ctx.archiveMode && (
              <Tooltip title="Delete asset permanently">
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={ctx.purgingAsset}
                    onClick={() => ctx.setPurgeAsset(asset)}
                  >
                    <DeleteForeverOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {!(
              ctx.canRunAssetWorkflow ||
              asset.status === "Complete" ||
              asset.status === "Closed" ||
              asset.status === "Cancelled" ||
              ctx.canManageAssetDocuments ||
              ctx.canViewInstallationAssets ||
              (ctx.canEditInstallationAssets && ctx.canEditAssetFromWebTable(asset) && !ctx.archiveMode) ||
              (ctx.canDeleteInstallationAssets && ctx.canEditAssetFromWebTable(asset))
            ) && (
              <Typography variant="caption" color="text.disabled">
                No actions
              </Typography>
            )}
          </Stack>
        </TableCell>
      </TableRow>,

      <TableRow key={`${asset.id}-detail`}>
        <TableCell colSpan={3 + ctx.visibleColumns.length} sx={{ py: 0 }}>
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box
              sx={{
                px: 3,
                py: 2,
                bgcolor: "rgba(45,212,191,0.05)",
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="caption"
                fontWeight={700}
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1.5 }}
              >
                Feature Values &amp; Sub-Dependencies
              </Typography>
              {ctx.renderFeatureExpandedRow(asset)}
              {asset.notes && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Notes:{" "}
                  </Typography>
                  <Typography variant="caption">{asset.notes}</Typography>
                </Box>
              )}
              <Divider sx={{ my: 1.5 }} />
              {ctx.renderIssuesPanel(asset)}
              {(() => {
                const timePanel = ctx.renderTimeTrackingPanel(asset);
                return timePanel ? (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    {timePanel}
                  </>
                ) : null;
              })()}
              <Divider sx={{ my: 1.5 }} />
              {ctx.renderWorkflowAssignmentsPanel(asset)}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>,
    ];
  };
}
