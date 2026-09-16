import { useState } from "react";
import { Button, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import { BuildOutlined, DownloadOutlined, ExpandMoreOutlined, UploadOutlined } from "@mui/icons-material";

export interface AdvancedWorkflowActionsMenuProps {
  onExportRawJson: () => void;
  onImportRawJson: () => void;
}

/**
 * The older, pre-WF-6 raw workflow JSON export/import (no schema version, no server-side
 * validation, no product/feature matching — just the current in-memory `workflow.steps`
 * verbatim). Kept for backward compatibility (some existing files/workflows only round-trip
 * through this exact shape), but it must not compete with the normal, safer "Export Workflow
 * JSON" / "Import Workflow JSON" pair (WF-6, schema-versioned, server-validated) in the everyday
 * Builder UI. Tucked behind a clearly labeled "Advanced" menu instead of sitting as its own
 * toolbar buttons.
 */
export function AdvancedWorkflowActionsMenu({ onExportRawJson, onImportRawJson }: AdvancedWorkflowActionsMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = () => setAnchorEl(null);

  return (
    <>
      <Button size="small" variant="text" color="inherit" endIcon={<ExpandMoreOutlined />} startIcon={<BuildOutlined fontSize="small" />} onClick={(e) => setAnchorEl(e.currentTarget)}>
        Advanced
      </Button>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={close}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: "block" }}>
          Legacy raw workflow file (no product/feature validation)
        </Typography>
        <MenuItem onClick={() => { close(); onExportRawJson(); }}>
          <ListItemIcon><DownloadOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Export Raw JSON (legacy)</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { close(); onImportRawJson(); }}>
          <ListItemIcon><UploadOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Import Raw JSON (legacy)</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

export default AdvancedWorkflowActionsMenu;
