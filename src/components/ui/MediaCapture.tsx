/**
 * MediaCapture.tsx
 * Reusable photo + video capture widget.
 * On native mobile, captures can be persisted to Filesystem and referenced by
 * durable file-backed tokens instead of in-memory data URLs.
 */
import { useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import QRUploadButton from "../QRUploadButton";
import { mediaStore } from "../../services/mediaStore";

interface Props {
  media: string[];
  onChange: (media: string[]) => void;
  label?: string;
  disabled?: boolean;
  allowedKinds?: Array<"photo" | "video">;
  linkedToType?: "run-step" | "issue-report" | "issue-resolution" | "signature";
  linkedToId?: string;
  /** When provided, a "Upload from Phone" QR button is shown */
  qrDocType?: string;
  qrLinkedTo?: string;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MediaCapture({
  media,
  onChange,
  label,
  disabled = false,
  allowedKinds = ["photo", "video"],
  linkedToType,
  linkedToId,
  qrDocType,
  qrLinkedTo,
}: Props) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [previewMedia, setPreviewMedia] = useState<string[]>(media);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(media.map((item) => mediaStore.resolveMediaValue(item).catch(() => item))).then((resolved) => {
      if (!cancelled) setPreviewMedia(resolved);
    });
    return () => { cancelled = true; };
  }, [media]);

  async function persistValue(source: File | string, kind: "photo" | "video"): Promise<string> {
    if (!linkedToType || !linkedToId) {
      return typeof source === "string" ? source : await toBase64(source);
    }
    return await mediaStore.persistMediaValue(source, kind, linkedToType, linkedToId);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const results: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const kind = file.type.startsWith("video/") ? "video" : "photo";
        results.push(await persistValue(file, kind));
      } catch {
        // skip unreadable files
      }
    }
    if (results.length > 0) onChange([...media, ...results]);
  }

  function remove(idx: number) {
    onChange(media.filter((_, i) => i !== idx));
  }

  return (
    <Box>
      {label && (
        <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.75}
          sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
          {label}
        </Typography>
      )}

      {/* Capture buttons */}
      <Stack direction="row" spacing={1} flexWrap="wrap" mb={media.length > 0 ? 1.25 : 0}>
        {allowedKinds.includes("photo") && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<PhotoCameraOutlinedIcon />}
            disabled={disabled}
            onClick={() => photoInputRef.current?.click()}
            sx={{ fontSize: 12 }}
          >
            Add Photo
          </Button>
        )}
        {allowedKinds.includes("video") && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<VideocamOutlinedIcon />}
            disabled={disabled}
            onClick={() => videoInputRef.current?.click()}
            sx={{ fontSize: 12 }}
          >
            Add Video
          </Button>
        )}
        {qrDocType && qrLinkedTo && !disabled && (
          <QRUploadButton
            docType={qrDocType}
            linkedTo={qrLinkedTo}
            label="Phone"
            onUploaded={() => {}}
            onUploadedWithData={(_docId, dataUrl) => {
              const kind = dataUrl.startsWith("data:video") ? "video" : "photo";
              void persistValue(dataUrl, kind).then((stored) => onChange([...media, stored]));
            }}
          />
        )}

        {/* Hidden inputs */}
        {allowedKinds.includes("photo") && (
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
          />
        )}
        {allowedKinds.includes("video") && (
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
          />
        )}
      </Stack>

      {/* Thumbnail grid */}
      {media.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
            gap: 0.75,
          }}
        >
          {previewMedia.map((src, idx) => (
            <Box
              key={`${media[idx] ?? src}-${idx}`}
              sx={{
                position: "relative",
                width: "100%",
                paddingTop: "100%",
                borderRadius: 1,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.default",
              }}
            >
              {mediaStore.getMediaKind(media[idx] ?? src) === "video" ? (
                // Video placeholder — show icon (base64 video is too large to render inline efficiently)
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "grey.900",
                    color: "grey.400",
                    gap: 0.25,
                  }}
                >
                  <PlayCircleOutlineOutlinedIcon sx={{ fontSize: 28 }} />
                  <Typography variant="caption" sx={{ fontSize: 9 }}>Video</Typography>
                </Box>
              ) : (
                <Box
                  component="img"
                  src={src}
                  alt={`capture-${idx}`}
                  sx={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}

              {/* Remove button */}
              {!disabled && (
                <Tooltip title="Remove">
                  <IconButton
                    size="small"
                    onClick={() => remove(idx)}
                    sx={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      p: 0.25,
                      bgcolor: "rgba(0,0,0,0.55)",
                      color: "white",
                      "&:hover": { bgcolor: "rgba(200,0,0,0.75)" },
                    }}
                  >
                    <DeleteOutlineOutlinedIcon sx={{ fontSize: 13 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
