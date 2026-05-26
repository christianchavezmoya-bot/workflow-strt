import { useEffect, useRef, useState } from "react";
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
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import type { ProjectAsset } from "../../types/projectAsset";
import type { InspectionImport } from "../../types/project";
import { inspectionImportService } from "../../services/inspectionImportService";
import { useAuth } from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";

interface AssetWorkflowRun {
  id: string;
  workflowTypeName: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  assignedTo?: string;
}

interface Props {
  asset: ProjectAsset | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, "default" | "info" | "warning" | "success" | "error"> = {
  RECEIVED:          "info",
  NEEDS_ASSIGNMENT:  "warning",
  MAPPED:            "success",
  FAILED:            "error",
  InProgress:        "info",
  Paused:            "warning",
  Complete:          "success",
  Issue:             "error",
  NotStarted:        "default",
};

const STATUS_LABEL: Record<string, string> = {
  RECEIVED:         "Received",
  NEEDS_ASSIGNMENT: "Needs Assignment",
  MAPPED:           "Mapped",
  FAILED:           "Failed",
};

const AssetInspectionDialog = ({ asset, open, onClose }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [runs, setRuns] = useState<AssetWorkflowRun[]>([]);
  const [imports, setImports] = useState<InspectionImport[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline "mark failed" state
  const [failingId, setFailingId] = useState<string | null>(null);
  const [failText, setFailText] = useState("");
  const [failSaving, setFailSaving] = useState(false);

  // Raw JSON viewer state
  const [viewItem, setViewItem] = useState<InspectionImport | null>(null);
  const [viewRaw, setViewRaw] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const load = () => {
    if (!asset) return;
    setLoading(true);
    Promise.all([
      api.get<AssetWorkflowRun[]>("/asset-workflow-runs", {
        params: { assetId: asset.id, workflowType: "Inspection" },
      }),
      inspectionImportService.list({ assetId: asset.id }),
    ])
      .then(([runRes, importItems]) => {
        setRuns(runRes.data);
        setImports(importItems);
      })
      .catch(() => setError("Unable to load inspection data."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open || !asset) return;
    setError(null);
    load();
  }, [open, asset]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload JSON for this specific asset ──────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !asset) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      if (asset.projectId) formData.append("projectId", asset.projectId);
      formData.append("assetId", asset.id);
      formData.append("source", "LOCAL");
      if (user?.email) formData.append("uploadedBy", user.email);
      await api.post("/inspection-imports/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Upload failed. The file may already have been imported.");
    } finally {
      setUploading(false);
    }
  };

  // ── Assign import to this asset ──────────────────────────────────────────────
  const handleAssignToThisAsset = async (item: InspectionImport) => {
    if (!asset?.projectId) return;
    try {
      await inspectionImportService.assign(item.id, { projectId: asset.projectId, assetId: asset.id });
      load();
    } catch {
      setError("Failed to assign import.");
    }
  };

  // ── Mark failed ──────────────────────────────────────────────────────────────
  const handleMarkFailed = async () => {
    if (!failingId) return;
    setFailSaving(true);
    try {
      await inspectionImportService.markFailed(failingId, failText || undefined);
      setFailingId(null);
      setFailText("");
      load();
    } catch {
      setError("Failed to mark import as failed.");
    } finally {
      setFailSaving(false);
    }
  };

