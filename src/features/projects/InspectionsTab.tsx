import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import api from "../../services/api";

interface AssetWorkflowRun {
  id: string;
  assetId: string;
  assetName?: string;
  workflowTypeName?: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  assignedTo?: string;
}

interface Props {
  projectId: string;
}

const STATUS_COLOR: Record<string, "default" | "info" | "warning" | "success" | "error"> = {
  "not-started": "default",
  "in-progress": "info",
  "on-hold": "warning",
  completed: "success",
  failed: "error",
};

const isNative = Capacitor.isNativePlatform();

const InspectionsTab = ({ projectId }: Props) => {
  const navigate = useNavigate();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [captureRunId, setCaptureRunId] = useState<string | null>(null);

  const [runs, setRuns] = useState<AssetWorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<AssetWorkflowRun[]>("/asset-workflow-runs", {
        params: { projectId, workflowType: "Inspection" },
      })
      .then((r) => { if (!cancelled) setRuns(r.data); })
      .catch(() => { if (!cancelled) setError("Unable to load inspection runs."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  // ── Photo capture for an inspection run ────────────────────────────────────
  const uploadPhoto = async (runId: string, file: File) => {
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      await api.post(`/asset-workflow-runs/${runId}/photos`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch {
      setError("Photo upload failed.");
    } finally {
      setPhotoUploading(false);
      setCaptureRunId(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleNativeCapture = async (runId: string) => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,   // lets user choose Camera or Photos
        quality: 85,
        allowEditing: false,
      });
      const res = await fetch(photo.dataUrl!);
      const blob = await res.blob();
      const ext = photo.format || "jpeg";
      const file = new File([blob], `inspection-${Date.now()}.${ext}`, {
        type: `image/${ext}`,
      });
      await uploadPhoto(runId, file);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "";
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("user denied")) {
        setError("Camera error: " + msg);
      }
    }
  };

  const handleWebPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && captureRunId) uploadPhoto(captureRunId, file);
  };

  const openCapture = (runId: string) => {
    setCaptureRunId(runId);
    if (isNative) {
      handleNativeCapture(runId);
    } else {
      // defer to give setCaptureRunId a tick to settle
      setTimeout(() => photoInputRef.current?.click(), 50);
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
      {/* Hidden photo input for web fallback */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleWebPhotoChange}
      />

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1">Inspection runs</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() =>
            navigate(
              `/installations/assets?project=${encodeURIComponent(projectId)}&workflowType=Inspection`
            )
          }
        >
          Create inspection
        </Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {!error && runs.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No inspection runs yet. Click "Create inspection" to start one.
        </Typography>
      )}

      {runs.map((run) => (
        <Box
          key={run.id}
          className="glass-card"
          sx={{ p: 2 }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box
              sx={{ flex: 1, cursor: "pointer" }}
              onClick={() =>
                navigate(
                  `/installations/assets?project=${encodeURIComponent(projectId)}&run=${encodeURIComponent(run.id)}`
                )
              }
            >
              <Typography variant="body2" fontWeight={600}>
                {run.assetName || run.assetId}
              </Typography>
              {run.assignedTo && (
                <Typography variant="caption" color="text.secondary">
                  Assigned to {run.assignedTo}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  photoUploading && captureRunId === run.id
                    ? <CircularProgress size={14} />
                    : <PhotoCameraIcon fontSize="small" />
                }
                disabled={photoUploading}
                onClick={() => openCapture(run.id)}
              >
                Photo
              </Button>
              <Chip
                label={run.status}
                size="small"
                color={STATUS_COLOR[run.status] ?? "default"}
              />
            </Stack>
          </Stack>

          {run.startedAt && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary">
                Started {new Date(run.startedAt).toLocaleDateString()}
                {run.completedAt
                  ? " · Completed " + new Date(run.completedAt).toLocaleDateString()
                  : ""}
              </Typography>
            </>
          )}
        </Box>
      ))}
    </Stack>
  );
};

export default InspectionsTab;
