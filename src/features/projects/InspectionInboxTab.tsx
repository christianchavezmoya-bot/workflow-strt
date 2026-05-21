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
  Tooltip,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AssignmentIcon from "@mui/icons-material/Assignment";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CodeIcon from "@mui/icons-material/Code";
import DownloadIcon from "@mui/icons-material/Download";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { inspectionImportService } from "../../services/inspectionImportService";
import type { InspectionImport } from "../../types/inspectionImport";
import api from "../../services/api";
import { projectAssetService } from "../../services/projectAssetService";
import type { ProjectAsset } from "../../types/projectAsset";

interface Props {
  projectId: string;
}

const STATUS_COLOR: Record<string, "default" | "info" | "warning" | "success" | "error"> = {
  RECEIVED: "info",
  NEEDS_ASSIGNMENT: "warning",
  MAPPED: "success",
  FAILED: "error",
};

const InspectionInboxTab = ({ projectId }: Props) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imports, setImports] = useState<InspectionImport[]>([]);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSource, setUploadSource] = useState<"LOCAL" | "ONEDRIVE" | "EMAIL">("LOCAL");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [viewItem, setViewItem] = useState<InspectionImport | null>(null);
  const [viewRaw, setViewRaw] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      inspectionImportService.listByProject(projectId),
      projectAssetService.listByProject(projectId),
    ])
      .then(([items, assets]) => {
        setImports(items);
        setProjectAssets(assets);
      })
      .catch(() => setError("Unable to load inspection imports."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload via multipart (works on web and native) ──────────────────────────
  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("projectId", projectId);
      formData.append("source", uploadSource);
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleWebFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleAssign = async (item: InspectionImport) => {
    try {
      setAssigningId(item.id);
      await inspectionImportService.assign(item.id, {
        projectId,
        projectAssetId: selectedAssetId,
      });
      setAssigningId(null);
      setSelectedAssetId("");
      load();
    } catch {
      setAssigningId(null);
      setError("Failed to assign import.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await inspectionImportService.remove(id);
      setImports((prev) => prev.filter((x) => x.id !== id));
    } catch {
      setError("Failed to delete import.");
    }
  };

  const handleViewRaw = async (item: InspectionImport) => {
    setViewItem(item);
    setViewRaw(null);
    // If rawJson is inline use it directly; otherwise fetch from /raw endpoint
    if (item.rawJson) {
      setViewRaw(item.rawJson);
      return;
    }
    setViewLoading(true);
    try {
      const res = await api.get<string>(`/inspection-imports/${item.id}/raw`, {
        responseType: "text",
      });
      setViewRaw(res.data);
    } catch {
      setViewRaw("(could not load raw content)");
    } finally {
      setViewLoading(false);
    }
  };

  const handleDownloadRaw = () => {
    if (!viewItem || !viewRaw) return;
    const blob = new Blob([viewRaw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${viewItem.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1">Inspection inbox</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel shrink>Source</InputLabel>
            <Select
              label="Source"
              value={uploadSource}
              onChange={(e) => setUploadSource(e.target.value as typeof uploadSource)}
            >
              <MenuItem value="LOCAL">Local disk</MenuItem>
              <MenuItem value="ONEDRIVE">OneDrive</MenuItem>
              <MenuItem value="EMAIL">Email attachment</MenuItem>
            </Select>
          </FormControl>
          {/* Hidden input for web fallback */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={handleWebFileChange}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
            disabled={uploading}
            onClick={handleUploadClick}
          >
            {uploading ? "Uploading…" : "Upload JSON"}
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!error && imports.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No imported inspections yet. Upload a JSON file to get started.
        </Typography>
      )}

      {imports.map((item) => (
        <Box key={item.id} className="glass-card" sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {item.id}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.source} · {new Date(item.receivedAt).toLocaleString()}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 1, flexShrink: 0 }}>
              <Chip
                label={item.status}
                size="small"
                color={STATUS_COLOR[item.status] ?? "default"}
              />
              {item.status === "RECEIVED" && (
                <Tooltip title="Assign to project and selected asset">
                  <IconButton size="small" disabled={assigningId === item.id} onClick={() => handleAssign(item)}>
                    <AssignmentIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="View raw JSON">
                <IconButton size="small" onClick={() => handleViewRaw(item)}>
                  <CodeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete import">
                <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {item.error && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="error.main">
                {item.error}
              </Typography>
            </>
          )}

          {item.projectAssetId && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary">
                Asset: {projectAssets.find((asset) => asset.id === item.projectAssetId)?.assetTag || item.projectAssetId}
                {item.mappedRunId && " · Run: " + item.mappedRunId}
              </Typography>
            </>
          )}

          {!item.projectAssetId && (item.status === "RECEIVED" || item.status === "NEEDS_ASSIGNMENT") && (
            <>
              <Divider sx={{ my: 1 }} />
              <FormControl size="small" fullWidth>
                <InputLabel shrink>Assign Asset</InputLabel>
                <Select
                  label="Assign Asset"
                  value={assigningId === item.id ? selectedAssetId : ""}
                  onChange={(e) => {
                    setAssigningId(item.id);
                    setSelectedAssetId(e.target.value);
                  }}
                >
                  <MenuItem value="">Project only</MenuItem>
                  {projectAssets.map((asset) => (
                    <MenuItem key={asset.id} value={asset.id}>
                      {asset.assetTag}
                      {asset.assetName ? ` — ${asset.assetName}` : ""}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
        </Box>
      ))}

      {/* Raw JSON viewer dialog */}
      <Dialog open={!!viewItem} onClose={() => { setViewItem(null); setViewRaw(null); }} maxWidth="md" fullWidth>
        <DialogTitle>
          Raw JSON — {viewItem?.id}
        </DialogTitle>
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
              {viewRaw
                ? (() => {
                    try { return JSON.stringify(JSON.parse(viewRaw), null, 2); }
                    catch { return viewRaw; }
                  })()
                : "(no raw JSON stored)"}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDownloadRaw} disabled={!viewRaw} startIcon={<DownloadIcon />}>Download</Button>
          <Button onClick={() => { setViewItem(null); setViewRaw(null); }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default InspectionInboxTab;
