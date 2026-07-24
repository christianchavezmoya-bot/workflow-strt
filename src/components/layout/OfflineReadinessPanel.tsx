import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useOfflineMode } from "../../contexts/OfflineModeContext";
import {
  offlineBootstrapService,
  type BootstrapStatus,
} from "../../services/offlineBootstrapService";
import { isMobileNativePlatform } from "../../utils/platform";

function formatWhen(date: Date | null): string {
  if (!date) return "Never";
  try {
    return date.toLocaleString();
  } catch {
    return date.toISOString();
  }
}

export default function OfflineReadinessPanel() {
  const { isManualOffline, isOfflineMode, goOffline, goOnline } = useOfflineMode();
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [retrying, setRetrying] = useState(false);

  const reload = useCallback(async () => {
    const next = await offlineBootstrapService.getStatus();
    setStatus(next);
  }, []);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    void reload();
    const onChange = () => { void reload(); };
    window.addEventListener("bootstrap:started", onChange);
    window.addEventListener("bootstrap:complete", onChange);
    window.addEventListener("bootstrap:error", onChange);
    return () => {
      window.removeEventListener("bootstrap:started", onChange);
      window.removeEventListener("bootstrap:complete", onChange);
      window.removeEventListener("bootstrap:error", onChange);
    };
  }, [reload]);

  if (!isMobileNativePlatform() || !status) return null;

  const summary = status.summary;
  const running = status.isRunning || retrying;

  async function handleRetry() {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setRetrying(true);
    try {
      await offlineBootstrapService.retry({ scope: "assigned" });
    } finally {
      setRetrying(false);
      await reload();
    }
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Stack spacing={1.25}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2" fontWeight={700}>
            Offline readiness
          </Typography>
          {status.readyForOffline ? (
            <Chip
              size="small"
              icon={<CloudDoneOutlinedIcon />}
              label="Ready for offline"
              color="success"
              sx={{ fontWeight: 600, fontSize: "0.72rem" }}
            />
          ) : status.isStale ? (
            <Chip
              size="small"
              icon={<CloudOffOutlinedIcon />}
              label="Data may be stale"
              color="warning"
              sx={{ fontWeight: 600, fontSize: "0.72rem" }}
            />
          ) : (
            <Chip
              size="small"
              icon={<CloudOffOutlinedIcon />}
              label="Not downloaded yet"
              color="default"
              sx={{ fontWeight: 600, fontSize: "0.72rem" }}
            />
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Last field download: {formatWhen(status.lastCompletedAt)}
        </Typography>

        {summary && (
          <Typography variant="caption" color="text.secondary" display="block">
            Cached {summary.deepAssets} assigned/active assets · {summary.configs} workflow configs
            {summary.documentFilesPrefetched != null
              ? ` · ${summary.documentFilesPrefetched} linked documents`
              : ""}
          </Typography>
        )}

        {running && (
          <Stack direction="row" alignItems="center" spacing={1}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="info.main">
              Downloading field data…
            </Typography>
          </Stack>
        )}

        {!running && status.isStale && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Connect to Wi‑Fi or cellular and tap Download now to refresh cached projects, workflows, and reference photos.
          </Alert>
        )}

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={isManualOffline}
              onChange={(_, checked) => { checked ? goOffline() : goOnline(); }}
            />
          }
          label={
            <Typography variant="body2" color="text.secondary">
              Work offline {isOfflineMode && !isManualOffline ? "(no connection)" : ""}
            </Typography>
          }
          sx={{ ml: 0, alignSelf: "flex-start" }}
        />

        <Button
          variant="outlined"
          size="small"
          startIcon={running ? <CircularProgress size={14} /> : status.isStale ? <DownloadOutlinedIcon /> : <RefreshOutlinedIcon />}
          disabled={running || (typeof navigator !== "undefined" && !navigator.onLine)}
          onClick={() => void handleRetry()}
          sx={{ alignSelf: "flex-start" }}
        >
          {status.isStale ? "Download now" : "Refresh field data"}
        </Button>
      </Stack>
    </Box>
  );
}
