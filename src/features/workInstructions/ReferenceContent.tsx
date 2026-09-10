import { useState } from "react";
import { Button, ButtonBase, Dialog, DialogContent, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { CloseOutlined, PlayCircleOutline } from "@mui/icons-material";
import type { MediaItem } from "../../types/workflow";
import { nativeTooltipTouchProps } from "../../utils/nativeTooltipTouchProps";
import { resolveMediaUrl } from "../../utils/mediaUrl";
import { isMobileNativePlatform } from "../../utils/platform";
import { nativeNestedDialogSx } from "../../utils/nativeDialogInsets";

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
 * resolve against the wrong host. Both images and video open in an in-app
 * modal (never a same-window/new-tab navigation) so a technician never loses
 * workflow progress by viewing reference Content.
 *
 * On native (WorkOrderRunner), the runner itself is a Dialog pinned to
 * NATIVE_DIALOG_Z_INDEX (see nativeDialogInsets.ts) so it stays above the
 * bottom tab bar. A plain nested <Dialog> here would get MUI's default
 * z-index, which loses to that pin — it would open but render invisibly
 * behind the still-visible runner. nativeNestedDialogSx() is the same fix
 * already applied to this runner's other nested dialogs (e.g. flag-issue).
 */
export function ReferenceContentSection({ media }: { media: MediaItem[] }) {
  const [lightboxImage, setLightboxImage] = useState<MediaItem | null>(null);
  const [videoModal, setVideoModal] = useState<MediaItem | null>(null);
  const nestedDialogSx = isMobileNativePlatform() ? nativeNestedDialogSx() : undefined;

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

      {videos.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {videos.map((m) => (
            <Tooltip key={m.id} title={m.name} {...nativeTooltipTouchProps()}>
              <ButtonBase
                onClick={() => setVideoModal(m)}
                aria-label={`Play ${m.name}`}
                sx={{
                  width: 120,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  sx={{
                    width: 72,
                    height: 72,
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "common.black",
                    "&:hover": { borderColor: "primary.main" },
                  }}
                >
                  <PlayCircleOutline sx={{ color: "common.white", fontSize: 36 }} />
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", width: "100%" }}>
                  {m.name}
                </Typography>
              </ButtonBase>
            </Tooltip>
          ))}
        </Stack>
      )}

      <Dialog
        open={Boolean(lightboxImage)}
        onClose={() => setLightboxImage(null)}
        maxWidth="lg"
        fullWidth
        sx={nestedDialogSx}
      >
        <DialogContent
          sx={{
            p: 0,
            position: "relative",
            bgcolor: "common.black",
            display: "flex",
            flexDirection: "column",
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
              style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", display: "block" }}
            />
          )}
          <Button
            onClick={() => setLightboxImage(null)}
            startIcon={<CloseOutlined />}
            variant="contained"
            color="inherit"
            sx={{ my: 1.5 }}
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(videoModal)}
        onClose={() => setVideoModal(null)}
        maxWidth="md"
        fullWidth
        sx={nestedDialogSx}
      >
        <DialogContent
          sx={{
            p: 0,
            position: "relative",
            bgcolor: "common.black",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 240,
          }}
        >
          <IconButton
            onClick={() => setVideoModal(null)}
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
          {/* Mounted only while open, so closing the dialog unmounts the element and stops playback. */}
          {videoModal && (
            <video
              src={resolveMediaUrl(videoModal.url)}
              controls
              playsInline
              autoPlay
              preload="metadata"
              style={{ width: "100%", maxHeight: "80vh", display: "block", backgroundColor: "black" }}
            />
          )}
          <Button
            onClick={() => setVideoModal(null)}
            startIcon={<CloseOutlined />}
            variant="contained"
            color="inherit"
            sx={{ my: 1.5 }}
          >
            Close
          </Button>
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
