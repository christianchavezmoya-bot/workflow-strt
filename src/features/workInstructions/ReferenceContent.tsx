import { useState } from "react";
import { ButtonBase, Dialog, DialogContent, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { CloseOutlined } from "@mui/icons-material";
import type { MediaItem } from "../../types/workflow";
import { nativeTooltipTouchProps } from "../../utils/nativeTooltipTouchProps";
import { resolveMediaUrl } from "../../utils/mediaUrl";

/**
 * Renders a step's reference Content — instructional media a workflow author
 * attached in the Builder (workflow.media[] resolved via step.mediaIds).
 *
 * This is intentionally separate from technician Capture/Input media (evidence
 * the technician supplies during a run): it only ever reads the `media` prop
 * passed in, never touches step inputs/capture state, and has no upload
 * affordance of its own. Shared between WorkerPreviewPanel (Builder) and
 * WorkOrderRunner (real run + other previews) so both present it identically.
 *
 * Media URLs are resolved via resolveMediaUrl() (src/utils/mediaUrl.ts) before
 * use — the backend returns server-relative paths, and the frontend/API are
 * commonly different origins, so a raw <img src>/<a href>/<video src> would
 * resolve against the wrong host. Images open in an in-app lightbox dialog
 * (never a same-window/new-tab navigation) so a technician never loses
 * workflow progress by viewing reference Content.
 */
export function ReferenceContentSection({ media }: { media: MediaItem[] }) {
  const [lightboxImage, setLightboxImage] = useState<MediaItem | null>(null);

  if (media.length === 0) return null;

  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");

  return (
    <Stack spacing={1.5}>
      {images.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {images.map((m) => (
            <Tooltip key={m.id} title={m.name} {...nativeTooltipTouchProps()}>
              <ButtonBase
                onClick={() => setLightboxImage(m)}
                aria-label={`View ${m.name}`}
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: 1,
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "action.hover",
                  "&:hover": { borderColor: "primary.main" },
                }}
              >
                <img
                  src={resolveMediaUrl(m.url)}
                  alt={m.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </ButtonBase>
            </Tooltip>
          ))}
        </Stack>
      )}

      {videos.map((m) => (
        <Stack key={m.id} spacing={0.5} sx={{ maxWidth: 360 }}>
          <video
            src={resolveMediaUrl(m.url)}
            controls
            playsInline
            preload="metadata"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              borderRadius: 4,
              backgroundColor: "black",
            }}
          />
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {m.name}
          </Typography>
        </Stack>
      ))}

      <Dialog
        open={Boolean(lightboxImage)}
        onClose={() => setLightboxImage(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogContent
          sx={{
            p: 0,
            position: "relative",
            bgcolor: "common.black",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 240,
          }}
        >
          <IconButton
            onClick={() => setLightboxImage(null)}
            aria-label="Close"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              color: "common.white",
              bgcolor: "rgba(0,0,0,0.45)",
              "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
            }}
          >
            <CloseOutlined />
          </IconButton>
          {lightboxImage && (
            <img
              src={resolveMediaUrl(lightboxImage.url)}
              alt={lightboxImage.name}
              style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain", display: "block" }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

/** Resolve a step's mediaIds against the workflow's shared media library. */
export function resolveAttachedMedia(
  mediaIds: string[] | undefined,
  workflowMedia: MediaItem[] | undefined,
): MediaItem[] {
  return (mediaIds ?? [])
    .map((id) => (workflowMedia ?? []).find((m) => m.id === id))
    .filter((m): m is MediaItem => Boolean(m));
}
