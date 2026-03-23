/**
 * MediaCapture.tsx
 * Reusable photo + video capture widget.
 * Renders "Add Photo" / "Add Video" buttons backed by hidden file inputs.
 * Captured items are stored as base64 data URLs and shown as thumbnails.
 */
import { useRef } from "react";
import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import QRUploadButton from "../QRUploadButton";

interface Props {
  media: string[];
  onChange: (media: string[]) => void;
  label?: string;
  disabled?: boolean;
  /** When provided, a "Upload from Phone" QR button is shown */
  qrDocType?: string;
  qrLinkedTo?: string;
}

function isVideo(dataUrl: string) {
  return dataUrl.startsWith("data:video");
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MediaCapture({ media, onChange, label, disabled = false, qrDocType, qrLinkedTo }: Props) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const results: string[] = [];
    for (const file of Array.from(files)) {
      try {
        results.push(await toBase64(file));
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
        {qrDocType && qrLinkedTo && !disabled && (
          <QRUploadButton
            docType={qrDocType}
            linkedTo={qrLinkedTo}
            label="Phone"
            onUploaded={() => {}}
            onUploadedWithData={(_docId, dataUrl) => onChange([...media, dataUrl])}
          />
        )}

        {/* Hidden inputs */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
        />
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
          {media.map((src, idx) => (
            <Box
              key={idx}
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
              {isVideo(src) ? (
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
