import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArchiveOutlined,
  CloseOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import { inspectionImportService } from "../../services/inspectionImportService";
import type { InspectionImport } from "../../types/inspectionImport";
import type { ProjectAsset } from "../../types/projectAsset";

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  asset: ProjectAsset;
  onChanged?: () => void | Promise<void>;
};

const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "disk", label: "Disk" },
  { value: "onedrive", label: "OneDrive" },
  { value: "email", label: "Email" },
  { value: "generic-kv", label: "Generic Key-Value" },
];

export default function InspectionImportDialog({ open, onClose, projectId, asset, onChanged }: Props) {
  const [activeImport, setActiveImport] = useState<InspectionImport | null>(null);
  const [archivedImports, setArchivedImports] = useState<InspectionImport[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const [rawJson, setRawJson] = useState("");
  const [source, setSource] = useState("manual");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState("manual");
  const [editingRawJson, setEditingRawJson] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const all = await inspectionImportService.listByProjectIncludeArchived(projectId, asset.id);
      setActiveImport(all.find((i) => !i.isArchived) ?? null);
      setArchivedImports(all.filter((i) => i.isArchived));
    } catch {
      setError("Unable to load inspection imports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      setRawJson("");
      setSource("manual");
      setUploadError(null);
      setEditingId(null);
      setShowArchived(false);
      void load();
    }
  }, [open, asset.id]);

  async function handleUpload() {
    if (!rawJson.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      await inspectionImportService.create({
        source,
        rawJson,
        projectId,
        projectAssetId: asset.id,
      });
      setRawJson("");
      await load();
      await onChanged?.();
    } catch {
      setUploadError("Unable to upload inspection import.");
    } finally {
      setUploading(false);
    }
  }

  function startEditing(item: InspectionImport) {
    setEditingId(item.id);
    setEditingSource(item.source);
    setEditingRawJson(item.rawJson);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingSource("manual");
    setEditingRawJson("");
  }

  async function handleSaveEdit(item: InspectionImport) {
    if (!editingRawJson.trim()) return;
    setSavingEditId(item.id);
    setError(null);
    try {
      await inspectionImportService.update(item.id, { source: editingSource, rawJson: editingRawJson });
      cancelEditing();
      await load();
      await onChanged?.();
    } catch {
      setError("Unable to update inspection import.");
    } finally {
      setSavingEditId(null);
    }
  }

  async function handleDelete(item: InspectionImport) {
    setDeletingId(item.id);
    setError(null);
    try {
      await inspectionImportService.remove(item.id);
      if (editingId === item.id) cancelEditing();
      await load();
      await onChanged?.();
    } catch {
      setError("Unable to delete inspection import.");
    } finally {
      setDeletingId(null);
    }
  }

  const assetLabel = asset.assetTag || asset.assetName || asset.id;
  const hasExisting = !!activeImport;
  const showReplaceWarning = hasExisting && rawJson.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
          Inspection Import — {assetLabel}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseOutlined />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2.5 }}>
        <Stack spacing={3}>

          {/* Upload Panel */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontFamily: "Sora" }}>
              Inspection Inbox Upload
            </Typography>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <FormControl sx={{ minWidth: 200 }} size="small">
                  <InputLabel id="import-dialog-source">Source</InputLabel>
                  <Select
                    labelId="import-dialog-source"
                    value={source}
                    label="Source"
                    onChange={(e) => setSource(e.target.value)}
                  >
                    {SOURCE_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <TextField
                label="Raw inspection JSON"
                multiline
                minRows={8}
                fullWidth
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                size="small"
              />

              {showReplaceWarning && (
                <Alert severity="warning" icon={<WarningAmberOutlined />}>
                  An existing inspection import is already saved for this asset. Uploading will archive
                  the current import and replace it with this one.
                </Alert>
              )}

              {uploadError && <Alert severity="error">{uploadError}</Alert>}

              <Box>
                <Button
                  variant="contained"
                  onClick={() => void handleUpload()}
                  disabled={!rawJson.trim() || uploading}
                  startIcon={uploading ? <CircularProgress size={14} /> : undefined}
                >
                  {uploading ? "Saving..." : "Save Import"}
                </Button>
              </Box>
            </Stack>
          </Box>

          {/* Active Inbox Item */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontFamily: "Sora" }}>
              Current Import
            </Typography>
            {loading ? (
              <Typography variant="body2" color="text.secondary">Loading...</Typography>
            ) : error ? (
              <Alert severity="error">{error}</Alert>
            ) : !activeImport ? (
              <Typography variant="body2" color="text.secondary">
                No inspection import for this asset yet.
              </Typography>
            ) : (
              <ImportItem
                item={activeImport}
                asset={asset}
                projectId={projectId}
                editingId={editingId}
                editingSource={editingSource}
                editingRawJson={editingRawJson}
                savingEditId={savingEditId}
                deletingId={deletingId}
                onStartEdit={startEditing}
                onCancelEdit={cancelEditing}
                onSaveEdit={handleSaveEdit}
                onDelete={handleDelete}
                onEditSourceChange={setEditingSource}
                onEditJsonChange={setEditingRawJson}
                onChanged={async () => { await load(); await onChanged?.(); }}
              />
            )}
          </Box>

          {/* Archived Imports */}
          {archivedImports.length > 0 && (
            <Box>
              <Button
                size="small"
                variant="text"
                startIcon={showArchived ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
                onClick={() => setShowArchived((v) => !v)}
                sx={{ mb: 1 }}
              >
                {showArchived ? "Hide" : "Show"} archived imports ({archivedImports.length})
              </Button>
              <Collapse in={showArchived}>
                <Stack spacing={1.5}>
                  {archivedImports.map((item) => (
                    <ArchivedItem key={item.id} item={item} />
                  ))}
                </Stack>
              </Collapse>
            </Box>
          )}

        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose} variant="outlined">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ------------------------------------------------------------------

