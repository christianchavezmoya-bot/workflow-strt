import { useState } from "react";
import { Button, Divider, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import { DownloadOutlined, ExpandMoreOutlined, RestartAltOutlined, SyncOutlined, UploadOutlined } from "@mui/icons-material";

export interface WorkflowActionsMenuProps {
  /** Regenerate becomes "Generate Workflow" (first-time wording) once there are no steps yet. */
  hasSteps: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  canSync: boolean;
  onSync: () => void;
  onExportContext: () => void;
  canExportJson: boolean;
  onExportJson: () => void;
  canImportJson: boolean;
  onImportJson: () => void;
}

/**
 * GOAL 5: the single "Workflow Actions" menu — one normal user-facing location for all five
 * workflow utilities (Regenerate/Generate, Sync Feature Changes, Export Workflow Context, Export
 * Workflow JSON, Import Workflow JSON). Run/Publish/New Workflow stay outside this menu.
 *
 * A standalone component (rather than inline JSX in WorkflowBuilder.tsx) specifically so it can
 * be unit-tested in isolation — importing WorkflowBuilder.tsx itself currently fails under Vitest
 * due to a pre-existing @mui/x-date-pickers ESM resolution issue in one of its other
 * sub-components, unrelated to this change.
 */
export function WorkflowActionsMenu({
  hasSteps, canRegenerate, onRegenerate, canSync, onSync,
  onExportContext, canExportJson, onExportJson, canImportJson, onImportJson,
}: WorkflowActionsMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = () => setAnchorEl(null);

  return (
    <>
      <Button size="small" variant="outlined" endIcon={<ExpandMoreOutlined />} onClick={(e) => setAnchorEl(e.currentTarget)}>
        Workflow Actions
      </Button>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={close}>
        <MenuItem disabled={!canRegenerate} onClick={() => { close(); onRegenerate(); }}>
          <ListItemIcon><RestartAltOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>{hasSteps ? "Regenerate Workflow" : "Generate Workflow"}</ListItemText>
        </MenuItem>
        <MenuItem disabled={!canSync} onClick={() => { close(); onSync(); }}>
          <ListItemIcon><SyncOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Sync Feature Changes</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { close(); onExportContext(); }}>
          <ListItemIcon><DownloadOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Export Workflow Context</ListItemText>
        </MenuItem>
        <MenuItem disabled={!canExportJson} onClick={() => { close(); onExportJson(); }}>
          <ListItemIcon><DownloadOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Export Workflow JSON</ListItemText>
        </MenuItem>
        <MenuItem disabled={!canImportJson} onClick={() => { close(); onImportJson(); }}>
          <ListItemIcon><UploadOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Import Workflow JSON</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

export default WorkflowActionsMenu;
