import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import { AccessTimeOutlined, CloseOutlined, HistoryOutlined } from "@mui/icons-material";
import TimeEntriesEditorDialog from "../../components/ui/TimeEntriesEditorDialog";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { useAuth } from "../../hooks/useAuth";
import { buildProjectCaptureTable, type ProjectCaptureColumn } from "../../utils/projectCaptureTable";
import { selectAmendableColumns } from "../../utils/captureTableEdit";
import { canEditRun } from "../../utils/runEditPermissions";
import { featureService } from "../../services/featureService";
import type { AssetWorkflowRun, RunAmendment } from "../../types/assetWorkflowRun";
import type { Feature as LibFeature } from "../../types/feature";
import type { ProjectAsset } from "../../types/projectAsset";

interface Props {
  open: boolean;
  asset: ProjectAsset;
  run: AssetWorkflowRun | null;
  projectId?: string | null;
  onClose: () => void;
  onRunUpdated: (run: AssetWorkflowRun) => void;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Amend one completed run: correct captured text, correct time, and see what has already
 * been changed since the installer signed.
 *
 * Reached from the Edit column on the standalone capture route. The assets page keeps its
 * inline cell editing for bulk correction — this is the single-asset path, and the only one
 * that also exposes time and the amendment history.
 */
export default function RunAmendDialog({ open, asset, run, projectId, onClose, onRunUpdated }: Props) {
  const { user } = useAuth();
  const [features, setFeatures] = useState<LibFeature[]>([]);
  const [amendments, setAmendments] = useState<RunAmendment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingColumnId, setSavingColumnId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeEditorOpen, setTimeEditorOpen] = useState(false);

  const perms = useMemo(
    () => (run ? canEditRun(run, user.role) : { time: false, data: false, finalized: false }),
    [run, user.role],
  );

  useEffect(() => {
    if (!open || !asset.productId) return;
    let cancelled = false;
    featureService.getByProduct(asset.productId)
      .then((f) => { if (!cancelled) setFeatures(f); })
      .catch(() => { if (!cancelled) setFeatures([]); });
    return () => { cancelled = true; };
  }, [asset.productId, open]);

  const loadHistory = useCallback(() => {
    if (!run) return;
    setHistoryLoading(true);
    void assetWorkflowRunService.listAmendments(run.id)
      .then(setAmendments)
      .finally(() => setHistoryLoading(false));
  }, [run]);

  useEffect(() => {
    if (open) loadHistory();
  }, [loadHistory, open]);

  // Reuse the same builder the matrix uses, scoped to this one asset, so the editable field
  // list here can never drift from the columns shown in the table.
  const { columns, cells } = useMemo(() => {
    if (!run || features.length === 0) return { columns: [] as ProjectCaptureColumn[], cells: {} as Record<string, string> };
    const table = buildProjectCaptureTable([asset], { [asset.id]: [run] }, features);
    return { columns: table.columns, cells: table.rows[0]?.cells ?? {} };
  }, [asset, features, run]);

  const editableColumns = useMemo(() => selectAmendableColumns(columns), [columns]);

  const saveField = useCallback(async (column: ProjectCaptureColumn) => {
    if (!run || !column.stepId || !column.inputId) return;
    const next = drafts[column.id];
    if (next === undefined || next === (cells[column.id] ?? "")) return;
    setSavingColumnId(column.id);
    setError(null);
    try {
      const updated = await assetWorkflowRunService.patchCaptureCell(
        run.id,
        { stepId: column.stepId, inputId: column.inputId, iterationIndex: column.iterationIndex },
        next,
        user.fullName ?? user.email ?? undefined,
        column.fieldLabel,
      );
      onRunUpdated(updated);
      setDrafts((prev) => {
        const rest = { ...prev };
        delete rest[column.id];
        return rest;
      });
      loadHistory();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(message ?? `Could not save ${column.fieldLabel}. Try again.`);
    } finally {
      setSavingColumnId(null);
    }
  }, [cells, drafts, loadHistory, onRunUpdated, run, user.email, user.fullName]);

