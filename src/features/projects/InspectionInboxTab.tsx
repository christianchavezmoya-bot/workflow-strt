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
  Tooltip,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AssignmentIcon from "@mui/icons-material/Assignment";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { inspectionImportService } from "../../services/inspectionImportService";
import type { InspectionImport } from "../../types/project";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [viewItem, setViewItem] = useState<InspectionImport | null>(null);

  const load = () => {
    setLoading(true);
    inspectionImportService
      .list({ projectId })
      .then(setImports)
      .catch(() => setError("Unable to load inspection imports."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await inspectionImportService.uploadFile(file, projectId, user?.email);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Upload failed. The file may already have been imported.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAssign = async (item: InspectionImport) => {
    try {
      await inspectionImportService.assign(item.id, { projectId });
      load();
    } catch {
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
        <Box>
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
            startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Upload JSON"}
          </Button>
        </Box>
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
                {item.fileName || item.id}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.source} · {new Date(item.receivedAt).toLocaleString()}
                {item.uploadedBy && ` · ${item.uploadedBy}`}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 1, flexShrink: 0 }}>
              <Chip
                label={item.status}
                size="small"
                color={STATUS_COLOR[item.status] ?? "default"}
              />
              {item.status === "RECEIVED" && (
                <Tooltip title="Assign to this project">
                  <IconButton size="small" onClick={() => handleAssign(item)}>
                    <AssignmentIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="View raw JSON">
                <IconButton size="small" onClick={() => setViewItem(item)}>
                  <UploadFileIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete import">
                <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {item.errorText && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="error.main">
                {item.errorText}
              </Typography>
            </>
          )}

          {item.assetId && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary">
                Asset: {item.assetId}
                {item.mappedRunId && ` · Run: ${item.mappedRunId}`}
              </Typography>
            </>
          )}
        </Box>
      ))}

      <Dialog open={!!viewItem} onClose={() => setViewItem(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          Raw JSON — {viewItem?.fileName || viewItem?.id}
        </DialogTitle>
        <DialogContent>
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
            {viewItem?.rawJson
              ? (() => {
                  try {
                    return JSON.stringify(JSON.parse(viewItem.rawJson), null, 2);
                  } catch {
                    return viewItem.rawJson;
                  }
                })()
              : "(no raw JSON stored)"}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewItem(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default InspectionInboxTab;
