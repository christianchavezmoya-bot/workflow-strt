import {
  AddOutlined,
  AssignmentOutlined,
  FileUploadOutlined,
  InfoOutlined,
  RefreshOutlined,
} from "@mui/icons-material";
import {
  Button,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { INSPECTION_ASSETS_UI_ENABLED } from "../../config/productFeatureFlags";

type Props = {
  activeProductName?: string;
  selectedProjectJobNumber?: string;
  selectedProjectHasInspection: boolean;
  showAdvancedAssetActions: boolean;
  canModifyData: boolean;
  canCreateWorkflow: boolean;
  creatingWorkflowDraft: boolean;
  onRefresh: () => void;
  onNavigateInspectionAssets: () => void;
  onCreateWorkflow: () => void;
  onImportCsv: () => void;
  onAddAsset: () => void;
};

export default function AssetInstallationPageHeader({
  activeProductName,
  selectedProjectJobNumber,
  selectedProjectHasInspection,
  showAdvancedAssetActions,
  canModifyData,
  canCreateWorkflow,
  creatingWorkflowDraft,
  onRefresh,
  onNavigateInspectionAssets,
  onCreateWorkflow,
  onImportCsv,
  onAddAsset,
}: Props) {
  const infoTooltip = selectedProjectJobNumber
    ? selectedProjectHasInspection
      ? `Track project assets for ${selectedProjectJobNumber} - manage installation and inspection workflows from one workspace.`
      : `Track assets for ${selectedProjectJobNumber} - start work orders, record status, and monitor progress.`
    : "Track assets across all projects - start work orders, record status, and monitor progress.";

  return (
    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" gap={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h5" sx={{ fontFamily: "Sora" }}>Project Assets</Typography>
        {activeProductName && <Chip size="small" color="primary" variant="outlined" label={activeProductName} />}
        <Tooltip title={infoTooltip}>
          <InfoOutlined sx={{ fontSize: 16, color: "text.secondary", cursor: "pointer" }} />
        </Tooltip>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={onRefresh}>
            <RefreshOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        {INSPECTION_ASSETS_UI_ENABLED && selectedProjectHasInspection && selectedProjectJobNumber && (
          <Button size="small" variant="outlined" onClick={onNavigateInspectionAssets}>
            Inspection Assets
          </Button>
        )}
        {showAdvancedAssetActions && canModifyData && activeProductName && (
          <Tooltip title={`Open the workflow builder for ${activeProductName}`}>
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AssignmentOutlined />}
                disabled={!canCreateWorkflow || creatingWorkflowDraft}
                onClick={onCreateWorkflow}
              >
                {creatingWorkflowDraft ? "Creating Draft..." : "Create Workflow"}
              </Button>
            </span>
          </Tooltip>
        )}
        {showAdvancedAssetActions && canModifyData && activeProductName && (
          <Button size="small" variant="outlined" startIcon={<FileUploadOutlined />} onClick={onImportCsv}>
            Import CSV
          </Button>
        )}
        {showAdvancedAssetActions && canModifyData && activeProductName && (
          <Button variant="contained" startIcon={<AddOutlined />} onClick={onAddAsset}>
            Add asset
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