  if (!run) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>{asset.assetTag}</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info">This asset has no workflow run yet, so there is nothing to amend.</Alert>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
                {asset.assetTag || asset.assetName} — amend run
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Run #{run.runNumber} · {run.status} · {run.signatureStatus}
              </Typography>
            </Box>
            <IconButton size="small" onClick={onClose}><CloseOutlined fontSize="small" /></IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            {perms.finalized ? (
              <Alert severity="warning">
                This run was signed by the customer, so it is locked. Start a new workflow run to
                change captured data — the signed record stays as evidence of what was delivered.
              </Alert>
            ) : !perms.data && !perms.time ? (
              <Alert severity="info">
                Your role cannot amend this run at its current sign-off stage.
              </Alert>
            ) : (
              <Alert severity="info">
                Corrections are recorded against your name. The installer stays the owner of this
                run and their signature is not reset.
              </Alert>
            )}

            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

            {/* Time */}
            <Stack direction="row" alignItems="center" spacing={1}>
              <AccessTimeOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
              <Typography variant="subtitle2" sx={{ flex: 1 }}>Time</Typography>
              <Tooltip title={perms.time ? "" : "Not editable at this sign-off stage"}>
                <span>
                  <Button size="small" variant="outlined" disabled={!perms.time}
                    onClick={() => setTimeEditorOpen(true)}>
                    Edit times
                  </Button>
                </span>
              </Tooltip>
            </Stack>

            <Divider />

            {/* Captured fields */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Captured fields</Typography>
              {!perms.data ? (
                <Typography variant="caption" color="text.disabled">
                  Captured values are read-only for you on this run.
                </Typography>
              ) : editableColumns.length === 0 ? (
                <Typography variant="caption" color="text.disabled">
                  No editable text fields on this run. Photo, video and signature captures cannot
                  be amended here.
                </Typography>
              ) : (
                <Stack spacing={1.25}>
                  {editableColumns.map((column) => {
                    const current = cells[column.id] ?? "";
                    const draft = drafts[column.id];
                    return (
                      <Stack key={column.id} direction="row" spacing={1} alignItems="center">
                        <TextField
                          size="small"
                          fullWidth
                          label={column.displayLabel || column.fieldLabel}
                          value={draft ?? current}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [column.id]: e.target.value }))}
                          onBlur={() => void saveField(column)}
                          disabled={savingColumnId === column.id}
                        />
                        {savingColumnId === column.id && <CircularProgress size={16} />}
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </Box>

            <Divider />

            {/* History */}
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <HistoryOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="subtitle2" sx={{ flex: 1 }}>Change history</Typography>
                {historyLoading && <CircularProgress size={14} />}
              </Stack>
              {amendments.length === 0 ? (
                <Typography variant="caption" color="text.disabled">
                  No changes recorded since this run was completed.
                </Typography>
              ) : (
                <Stack spacing={0.75}>
                  {amendments.map((a) => (
                    <Stack key={a.id} direction="row" spacing={1} alignItems="baseline"
                      sx={{ px: 1, py: 0.5, borderRadius: 1, background: "rgba(255,255,255,0.03)" }}>
                      <Chip size="small" variant="outlined" label={a.amendedByRole ?? "User"}
                        sx={{ height: 18, fontSize: "0.6rem", flexShrink: 0 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" display="block">
                          <strong>{a.fieldLabel ?? a.kind}</strong>
                          {a.oldValue != null || a.newValue != null ? (
                            <> · {a.oldValue || "(empty)"} → {a.newValue || "(empty)"}</>
                          ) : null}
                        </Typography>
                        <Typography variant="caption" color="text.disabled" display="block" sx={{ fontSize: "0.65rem" }}>
                          {a.amendedByName} · {formatWhen(a.amendedAtUtc)} · during {a.signatureStatusAtAmend}
                        </Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {timeEditorOpen && (
        <TimeEntriesEditorDialog
          open
          run={run}
          projectId={projectId}
          readOnly={!perms.time}
          onClose={() => setTimeEditorOpen(false)}
          onSaved={(updated) => {
            onRunUpdated(updated);
            loadHistory();
          }}
        />
      )}
    </>
  );
}
