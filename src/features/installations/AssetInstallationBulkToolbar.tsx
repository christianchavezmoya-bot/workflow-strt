import { ArticleOutlined } from "@mui/icons-material";
import { Button, Paper, Typography } from "@mui/material";

type Props = {
  selectedCount: number;
  archiveMode: boolean;
  showBulkWorkflowReports: boolean;
  onAssignWorkflow: () => void;
  onAssignUser: () => void;
  onUploadDocuments: () => void;
  onViewReports: () => void;
  onArchiveSelected: () => void;
  onClearSelection: () => void;
};

export default function AssetInstallationBulkToolbar({
  selectedCount,
  archiveMode,
  showBulkWorkflowReports,
  onAssignWorkflow,
  onAssignUser,
  onUploadDocuments,
  onViewReports,
  onArchiveSelected,
  onClearSelection,
}: Props) {
  if (selectedCount <= 0) return null;

  return (
    <Paper className="glass-card" sx={{ px: 2, py: 1, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
      <Typography variant="body2" fontWeight={600}>
        {selectedCount} asset{selectedCount !== 1 ? "s" : ""} selected
      </Typography>

      <Button size="small" variant="outlined" onClick={onAssignWorkflow}>
        Assign workflow
      </Button>

      <Button size="small" variant="outlined" onClick={onAssignUser}>
        Assign user
      </Button>

      <Button size="small" variant="outlined" onClick={onUploadDocuments}>
        Upload documents
      </Button>

      {showBulkWorkflowReports && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<ArticleOutlined fontSize="small" />}
          onClick={onViewReports}
        >
          View / Print Reports
        </Button>
      )}

      {!archiveMode && (
        <Button size="small" variant="outlined" color="error" onClick={onArchiveSelected}>
          Archive selected
        </Button>
      )}

      <Button size="small" color="inherit" onClick={onClearSelection}>
        Clear
      </Button>
    </Paper>
  );
}
