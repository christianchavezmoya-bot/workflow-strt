import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import CodeIcon from "@mui/icons-material/Code";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import SyncIcon from "@mui/icons-material/Sync";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { inspectionImportService } from "../../services/inspectionImportService";
import type { InspectionImport } from "../../types/project";
import type { ProjectAsset } from "../../types/projectAsset";
import { INSPECTION_DIALOG_SOURCE_OPTIONS, INSPECTION_IMPORT_STATUS_COLOR } from "./inspectionInboxShared";
import api from "../../services/api";

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  asset: ProjectAsset;
  onChanged?: () => void | Promise<void>;
};

export default function InspectionImportDialog({ open, onClose, projectId, asset, onChanged }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imports, setImports] = useState<InspectionImport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New import form
  const [rawJson, setRawJson] = useState("");
  const [source, setSource] = useState<string>("LOCAL");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // File upload
  const [uploading, setUploading] = useState(false);

  // Mark-failed inline state
  const [failingId, setFailingId] = useState<string | null>(null);
  const [failText, setFailText] = useState("");
  const [failSaving, setFailSaving] = useState(false);

  // Raw JSON viewer
  const [viewItem, setViewItem] = useState<InspectionImport | null>(null);
  const [viewRaw, setViewRaw] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Reprocess
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const all = await inspectionImportService.list({ assetId: asset.id });
      setImports(all);
    } catch {
      setError("Unable to load inspection imports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      setRawJson("");
      setSaveError(null);
      setFailingId(null);
      setViewItem(null);
      setViewRaw(null);
      void load();
    }
  }, [open, asset.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save pasted JSON ──────────────────────────────────────────────────────
  async function handleSave() {
    if (!rawJson.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await inspectionImportService.create({
        source,
        rawJson: rawJson.trim(),
        projectId,
        assetId: asset.id,
        uploadedBy: user?.email,
      });
      setRawJson("");
      await load();
      await onChanged?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSaveError(msg || "Unable to save inspection import.");
    } finally {
      setSaving(false);
    }
  }

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(true);
    setSaveError(null);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("projectId", projectId);
      formData.append("assetId", asset.id);
      formData.append("source", source);
      if (user?.email) formData.append("uploadedBy", user.email);
      await api.post("/inspection-imports/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
      await onChanged?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSaveError(msg || "Upload failed. The file may already have been imported.");
    } finally {
      setUploading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    try {
      await inspectionImportService.remove(id);
      setImports((prev) => prev.filter((x) => x.id !== id));
      await onChanged?.();
    } catch {
      setError("Failed to delete import.");
    }
  }

  // ── Mark failed ───────────────────────────────────────────────────────────
  async function handleMarkFailed() {
    if (!failingId) return;
    setFailSaving(true);
    try {
      await inspectionImportService.markFailed(failingId, failText || undefined);
      setFailingId(null);
      setFailText("");
      await load();
    } catch {
      setError("Failed to mark as failed.");
    } finally {
      setFailSaving(false);
    }
  }

  // ── Reprocess ─────────────────────────────────────────────────────────────
  async function handleReprocess(id: string) {
    setReprocessingId(id);
    try {
      await api.post(`/inspection-imports/${id}/reprocess`);
      await load();
      await onChanged?.();
    } catch {
      setError("Failed to reprocess import.");
    } finally {
      setReprocessingId(null);
    }
  }

  // ── View raw JSON ─────────────────────────────────────────────────────────
  async function handleViewRaw(item: InspectionImport) {
    setViewItem(item);
    setViewRaw(null);
    if (item.rawJson) { setViewRaw(item.rawJson); return; }
    setViewLoading(true);
    try {
      const res = await api.get<string>(`/inspection-imports/${item.id}/raw`, { responseType: "text" });
      setViewRaw(res.data);
    } catch {
      setViewRaw("(could not load raw content)");
    } finally {
      setViewLoading(false);
    }
  }

  function handleDownload() {
    if (!viewItem || !viewRaw) return;
    const blob = new Blob([viewRaw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = viewItem.fileName || `${viewItem.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const prettyJson = (raw: string | null) => {
    if (!raw) return "(no raw JSON stored)";
    try { return JSON.stringify(JSON.parse(raw), null, 2); }
    catch { return raw; }
  };

  const hasExistingActive = imports.some((i) => i.status !== "FAILED");
  const canEdit = user?.role === "Admin" || user?.role === "Project Manager";

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle sx={{ pb: 1 }}>
          Inspection Import — {asset.assetTag || asset.assetName || asset.id}
        </DialogTitle>

        <DialogContent dividers sx={{ p: 2.5 }}>
          <Stack spacing={3}>

            {/* ── Upload / paste panel ── */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                Import inspection JSON
              </Typography>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="flex-start">
                  <FormControl sx={{ minWidth: 200 }} size="small">
                    <InputLabel>Source</InputLabel>
                    <Select
                      value={source}
                      label="Source"
                      onChange={(e) => setSource(e.target.value as typeof source)}
                    >
                      {INSPECTION_DIALOG_SOURCE_OPTIONS.map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Stack direction="row" spacing={1}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={uploading || saving}
                      startIcon={uploading ? <CircularProgress size={14} /> : undefined}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? "Uploading..." : "Upload file"}
                    </Button>
                  </Stack>
                </Stack>

                <TextField
                  label="Or paste raw JSON here"
                  multiline
                  minRows={7}
                  fullWidth
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                  size="small"
                  placeholder={"{\n  \"inspectionDate\": \"...\",\n  ...\n}"}
                />

                {hasExistingActive && rawJson.trim().length > 0 && (
                  <Alert severity="warning" icon={<WarningAmberOutlined />}>
                    An active import already exists for this asset. Saving will create an additional import record — use the existing one or delete it first if you want to replace it.
                  </Alert>
                )}

                {saveError && <Alert severity="error" onClose={() => setSaveError(null)}>{saveError}</Alert>}

                <Box>
                  <Button
                    variant="contained"
                    onClick={() => void handleSave()}
                    disabled={!rawJson.trim() || saving || uploading}
                    startIcon={saving ? <CircularProgress size={14} /> : undefined}
                  >
                    {saving ? "Saving..." : "Save JSON"}
                  </Button>
                </Box>
              </Stack>
            </Box>

            <Divider />

            {/* ── Existing imports ── */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                Imports for this asset ({imports.length})
              </Typography>

              {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>{error}</Alert>}

              {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : imports.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No imports yet. Use the form above to add one.
                </Typography>
              ) : (
                <Stack spacing={1.5}>
                  {imports.map((item) => (
                    <Box
                      key={item.id}
                      sx={{
                        border: "1px solid",
                        borderColor: item.status === "FAILED" ? "error.main" : "divider",
                        borderRadius: 1,
                        p: 1.5,
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {item.fileName || item.id}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.source} · {new Date(item.receivedAt).toLocaleString()}
                            {item.uploadedBy ? ` · ${item.uploadedBy}` : ""}
                            {item.mappedRunId ? " · Run linked" : ""}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 1, flexShrink: 0 }}>
                          <Chip
                            label={item.status}
                            size="small"
                            color={INSPECTION_IMPORT_STATUS_COLOR[item.status] ?? "default"}
                          />
                          <Tooltip title="View raw JSON">
                            <IconButton size="small" onClick={() => void handleViewRaw(item)}>
                              <CodeIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {canEdit && item.status === "MAPPED" && (
                            <Tooltip title="Reprocess — re-read JSON and update linked run step data">
                              <IconButton
                                size="small"
                                color="info"
                                disabled={reprocessingId === item.id}
                                onClick={() => void handleReprocess(item.id)}
                              >
                                {reprocessingId === item.id
                                  ? <CircularProgress size={14} />
                                  : <SyncIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          )}
                          {canEdit && item.status !== "FAILED" && (
                            <Tooltip title="Mark as failed">
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() => { setFailingId(item.id); setFailText(""); }}
                              >
                                <ErrorOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canEdit && (
                            <Tooltip title="Delete import">
                              <IconButton size="small" color="error" onClick={() => void handleDelete(item.id)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </Stack>

                      {failingId === item.id && (
                        <Box sx={{ mt: 1 }}>
                          <Divider sx={{ mb: 1 }} />
                          <Stack spacing={1}>
                            <TextField
                              size="small"
                              fullWidth
                              label="Reason for failure (optional)"
                              value={failText}
                              onChange={(e) => setFailText(e.target.value)}
                              multiline
                              rows={2}
                            />
                            <Stack direction="row" spacing={1}>
                              <Button size="small" variant="contained" color="warning" disabled={failSaving} onClick={() => void handleMarkFailed()}>
                                {failSaving ? "Saving..." : "Confirm Failed"}
                              </Button>
                              <Button size="small" variant="text" onClick={() => { setFailingId(null); setFailText(""); }}>
                                Cancel
                              </Button>
                            </Stack>
                          </Stack>
                        </Box>
                      )}

                      {item.errorText && failingId !== item.id && (
                        <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.75 }}>
                          {item.errorText}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button onClick={onClose} variant="outlined">Close</Button>
        </DialogActions>
      </Dialog>

      {/* Raw JSON viewer dialog */}
      <Dialog
        open={!!viewItem}
        onClose={() => { setViewItem(null); setViewRaw(null); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Raw JSON — {viewItem?.fileName || viewItem?.id}</DialogTitle>
        <DialogContent>
          {viewLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box
              component="pre"
              sx={{
                fontSize: "0.75rem",
                overflowX: "auto",
                background: "rgba(0,0,0,0.2)",
                p: 2,
                borderRadius: 1,
                maxHeight: 400,
                overflowY: "auto",
              }}
            >
              {prettyJson(viewRaw)}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDownload} disabled={!viewRaw} startIcon={<DownloadIcon />}>
            Download
          </Button>
          <Button onClick={() => { setViewItem(null); setViewRaw(null); }}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
