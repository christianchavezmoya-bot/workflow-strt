import { Box, Stack, Tooltip, Typography } from "@mui/material";
import type { MediaItem } from "../../types/workflow";
import { nativeTooltipTouchProps } from "../../utils/nativeTooltipTouchProps";

/**
 * Renders a step's reference Content — instructional media a workflow author
 * attached in the Builder (workflow.media[] resolved via step.mediaIds).
 *
 * This is intentionally separate from technician Capture/Input media (evidence
 * the technician supplies during a run): it only ever reads the `media` prop
 * passed in, never touches step inputs/capture state, and has no upload
 * affordance of its own. Shared between WorkerPreviewPanel (Builder) and
 * WorkOrderRunner (real run + other previews) so both present it identically.
 */
export function ReferenceContentSection({ media }: { media: MediaItem[] }) {
  if (media.length === 0) return null;

  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");

  return (
    <Stack spacing={1.5}>
      {images.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {images.map((m) => (
            <Tooltip key={m.id} title={m.name} {...nativeTooltipTouchProps()}>
              <Box
                component="a"
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: 1,
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "action.hover",
                  cursor: "pointer",
                  "&:hover": { borderColor: "primary.main" },
                }}
              >
                <img
                  src={m.url}
                  alt={m.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </Box>
            </Tooltip>
          ))}
        </Stack>
      )}

      {videos.map((m) => (
        <Box key={m.id} sx={{ maxWidth: 360 }}>
          <Box
            component="video"
            src={m.url}
            controls
            playsInline
            preload="metadata"
            sx={{
              width: "100%",
              height: "auto",
              display: "block",
              borderRadius: 1,
              bgcolor: "common.black",
            }}
          />
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", mt: 0.5 }}>
            {m.name}
          </Typography>
        </Box>
      ))}
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
