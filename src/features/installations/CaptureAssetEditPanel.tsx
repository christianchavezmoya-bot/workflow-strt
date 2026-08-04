import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { UserRole } from "../../types/user";
import type { ProjectCaptureColumn, ProjectCaptureGroup } from "../../utils/projectCaptureTable";
import { pickCaptureRun } from "../../utils/captureSpreadsheet";
import { canEditRun } from "../../utils/runEditPermissions";
import { isCaptureColumnEditable } from "../../utils/captureTableEdit";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { groupPalette } from "./captureSpreadsheetTableLayout";

type CaptureAssetEditPanelProps = {
  open: boolean;
  asset: ProjectAsset | null;
  orderedGroups: ProjectCaptureGroup[];
  cellValues: Record<string, string>;
  runsMap: Record<string, AssetWorkflowRun[]>;
  userRole?: UserRole | null;
  currentUserName?: string;
  canEditAsset?: boolean;
  onClose: () => void;
  onRunUpdated?: (run: AssetWorkflowRun) => void;
};

function columnFieldLabel(column: ProjectCaptureColumn): string {
  return column.displayLabel.replace(/\n/g, " · ");
}

export default function CaptureAssetEditPanel({
  open,
  asset,
  orderedGroups,
  cellValues,
  runsMap,
  userRole = null,
  currentUserName = "",
  canEditAsset = true,
  onClose,
  onRunUpdated,
}: CaptureAssetEditPanelProps) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const run = useMemo(
    () => (asset ? pickCaptureRun(runsMap[asset.id] ?? []) : undefined),
    [asset, runsMap],
  );

  const canEditRunData = Boolean(run && canEditRun(run, userRole).data && canEditAsset);

  const editableColumns = useMemo(() => {
    if (!canEditRunData) return [] as Array<{ group: ProjectCaptureGroup; column: ProjectCaptureColumn }>;
    const items: Array<{ group: ProjectCaptureGroup; column: ProjectCaptureColumn }> = [];
    for (const group of orderedGroups) {
      for (const column of group.columns) {
        if (!column.stepId || !column.inputId || !isCaptureColumnEditable(column.inputType)) continue;
        items.push({ group, column });
      }
    }
    return items;
  }, [canEditRunData, orderedGroups]);

  useEffect(() => {
    if (!open || !asset) return;
    setDraft({ ...cellValues });
    setError(null);
    setSaving(false);
  }, [asset, cellValues, open]);

  const dirtyKeys = useMemo(() => {
    return editableColumns
      .map(({ column }) => column.id)
      .filter((columnId) => (draft[columnId] ?? "").trim() !== (cellValues[columnId] ?? "").trim());
  }, [cellValues, draft, editableColumns]);

  const isDirty = dirtyKeys.length > 0;

  const requestClose = useCallback(() => {
    if (saving) return;
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  }, [isDirty, onClose, saving]);

  const handleSave = useCallback(async () => {
    if (!asset || !run || dirtyKeys.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    let latestRun: AssetWorkflowRun = run;
    try {
      for (const columnId of dirtyKeys) {
        const binding = editableColumns.find(({ column }) => column.id === columnId)?.column;
        if (!binding?.stepId || !binding.inputId) continue;
        latestRun = await assetWorkflowRunService.patchCaptureCell(
          run.id,
          {
            stepId: binding.stepId,
            inputId: binding.inputId,
            iterationIndex: binding.iterationIndex,
          },
          (draft[columnId] ?? "").trim(),
          currentUserName || undefined,
        );
      }
      onRunUpdated?.(latestRun);
      onClose();
    } catch {
      setError(`Could not save changes for ${asset.assetTag}. Check your connection and try again.`);
    } finally {
      setSaving(false);
    }
  }, [
    asset,
    currentUserName,
    dirtyKeys,
    draft,
    editableColumns,
    onClose,
    onRunUpdated,
    run,
  ]);

  if (!asset) return null;

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={requestClose}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 420 },
            maxWidth: "100vw",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Edit capture — {asset.assetTag}
          </Typography>
          {asset.assetName && (
            <Typography variant="caption" color="text.secondary">
              {asset.assetName}
            </Typography>
          )}
          {isDirty && (
            <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 0.5 }}>
              {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? "" : "s"}
            </Typography>
          )}
        </Box>

        <Box sx={{ flex: 1, overflow: "auto", px: 2, py: 1.5 }}>
          {!run && (
            <Alert severity="info" sx={{ mb: 1 }}>
              No workflow run found for this asset. Capture values appear after a run exists.
            </Alert>
          )}
          {run && !canEditRunData && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              This run is locked or your role cannot edit capture data for this asset.
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Stack spacing={2}>
            {orderedGroups.map((group) => {
              const columns = group.columns.filter((column) =>
                editableColumns.some((item) => item.column.id === column.id)
                || (cellValues[column.id] ?? "").trim().length > 0,
              );
              if (columns.length === 0) return null;
              const palette = groupPalette(group);
              return (
                <Box key={group.key}>
                  <Typography
                    variant="overline"
                    sx={{ color: palette.border, fontWeight: 700, letterSpacing: 0.6 }}
                  >
                    {group.displayName}
                  </Typography>
                  <Stack spacing={1.25} sx={{ mt: 0.75 }}>
                    {columns.map((column) => {
                      const editable = editableColumns.some((item) => item.column.id === column.id);
                      const value = draft[column.id] ?? cellValues[column.id] ?? "";
                      if (!editable) {
                        if (!value.trim()) return null;
                        return (
                          <Box key={column.id}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              {columnFieldLabel(column)}
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.25 }}>
                              {value}
                            </Typography>
                          </Box>
                        );
                      }
                      return (
                        <TextField
                          key={column.id}
                          label={columnFieldLabel(column)}
                          size="small"
                          fullWidth
                          value={draft[column.id] ?? ""}
                          disabled={saving}
                          onChange={(e) => {
                            setDraft((prev) => ({ ...prev, [column.id]: e.target.value }));
                          }}
                        />
                      );
                    })}
                  </Stack>
                  <Divider sx={{ mt: 1.5 }} />
                </Box>
              );
            })}
          </Stack>
        </Box>

        <Stack
          direction="row"
          spacing={1}
          justifyContent="flex-end"
          sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}
        >
          <Button variant="outlined" onClick={requestClose} disabled={saving}>
            {isDirty ? "Discard" : "Close"}
          </Button>
          <Button
            variant="contained"
            onClick={() => { void handleSave(); }}
            disabled={saving || !canEditRunData || !isDirty}
          >
            {saving ? <CircularProgress size={18} color="inherit" /> : "Save changes"}
          </Button>
        </Stack>
      </Drawer>

      <Dialog open={discardConfirmOpen} onClose={() => setDiscardConfirmOpen(false)}>
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? "" : "s"} for {asset.assetTag}.
            Close without saving?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardConfirmOpen(false)}>Keep editing</Button>
          <Button
            color="warning"
            onClick={() => {
              setDiscardConfirmOpen(false);
              onClose();
            }}
          >
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
