import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AttachFileOutlined,
  CheckCircleOutlined,
  DeleteOutline,
  UploadOutlined,
  VideocamOutlined,
} from "@mui/icons-material";
import type { MediaItem, Workflow, WorkflowStep } from "../../types/workflow";
import { workflowConfigService } from "../../services/workflowConfigService";
import QRUploadButton from "../../components/QRUploadButton";

const IMAGE_MAX_DIM = 1920;
const IMAGE_JPEG_QUALITY = 0.85;
/** Builder template library upload — multipart path, not stepResultsJson data URLs. */
const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

function resizeImage(file: File, maxDim: number, quality: number): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }) : file),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(file); };
    img.src = objUrl;
  });
}

interface MediaLibraryPanelProps {
  workflow: Workflow;
  step: WorkflowStep;
  templateId: string | null;
  ensureConfigId: () => Promise<string | null>;
  onStepChange: (patch: Partial<WorkflowStep>) => void;
  onWorkflowUpdate: (wf: Workflow) => void;
}

// Content tab for a single step's reference media. workflow.media remains the
// shared library; step.mediaIds remains the per-step association. This panel
// only ever shows/edits the SELECTED step's attached items — rendering the
// full library here (regardless of step) was the root cause of reference
// Content appearing on every step.
export function MediaLibraryPanel({ workflow, step, templateId, ensureConfigId, onStepChange, onWorkflowUpdate }: MediaLibraryPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const media: MediaItem[] = Array.isArray(workflow.media) ? workflow.media : [];
  const attachedIds = new Set(step.mediaIds || []);
  const attachedMedia = media.filter((item) => attachedIds.has(item.id));

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Auto-create config if not saved yet
    const cfgId = templateId || await ensureConfigId();
    if (!cfgId) { setUploadError("Could not create workflow config. Save the workflow name first."); return; }
    setUploadError(null);

    let fileToUpload = file;
    if (file.type.startsWith("image/")) {
      fileToUpload = await resizeImage(file, IMAGE_MAX_DIM, IMAGE_JPEG_QUALITY);
    } else if (file.type.startsWith("video/")) {
      if (file.size > VIDEO_MAX_BYTES) {
        setUploadError("Video exceeds the 100 MB limit. Please compress it before uploading.");
        e.target.value = "";
        return;
      }
    }

    setUploading(true);
    try {
      const updatedConfig = await workflowConfigService.uploadMedia(cfgId, fileToUpload);
      const updatedMedia = (() => { try { return JSON.parse(updatedConfig.mediaJson); } catch { return []; } })();
      onWorkflowUpdate({ ...workflow, media: updatedMedia });
      // Attach to the currently selected step only after a successful upload —
      // a failed upload must never change step.mediaIds.
      const newItem = updatedMedia[updatedMedia.length - 1];
      if (newItem?.id) {
        onStepChange({ mediaIds: [...(step.mediaIds || []), newItem.id] });
      }
    } catch {
      setUploadError("Upload failed. Check file size and try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(mediaId: string) {
    const cfgId = templateId || await ensureConfigId();
    if (!cfgId) return;
    try {
      const updatedConfig = await workflowConfigService.deleteMedia(cfgId, mediaId);
      // Also detach from step if attached
      if (attachedIds.has(mediaId)) {
        onStepChange({ mediaIds: (step.mediaIds || []).filter((id) => id !== mediaId) });
      }
      const updatedMedia = (() => { try { return JSON.parse(updatedConfig.mediaJson); } catch { return []; } })();
      onWorkflowUpdate({ ...workflow, media: updatedMedia });
    } catch {
      setUploadError("Delete failed.");
    }
  }

  function toggleAttach(mediaId: string) {
    const current = step.mediaIds || [];
    if (current.includes(mediaId)) {
      onStepChange({ mediaIds: current.filter((id) => id !== mediaId) });
    } else {
      onStepChange({ mediaIds: [...current, mediaId] });
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">
          Uploaded content is added to this step automatically.{" "}
          <Typography component="span" variant="caption" color="text.disabled">
            Images auto-resized to max {IMAGE_MAX_DIM} px · Videos max 100 MB.
          </Typography>
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {uploading && <CircularProgress size={14} />}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <Button
            size="small"
            variant="contained"
            startIcon={<UploadOutlined />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Upload
          </Button>
          <QRUploadButton
            docType="workflow-media"
            linkedTo={templateId ?? "new"}
            label="Phone"
            onUploaded={() => {}}
            onUploadedWithData={async (_docId, dataUrl) => {
              const cfgId = await ensureConfigId();
              if (!cfgId) { return; }
              // Convert base64 dataUrl to File
              const [meta, b64] = dataUrl.split(",");
              const mime = meta.match(/:(.*?);/)?.[1] ?? "image/jpeg";
              const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
              const file = new File([bytes], "phone-upload", { type: mime });
              setUploading(true);
              try {
                const updatedConfig = await workflowConfigService.uploadMedia(cfgId, file);
                const updatedMedia = (() => { try { return JSON.parse(updatedConfig.mediaJson); } catch { return []; } })();
                onWorkflowUpdate({ ...workflow, media: updatedMedia });
                const newItem = updatedMedia[updatedMedia.length - 1];
                if (newItem?.id) {
                  onStepChange({ mediaIds: [...(step.mediaIds || []), newItem.id] });
                }
              } catch {
                setUploadError("Upload failed.");
              } finally {
                setUploading(false);
              }
            }}
            disabled={uploading}
          />
        </Stack>
      </Stack>

      {uploadError && (
        <Alert severity="error" sx={{ fontSize: 12 }} onClose={() => setUploadError(null)}>
          {uploadError}
        </Alert>
      )}

      {attachedMedia.length === 0 ? (
        <Alert severity="info" sx={{ fontSize: 12 }}>
          No content attached to this step yet. Use the Upload button to add a photo or video.
        </Alert>
      ) : (
        <Stack spacing={1}>
          {attachedMedia.map((item) => {
            const isAttached = attachedIds.has(item.id);
            return (
              <Paper
                key={item.id}
                variant="outlined"
                sx={{
                  p: 1.25,
                  borderColor: isAttached ? "primary.main" : undefined,
                  bgcolor: isAttached ? "action.selected" : undefined,
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  {/* Thumbnail */}
                  <Box sx={{ width: 48, height: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "action.hover", borderRadius: 1, overflow: "hidden" }}>
                    {item.type === "image" ? (
                      <img src={item.url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <VideocamOutlined fontSize="small" color="action" />
                    )}
                  </Box>

                  {/* Info */}
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="caption" fontWeight={600} noWrap display="block">{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.type.toUpperCase()} · {formatSize(item.size)}
                    </Typography>
                  </Box>

                  {/* Attach toggle */}
                  <Tooltip title={isAttached ? "Detach from step" : "Attach to step"}>
                    <IconButton
                      size="small"
                      color={isAttached ? "primary" : "default"}
                      onClick={() => toggleAttach(item.id)}
                    >
                      <AttachFileOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  {/* Delete */}
                  <Tooltip title="Delete from library">
                    <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {attachedIds.size > 0 && (
        <Typography variant="caption" color="primary.main" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <CheckCircleOutlined sx={{ fontSize: 13 }} />
          {attachedIds.size} item{attachedIds.size === 1 ? "" : "s"} attached to this step
        </Typography>
      )}
    </Stack>
  );
}
