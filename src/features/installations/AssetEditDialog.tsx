import { memo, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Project } from "../../types/project";
import type { ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { User } from "../../types/user";
import { projectAssetService } from "../../services/projectAssetService";
import { STATUS_COLORS, STATUS_LABELS } from "./assetStatusDisplay";

interface AssetForm {
  projectId: string;
  configId: string;
  assetTag: string;
  assetName: string;
  serialNumber: string;
  assetModel: string;
  manufacturer: string;
  location: string;
  assignedUserId: string;
  notes: string;
  featureValues: Record<string, string>;
}

function formFromAsset(asset: ProjectAsset, getSiteLocation: (siteId?: string) => string, project?: Project): AssetForm {
  let fv: Record<string, string> = {};
  try {
    fv = JSON.parse(asset.featureValuesJson || "{}");
  } catch {
    // ignore
  }
  return {
    projectId: asset.projectId,
    configId: asset.productConfigId ?? "",
    assetTag: asset.assetTag,
    assetName: asset.assetName ?? "",
    serialNumber: asset.serialNumber ?? "",
    assetModel: asset.assetModel ?? "",
    manufacturer: asset.manufacturer ?? "",
    location: asset.location || getSiteLocation(project?.siteId),
    assignedUserId: asset.assignedUserId ?? "",
    notes: asset.notes ?? "",
    featureValues: fv,
  };
}

interface Props {
  open: boolean;
  asset: ProjectAsset | null;
  users: User[];
  latestPublishedWfConfigs: WorkflowConfig[];
  getProject: (projectId: string) => Project | undefined;
  getSiteLocation: (siteId?: string) => string;
  canEditAssetStatus: boolean;
  onClose: () => void;
  onUpdated: (asset: ProjectAsset) => void;
}

function AssetEditDialogInner({
  asset,
  users,
  latestPublishedWfConfigs,
  getProject,
  getSiteLocation,
  canEditAssetStatus,
  onClose,
  onUpdated,
}: Omit<Props, "open" | "asset"> & { asset: ProjectAsset }) {
  const [form, setForm] = useState(() => formFromAsset(asset, getSiteLocation, getProject(asset.projectId)));
  const [currentAsset, setCurrentAsset] = useState(asset);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelDialogMode, setCancelDialogMode] = useState<"cancel" | "undo">("cancel");
  const [cancelReason, setCancelReason] = useState("");
  const [cancellingAsset, setCancellingAsset] = useState(false);

  useEffect(() => {
    setCurrentAsset(asset);
    setForm(formFromAsset(asset, getSiteLocation, getProject(asset.projectId)));
    setError(null);
    setCancelConfirmOpen(false);
    setCancelReason("");
    // Reset only when a different asset is opened, not on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asset identity keyed by id
  }, [asset.id]);

  const isCancelled = currentAsset.status === "Cancelled";
  const project = getProject(currentAsset.projectId);

  async function save() {
    const tag = form.assetTag.trim();
    if (!tag) {
      setError("Asset tag is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await projectAssetService.update(currentAsset.id, {
        assetTag: tag,
        assetName: form.assetName.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        assetModel: form.assetModel.trim() || undefined,
        manufacturer: form.manufacturer.trim() || undefined,
        location: form.location.trim() || undefined,
        assignedUserId: form.assignedUserId || undefined,
        notes: form.notes.trim() || undefined,
        productConfigId: form.configId,
        featureValuesJson: Object.keys(form.featureValues).length
          ? JSON.stringify(form.featureValues)
          : undefined,
      });
      onUpdated(updated);
      onClose();
    } catch {
      setError("Failed to update asset.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    const reason = cancelReason.trim();
    if (!reason) return;
    setCancellingAsset(true);
    setError(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const existingNotes = (form.notes ?? "").trim();
      const cancelNote = `[Cancelled ${stamp}] ${reason}`;
      const updated = await projectAssetService.update(currentAsset.id, {
        status: "Cancelled",
        notes: existingNotes ? `${existingNotes}\n${cancelNote}` : cancelNote,
      });
      setCurrentAsset(updated);
      setForm((prev) => ({ ...prev, notes: updated.notes ?? prev.notes }));
      onUpdated(updated);
      setCancelConfirmOpen(false);
      setCancelReason("");
    } catch {
      setError("Failed to cancel asset.");
    } finally {
      setCancellingAsset(false);
    }
  }

  async function confirmUndoCancel() {
    setCancellingAsset(true);
    setError(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const existingNotes = (form.notes ?? "").trim();
      const undoNote = `[Cancellation removed ${stamp}] Restored to Not Started`;
      const updated = await projectAssetService.update(currentAsset.id, {
        status: "NotStarted",
        notes: existingNotes ? `${existingNotes}\n${undoNote}` : undoNote,
      });
      setCurrentAsset(updated);
      setForm((prev) => ({ ...prev, notes: updated.notes ?? prev.notes }));
      onUpdated(updated);
      setCancelConfirmOpen(false);
      setCancelReason("");
    } catch {
      setError("Failed to restore asset.");
    } finally {
      setCancellingAsset(false);
    }
  }

  return (
    <>
      <DialogTitle>Edit Asset - {currentAsset.assetTag}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {isCancelled && (
            <Alert severity="warning" sx={{ fontSize: 12 }}>
              This asset is cancelled and locked. Its details and workflow can no longer be
              edited. The reason is recorded in Notes.
            </Alert>
          )}
          {project?.siteName && (
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Project #"
                size="small"
                fullWidth
                value={project.jobNumber}
                InputProps={{ readOnly: true }}
                sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }}
              />
              <TextField
                label="Site Name"
                size="small"
                fullWidth
                value={project.siteName}
                InputProps={{ readOnly: true }}
                sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }}
              />
            </Stack>
          )}

          <TextField
            label="Asset Tag *"
            size="small"
            fullWidth
            required
            value={form.assetTag}
            onChange={(e) => setForm((p) => ({ ...p, assetTag: e.target.value }))}
            InputProps={{ readOnly: Boolean(isCancelled) }}
          />
          <TextField
            label="Asset Name"
            size="small"
            fullWidth
            value={form.assetName}
            onChange={(e) => setForm((p) => ({ ...p, assetName: e.target.value }))}
            placeholder="e.g. AGI-10, Shuttle Car, Skid Steer"
            InputLabelProps={{ shrink: true }}
            InputProps={{ readOnly: Boolean(isCancelled) }}
          />
          <FormControl size="small" fullWidth>
            <InputLabel shrink>Configuration Type</InputLabel>
            <Select
              label="Configuration Type"
              value={form.configId}
              onChange={(e) => setForm((p) => ({ ...p, configId: e.target.value }))}
              disabled={Boolean(isCancelled)}
            >
              <MenuItem value="">(None)</MenuItem>
              {latestPublishedWfConfigs.map((wc) => (
                <MenuItem key={wc.id} value={wc.id}>
                  {wc.configType ? `${wc.configType} - ` : ""}
                  {wc.name}
                  {wc.version > 1 ? ` (v${wc.version})` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Serial Number"
            size="small"
            fullWidth
            value={form.serialNumber}
            onChange={(e) => setForm((p) => ({ ...p, serialNumber: e.target.value }))}
            InputProps={{ readOnly: Boolean(isCancelled) }}
          />
          <TextField
            label="Asset Model"
            size="small"
            fullWidth
            value={form.assetModel}
            onChange={(e) => setForm((p) => ({ ...p, assetModel: e.target.value }))}
            InputProps={{ readOnly: Boolean(isCancelled) }}
          />
          <TextField
            label="Manufacturer"
            size="small"
            fullWidth
            value={form.manufacturer}
            onChange={(e) => setForm((p) => ({ ...p, manufacturer: e.target.value }))}
            InputProps={{ readOnly: Boolean(isCancelled) }}
          />
          <TextField
            label="Location"
            size="small"
            fullWidth
            value={form.location}
            onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
            placeholder="i.e LV workshop, U/G"
            InputLabelProps={{ shrink: true }}
            InputProps={{ readOnly: Boolean(isCancelled) }}
          />
          <FormControl size="small" fullWidth>
            <InputLabel shrink>Assigned User</InputLabel>
            <Select
              label="Assigned User"
              value={form.assignedUserId}
              onChange={(e) => setForm((p) => ({ ...p, assignedUserId: e.target.value }))}
              disabled={Boolean(isCancelled)}
            >
              <MenuItem value="">(Unassigned)</MenuItem>
              {users.filter((u) => u.isActive).map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.fullName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "stretch", sm: "center" }}
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" color="text.secondary">
                Asset status
              </Typography>
              <Chip
                size="small"
                label={STATUS_LABELS[(currentAsset.status as ProjectAssetStatus) ?? "NotStarted"]}
                color={STATUS_COLORS[(currentAsset.status as ProjectAssetStatus) ?? "NotStarted"]}
              />
            </Stack>
            {canEditAssetStatus && (
              <Button
                color={isCancelled ? "warning" : "error"}
                onClick={() => {
                  setCancelDialogMode(isCancelled ? "undo" : "cancel");
                  setCancelReason("");
                  setCancelConfirmOpen(true);
                }}
                disabled={saving}
              >
                {isCancelled ? "Undo cancel asset" : "Cancel asset"}
              </Button>
            )}
          </Stack>
          <TextField
            label="Notes"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            InputProps={{ readOnly: Boolean(isCancelled) }}
          />
          {error && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Close
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || Boolean(isCancelled)}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </DialogActions>

      <Dialog
        open={cancelConfirmOpen}
        onClose={() => !cancellingAsset && setCancelConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{cancelDialogMode === "undo" ? "Undo asset cancellation?" : "Cancel this asset?"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {cancelDialogMode === "undo" ? (
              <Alert severity="info" sx={{ fontSize: 12 }}>
                {currentAsset.assetTag} will be restored to <strong>Not Started</strong>. The asset stays
                visible in active lists and can be worked again.
              </Alert>
            ) : (
              <>
                <Alert severity="warning" sx={{ fontSize: 12 }}>
                  {currentAsset.assetTag} will be marked <strong>Cancelled</strong> and locked from further
                  editing. It stays visible on this page and is filterable by the Cancelled status.
                  Any work already captured is kept as a record.
                </Alert>
                <TextField
                  label="Reason for cancelling *"
                  size="small"
                  fullWidth
                  required
                  multiline
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Equipment removed from site; job descoped by customer"
                  helperText="Recorded in the asset's Notes."
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelConfirmOpen(false)} disabled={cancellingAsset}>
            Back
          </Button>
          <Button
            variant="contained"
            color={cancelDialogMode === "undo" ? "warning" : "error"}
            onClick={cancelDialogMode === "undo" ? confirmUndoCancel : confirmCancel}
            disabled={cancellingAsset || (cancelDialogMode === "cancel" && !cancelReason.trim())}
            startIcon={cancellingAsset ? <CircularProgress size={14} /> : undefined}
          >
            {cancellingAsset
              ? (cancelDialogMode === "undo" ? "Restoring..." : "Cancelling...")
              : (cancelDialogMode === "undo" ? "Undo cancel asset" : "Cancel asset")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default memo(function AssetEditDialog({
  open,
  asset,
  onClose,
  ...rest
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {open && asset ? <AssetEditDialogInner asset={asset} onClose={onClose} {...rest} /> : null}
    </Dialog>
  );
});
