import { ArchiveOutlined, ArticleOutlined, FileDownloadOutlined, PrintOutlined } from "@mui/icons-material";
import { Box, Button, Stack, Tooltip, Typography } from "@mui/material";
import type { Project } from "../../types/project";
import { INSPECTION_INBOX_UI_ENABLED } from "../../config/productFeatureFlags";

type Props = {
  showAdvancedAssetActions: boolean;
  archiveMode: boolean;
  selectedCount: number;
  displayAssetCount: number;
  showBulkWorkflowReports: boolean;
  selectedProjectHasInspection: boolean;
  selectedProject: Project | null | undefined;
  onToggleArchiveMode: () => void;
  onOpenPrintDialog: (scope: "selection" | "visible") => void;
  onOpenBulkReports: () => void;
  onOpenExportDialog: () => void;
  onNavigateInspectionInbox: () => void;
};

export default function AssetInstallationTableToolbar({
  showAdvancedAssetActions,
  archiveMode,
  selectedCount,
  displayAssetCount,
  showBulkWorkflowReports,
  selectedProjectHasInspection,
  selectedProject,
  onToggleArchiveMode,
  onOpenPrintDialog,
  onOpenBulkReports,
  onOpenExportDialog,
  onNavigateInspectionInbox,
}: Props) {
  const visible =
    showAdvancedAssetActions
    || (INSPECTION_INBOX_UI_ENABLED && selectedProjectHasInspection && selectedProject && !archiveMode)
    || archiveMode;

  if (!visible) return null;

  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
      {showAdvancedAssetActions && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title={archiveMode ? "Exit archive view" : "Show completed assets archive"}>
            <Button
              size="small"
              variant={archiveMode ? "contained" : "outlined"}
              color={archiveMode ? "success" : "inherit"}
              startIcon={<ArchiveOutlined fontSize="small" />}
              onClick={onToggleArchiveMode}
              sx={{ fontSize: 12 }}
            >
              {archiveMode ? "Archive View - Exit" : "Archive"}
            </Button>
          </Tooltip>
          <Tooltip title="Print / Save PDF">
            <Button
              size="small"
              variant="outlined"
              startIcon={<PrintOutlined fontSize="small" />}
              onClick={() => onOpenPrintDialog(selectedCount > 0 ? "selection" : "visible")}
              sx={{ fontSize: 12 }}
            >
              Print / PDF
            </Button>
          </Tooltip>
          {showBulkWorkflowReports && (
            <Tooltip title={selectedCount === 0 ? "Select one or more assets first" : "Preview and download workflow installation reports for selected assets"}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ArticleOutlined fontSize="small" />}
                  disabled={selectedCount === 0}
                  onClick={onOpenBulkReports}
                  sx={{ fontSize: 12 }}
                >
                  View / Print Reports
                </Button>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Export the current filtered asset view">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<FileDownloadOutlined fontSize="small" />}
                onClick={onOpenExportDialog}
                disabled={displayAssetCount === 0}
                sx={{ fontSize: 12 }}
              >
                Export
              </Button>
            </span>
          </Tooltip>
        </Stack>
      )}
      <Stack direction="row" spacing={1} alignItems="center">
        {INSPECTION_INBOX_UI_ENABLED && selectedProjectHasInspection && selectedProject && !archiveMode && (
          <Button
            size="small"
            variant="outlined"
            onClick={onNavigateInspectionInbox}
            sx={{ fontSize: 12 }}
          >
            Inspection Inbox
          </Button>
        )}
      </Stack>
      {archiveMode && (
        <Typography variant="caption" color="text.secondary">
          Showing archived assets from the server
        </Typography>
      )}
    </Box>
  );
}
