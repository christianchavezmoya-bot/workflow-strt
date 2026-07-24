import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { Box, LinearProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import type { BootstrapProgress } from "../../services/offlineBootstrapService";
import { isMobileNativePlatform } from "../../utils/platform";

const PHASE_LABELS: Record<string, string> = {
  reference: "Reference data",
  projects: "Projects",
  assets: "Assets",
  configs: "Product configs",
  "linked-configs": "Workflow configs",
  workflows: "Assignments & runs",
  media: "Reference photos",
};

type BootstrapState = {
  running: boolean;
  phase: string;
  done: number;
  total: number;
};

export default function OfflineBootstrapBanner() {
  const [state, setState] = useState<BootstrapState | null>(null);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    const onStart = () => {
      setState({ running: true, phase: "reference", done: 0, total: 1 });
    };

    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<BootstrapProgress>).detail;
      if (!detail) return;
      setState({
        running: true,
        phase: detail.phase,
        done: detail.done,
        total: Math.max(detail.total, 1),
      });
    };

    const onDone = () => setState(null);
    const onError = () => setState(null);

    window.addEventListener("bootstrap:started", onStart);
    window.addEventListener("bootstrap:progress", onProgress);
    window.addEventListener("bootstrap:complete", onDone);
    window.addEventListener("bootstrap:error", onError);
    return () => {
      window.removeEventListener("bootstrap:started", onStart);
      window.removeEventListener("bootstrap:progress", onProgress);
      window.removeEventListener("bootstrap:complete", onDone);
      window.removeEventListener("bootstrap:error", onError);
    };
  }, []);

  if (!state?.running) return null;

  const label = PHASE_LABELS[state.phase] ?? state.phase;
  const pct = Math.min(100, Math.round((state.done / state.total) * 100));

  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: "rgba(59, 130, 246, 0.1)",
        borderBottom: "1px solid rgba(59, 130, 246, 0.22)",
      }}
    >
      <Stack spacing={0.75} sx={{ px: 2, py: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <DownloadOutlinedIcon sx={{ color: "info.light", fontSize: 18 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: "info.light", fontSize: "0.82rem", fontWeight: 700 }}>
              Downloading field data…
            </Typography>
            <Typography variant="caption" sx={{ color: "info.light", opacity: 0.85 }}>
              {label} · {state.done}/{state.total} ({pct}%)
            </Typography>
          </Box>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 4,
            borderRadius: 999,
            bgcolor: "rgba(59, 130, 246, 0.15)",
            "& .MuiLinearProgress-bar": { bgcolor: "info.light" },
          }}
        />
      </Stack>
    </Box>
  );
}