type ImportItemProps = {
  item: InspectionImport;
  asset: ProjectAsset;
  projectId: string;
  editingId: string | null;
  editingSource: string;
  editingRawJson: string;
  savingEditId: string | null;
  deletingId: string | null;
  onStartEdit: (item: InspectionImport) => void;
  onCancelEdit: () => void;
  onSaveEdit: (item: InspectionImport) => void;
  onDelete: (item: InspectionImport) => void;
  onEditSourceChange: (v: string) => void;
  onEditJsonChange: (v: string) => void;
  onChanged: () => Promise<void>;
};

function ImportItem({
  item,
  editingId,
  editingSource,
  editingRawJson,
  savingEditId,
  deletingId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onEditSourceChange,
  onEditJsonChange,
}: ImportItemProps) {
  const isEditing = editingId === item.id;
  const isSaving = savingEditId === item.id;
  const isDeleting = deletingId === item.id;

  const statusColor = item.status === "MAPPED"
    ? "success"
    : item.status === "FAILED"
      ? "error"
      : item.status === "NEEDS_ASSIGNMENT"
        ? "warning"
        : "default";

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
            <Chip label={item.status} size="small" color={statusColor} variant="outlined" />
            <Chip label={item.source} size="small" variant="outlined" />
            {item.mappedRunId && (
              <Chip label="Run linked" size="small" color="success" variant="filled" />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            Received {new Date(item.receivedAt).toLocaleString()}
          </Typography>
          {item.error && (
            <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.5 }}>
              {item.error}
            </Typography>
          )}

          {isEditing ? (
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              <FormControl size="small" sx={{ maxWidth: 220 }}>
                <InputLabel id={`edit-src-${item.id}`}>Source</InputLabel>
                <Select
                  labelId={`edit-src-${item.id}`}
                  value={editingSource}
                  label="Source"
                  onChange={(e) => onEditSourceChange(e.target.value)}
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                value={editingRawJson}
                multiline
                minRows={8}
                fullWidth
                size="small"
                onChange={(e) => onEditJsonChange(e.target.value)}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => onSaveEdit(item)}
                  disabled={!editingRawJson.trim() || isSaving}
                  startIcon={isSaving ? <CircularProgress size={12} /> : undefined}
                >
                  {isSaving ? "Saving..." : "Save JSON"}
                </Button>
                <Button variant="text" size="small" onClick={onCancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
              </Stack>
            </Stack>
          ) : (
            <TextField
              value={item.rawJson}
              multiline
              minRows={5}
              fullWidth
              size="small"
              InputProps={{ readOnly: true }}
              sx={{ mt: 1 }}
            />
          )}
        </Box>

        {/* Action buttons */}
        {!isEditing && (
          <Stack spacing={1} sx={{ minWidth: 140 }}>
            <Tooltip title="Edit the JSON content of this import">
              <Button
                variant="outlined"
                size="small"
                onClick={() => onStartEdit(item)}
                disabled={isDeleting}
              >
                Edit JSON
              </Button>
            </Tooltip>
            <Tooltip title="Permanently delete this import (cannot be undone)">
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={() => onDelete(item)}
                disabled={isDeleting}
                startIcon={isDeleting ? <CircularProgress size={12} /> : undefined}
              >
                {isDeleting ? "Deleting..." : "Delete JSON"}
              </Button>
            </Tooltip>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

// ------------------------------------------------------------------

function ArchivedItem({ item }: { item: InspectionImport }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5, opacity: 0.7 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <ArchiveOutlined fontSize="small" color="disabled" />
        <Chip label="Archived" size="small" variant="outlined" />
        <Chip label={item.source} size="small" variant="outlined" />
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block">
        Received {new Date(item.receivedAt).toLocaleString()}
      </Typography>
      {item.archivedAt && (
        <Typography variant="caption" color="text.secondary" display="block">
          Archived {new Date(item.archivedAt).toLocaleString()} by {item.archivedBy ?? "unknown"}
          {item.archiveRef ? ` — Ref: ${item.archiveRef}` : ""}
        </Typography>
      )}
      {item.archiveReason && (
        <Typography variant="caption" color="text.secondary" display="block">
          Reason: {item.archiveReason}
        </Typography>
      )}
    </Box>
  );
}
