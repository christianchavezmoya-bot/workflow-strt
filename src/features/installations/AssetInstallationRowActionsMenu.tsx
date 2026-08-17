import {
  ArticleOutlined,
  DeleteForeverOutlined,
  DeleteOutline,
  EditOutlined,
  FolderOutlined,
  HistoryOutlined,
  PlayArrowOutlined,
  RestoreOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import type { ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import type { WorkflowAssignment } from "../../types/workflowType";
import { STATUS_COLORS, STATUS_LABELS } from "./assetStatusDisplay";

type RowActionsMenuProps = {
  anchorEl: HTMLElement | null;
  asset: ProjectAsset | null;
  docsCount: number;
  archiveMode: boolean;
  showAdvancedAssetActions: boolean;
  reportGeneratingAssetId: string | null;
  deletingAsset: boolean;
  purgingAsset: boolean;
  canRunAssetWorkflow: boolean;
  canManageAssetDocuments: boolean;
  canViewInstallationAssets: boolean;
  canEditInstallationAssets: boolean;
  canDeleteInstallationAssets: boolean;
  canEditAsset: (asset: ProjectAsset) => boolean;
  projectWorkflowMode?: string | null;
  renderWorkflowAction: (asset: ProjectAsset, projectWorkflowMode?: string | null) => ReactNode;
  onClose: () => void;
  onOpenDocuments: (asset: ProjectAsset) => void;
  onOpenReport: (asset: ProjectAsset) => void;
  onEditAsset: (asset: ProjectAsset) => void;
  onArchiveAsset: (asset: ProjectAsset) => void;
  onRestoreAsset: (asset: ProjectAsset) => void;
  onPurgeAsset: (asset: ProjectAsset) => void;
};

export function AssetInstallationRowActionsMenu({
  anchorEl,
  asset,
  docsCount,
  archiveMode,
  showAdvancedAssetActions,
  reportGeneratingAssetId,
  deletingAsset,
  purgingAsset,
  canRunAssetWorkflow,
  canManageAssetDocuments,
  canViewInstallationAssets,
  canEditInstallationAssets,
  canDeleteInstallationAssets,
  canEditAsset,
  projectWorkflowMode,
  renderWorkflowAction,
  onClose,
  onOpenDocuments,
  onOpenReport,
  onEditAsset,
  onArchiveAsset,
  onRestoreAsset,
  onPurgeAsset,
}: RowActionsMenuProps) {
  if (!asset) return null;

  const closeAnd = (action: (asset: ProjectAsset) => void) => () => {
    action(asset);
    onClose();
  };

  const showWorkflowAction =
    canRunAssetWorkflow
    || asset.status === "Complete"
    || asset.status === "Closed"
    || asset.status === "Cancelled";

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      PaperProps={{ sx: { borderRadius: 2, minWidth: 220, p: 1.5 } }}
    >
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>{asset.assetTag}</Typography>
          <Chip
            size="small"
            label={STATUS_LABELS[asset.status as ProjectAssetStatus]}
            color={STATUS_COLORS[asset.status as ProjectAssetStatus]}
            sx={{ fontSize: "0.7rem" }}
          />
        </Stack>
        <Divider />
        {showWorkflowAction && (
          <Box>{renderWorkflowAction(asset, projectWorkflowMode)}</Box>
        )}
        {canManageAssetDocuments && (
          <Button
            size="small"
            fullWidth
            variant="outlined"
            startIcon={<FolderOutlined fontSize="small" />}
            onClick={closeAnd(onOpenDocuments)}
          >
            Documents ({docsCount}/3)
          </Button>
        )}
        {canViewInstallationAssets && (
          <Button
            size="small"
            fullWidth
            variant="outlined"
            startIcon={reportGeneratingAssetId === asset.id ? <CircularProgress size={14} /> : <ArticleOutlined fontSize="small" />}
            disabled={reportGeneratingAssetId === asset.id}
            onClick={closeAnd(onOpenReport)}
          >
            View/Export Report
          </Button>
        )}
        {canEditInstallationAssets && canEditAsset(asset) && !archiveMode && (
          <Button
            size="small"
            fullWidth
            variant="outlined"
            startIcon={<EditOutlined fontSize="small" />}
            onClick={closeAnd(onEditAsset)}
          >
            Edit Asset
          </Button>
        )}
        {canDeleteInstallationAssets && canEditAsset(asset) && !archiveMode && showAdvancedAssetActions && (
          <Button
            size="small"
            fullWidth
            variant="outlined"
            color="error"
            startIcon={<DeleteOutline fontSize="small" />}
            onClick={closeAnd(onArchiveAsset)}
          >
            Archive
          </Button>
        )}
        {canDeleteInstallationAssets && canEditAsset(asset) && archiveMode && (
          <Button
            size="small"
            fullWidth
            variant="outlined"
            startIcon={<RestoreOutlined fontSize="small" />}
            disabled={deletingAsset}
            onClick={closeAnd(onRestoreAsset)}
          >
            Restore
          </Button>
        )}
        {canDeleteInstallationAssets && canEditAsset(asset) && archiveMode && (
          <Button
            size="small"
            fullWidth
            variant="outlined"
            color="error"
            startIcon={<DeleteForeverOutlined fontSize="small" />}
            disabled={purgingAsset}
            onClick={closeAnd(onPurgeAsset)}
          >
            Delete Permanently
          </Button>
        )}
      </Stack>
    </Popover>
  );
}

type AssignmentContextMenuProps = {
  anchorEl: HTMLElement | null;
  asset: ProjectAsset | null;
  assignment: WorkflowAssignment | null;
  onClose: () => void;
  onRerunWorkflow: (asset: ProjectAsset, assignment: WorkflowAssignment) => void;
  onViewRunHistory: (asset: ProjectAsset, assignment: WorkflowAssignment) => void;
};

export function AssetInstallationAssignmentContextMenu({
  anchorEl,
  asset,
  assignment,
  onClose,
  onRerunWorkflow,
  onViewRunHistory,
}: AssignmentContextMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
    >
      <MenuItem
        onClick={() => {
          onClose();
          if (asset && assignment) onRerunWorkflow(asset, assignment);
        }}
      >
        <ListItemIcon><PlayArrowOutlined fontSize="small" /></ListItemIcon>
        <ListItemText>Re-run workflow</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          onClose();
          if (asset && assignment) onViewRunHistory(asset, assignment);
        }}
      >
        <ListItemIcon><HistoryOutlined fontSize="small" /></ListItemIcon>
        <ListItemText>View run history</ListItemText>
      </MenuItem>
    </Menu>
  );
}