  // ── Delete import ────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      await inspectionImportService.remove(id);
      setImports((prev) => prev.filter((x) => x.id !== id));
    } catch {
      setError("Failed to delete import.");
    }
  };

  // ── View / download raw JSON ──────────────────────────────────────────────────
  const handleViewRaw = async (item: InspectionImport) => {
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
  };

  const handleDownload = () => {
    if (!viewItem || !viewRaw) return;
    const blob = new Blob([viewRaw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = viewItem.fileName || `${viewItem.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canEdit = user?.role === "Admin" || user?.role === "Project Manager";

  const prettyJson = (raw: string | null) => {
    if (!raw) return "(no raw JSON stored)";
    try { return JSON.stringify(JSON.parse(raw), null, 2); }
    catch { return raw; }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <span>Inspections — {asset?.assetTag}</span>
            {canEdit && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Import JSON"}
                </Button>
              </>
            )}
          </Stack>
        </DialogTitle>

        <DialogContent>
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={26} />
            </Box>
          ) : (
            <Stack spacing={3} sx={{ mt: 0.5 }}>

              {/* ── Inspection runs (workflow-based) ── */}
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2">Workflow-based runs</Typography>
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<PlayArrowOutlinedIcon fontSize="small" />}
                    onClick={() =>
                      navigate(`/installations/assets?project=${encodeURIComponent(asset?.projectId ?? "")}&workflowType=Inspection`)
                    }
                  >
                    Start / view all
                  </Button>
                </Stack>
                {runs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No inspection workflow runs linked to this asset yet. Assign an inspection workflow config to this asset in the asset list, then start a run.
                  </Typography>
                ) : (
                  runs.map((run) => (
                    <Box
                      key={run.id}
                      sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600}>{run.workflowTypeName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Started {new Date(run.startedAt).toLocaleString()}
                            {run.completedAt ? ` · Completed ${new Date(run.completedAt).toLocaleString()}` : ""}
                            {run.assignedTo ? ` · ${run.assignedTo}` : ""}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Chip size="small" label={run.status} color={STATUS_COLOR[run.status] ?? "default"} />
                          {(run.status === "InProgress" || run.status === "Paused" || run.status === "NotStarted") && (
                            <Tooltip title="Open in runner">
                              <IconButton
                                size="small"
                                onClick={() =>
                                  navigate(`/installations/assets?project=${encodeURIComponent(asset?.projectId ?? "")}&run=${encodeURIComponent(run.id)}`)
                                }
                              >
                                <OpenInNewOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  ))
                )}
              </Stack>

              <Divider />

              {/* ── Imported JSON inspections ── */}
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2">Imported JSON reports</Typography>
                  <Chip
                    label={`${imports.length} import${imports.length === 1 ? "" : "s"}`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>

                {imports.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No JSON inspection reports imported for this asset. Use "Import JSON" above to upload one.
                  </Typography>
                ) : (
                  imports.map((item) => (
                    <Box
                      key={item.id}
                      sx={{ border: "1px solid", borderColor: item.status === "FAILED" ? "error.main" : "divider", borderRadius: 1, p: 1.5 }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {item.fileName || item.id}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.source} · {new Date(item.receivedAt).toLocaleString()}
                            {item.uploadedBy ? ` · ${item.uploadedBy}` : ""}
                            {item.mappedRunId ? ` · Run ${item.mappedRunId}` : ""}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 1, flexShrink: 0 }}>
                          <Chip
                            size="small"
                            label={STATUS_LABEL[item.status] ?? item.status}
                            color={STATUS_COLOR[item.status] ?? "default"}
                          />
                          <Tooltip title="View raw JSON">
                            <IconButton size="small" onClick={() => handleViewRaw(item)}>
                              <CodeIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {canEdit && item.status !== "MAPPED" && (
                            <Tooltip title="Assign to this asset">
                              <IconButton size="small" color="primary" onClick={() => handleAssignToThisAsset(item)}>
                                <PlayArrowOutlinedIcon fontSize="small" />
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
                              <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </Stack>

                      {/* Inline mark-failed form */}
                      {failingId === item.id && (
                        <Box sx={{ mt: 1.5 }}>
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
                              <Button
                                size="small"
                                variant="contained"
                                color="warning"
                                disabled={failSaving}
                                onClick={handleMarkFailed}
                              >
                                {failSaving ? "Saving…" : "Confirm Failed"}
                              </Button>
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => { setFailingId(null); setFailText(""); }}
                              >
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
                  ))
                )}
              </Stack>

            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Close</Button>
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
          <Button
            onClick={handleDownload}
            disabled={!viewRaw}
            startIcon={<DownloadIcon />}
          >
            Download
          </Button>
          <Button onClick={() => { setViewItem(null); setViewRaw(null); }}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AssetInspectionDialog;
