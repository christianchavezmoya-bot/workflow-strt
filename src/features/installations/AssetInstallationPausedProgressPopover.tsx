import { CheckCircleOutlined, HourglassEmptyOutlined } from "@mui/icons-material";
import { Box, Popover, Stack, Typography } from "@mui/material";

export type PausedWorkflowProgress = {
  done: number;
  total: number;
  completedTitles: string[];
};

type Props = {
  anchorEl: HTMLElement | null;
  progress: PausedWorkflowProgress | null | undefined;
  onClose: () => void;
};

export default function AssetInstallationPausedProgressPopover({
  anchorEl,
  progress,
  onClose,
}: Props) {
  return (
    <Popover
      open={Boolean(anchorEl) && Boolean(progress)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      slotProps={{ paper: { sx: { p: 1.5, minWidth: 220, maxWidth: 320 } } }}
    >
      {progress && (
        <Box>
          <Typography
            variant="caption"
            fontWeight={700}
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}
          >
            Progress - {progress.done} of {progress.total} steps
          </Typography>
          <Stack spacing={0.4}>
            {progress.completedTitles.map((title, idx) => (
              <Stack key={idx} direction="row" alignItems="center" spacing={0.75}>
                <CheckCircleOutlined sx={{ fontSize: 14, color: "success.main", flexShrink: 0 }} />
                <Typography variant="caption" noWrap>{title || `Step ${idx + 1}`}</Typography>
              </Stack>
            ))}
            {progress.done < progress.total && (
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ opacity: 0.45 }}>
                <HourglassEmptyOutlined sx={{ fontSize: 14, flexShrink: 0 }} />
                <Typography variant="caption">
                  {progress.total - progress.done} step{progress.total - progress.done !== 1 ? "s" : ""} remaining
                </Typography>
              </Stack>
            )}
          </Stack>
        </Box>
      )}
    </Popover>
  );
}
