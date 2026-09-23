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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOfflineMode } from "../../contexts/OfflineModeContext";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import {
  offlineBootstrapService,
  type BootstrapStatus,
} from "../../services/offlineBootstrapService";
import { getOfflineStorageOverview } from "../../services/offlineStorageService";
import { shouldWarnBeforeForcedDownload } from "../../utils/storageHealth";
import { formatStorageBytes } from "../../utils/formatStorageBytes";
import { isMobileNativePlatform } from "../../utils/platform";
import { getManualDownloadOnly, setManualDownloadOnly } from "../../utils/syncPreferences";

function formatWhen(date: Date | null): string {
  if (!date) return "Never";
  try {
    return date.toLocaleString();
  } catch {
    return date.toISOString();
  }
}

export default function OfflineReadinessPanel() {
  const navigate = useNavigate();
  const { isManualOffline, isOfflineMode, goOffline, goOnline } = useOfflineMode();
  const { triggerSync, canSync, syncing } = useSyncEngine();
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [manualDownloadOnly, setManualDownloadOnlyState] = useState(getManualDownloadOnly);
  const [storageWarningBytes, setStorageWarningBytes] = useState<number | null>(null);

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
  const running = status.isRunning || retrying || syncing;

  async function runForcedDownload() {
    setRetrying(true);
    try {
      await triggerSync({ forceDownload: true });
    } finally {
      setRetrying(false);
      await reload();
    }
  }

  /**
   * Phase 1H: this button's "forceDownload: true" call removes the normal byte/file prefetch
   * caps entirely (getBootstrapPrefetchLimits(force=true)), so it is the one place a routine tap
   * can meaningfully worsen an already-tight device. Uploading pending local work is NEVER
   * gated here — reconnectAndFlushNow() inside triggerSync() always runs regardless of this
   * check; this only ever delays/confirms the DOWNLOAD portion, and only at HIGH/CRITICAL.
   */
  async function handleRetry() {
    if (!canSync) return;
    try {
      const overview = await getOfflineStorageOverview();
      if (shouldWarnBeforeForcedDownload(overview.health.level)) {
        setStorageWarningBytes(overview.nGoUsageBytes);
        return;
      }
    } catch {
      // Health check itself failing must never block a sync the user asked for.
    }
    await runForcedDownload();
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
              checked={manualDownloadOnly}
              onChange={(_, checked) => {
                setManualDownloadOnly(checked);
                setManualDownloadOnlyState(checked);
              }}
            />
          }
          label={
            <Typography variant="body2" color="text.secondary">
              Manual download only — skip automatic field-data downloads
            </Typography>
          }
          sx={{ ml: 0, alignSelf: "flex-start" }}
        />

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={isManualOffline}
              onChange={(_, checked) => {
                if (checked) goOffline();
                else goOnline();
              }}
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
          disabled={running || !canSync}
          onClick={() => void handleRetry()}
          sx={{ alignSelf: "flex-start" }}
        >
          {status.isStale ? "Sync & download" : "Refresh field data"}
        </Button>

        <Button
          variant="text"
          size="small"
          onClick={() => navigate("/settings/offline-storage")}
          sx={{ alignSelf: "flex-start" }}
        >
          Manage offline storage
        </Button>
      </Stack>

      <Dialog open={storageWarningBytes != null} onClose={() => setStorageWarningBytes(null)}>
        <DialogTitle>Storage is running low</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            N-Go is using {storageWarningBytes != null ? formatStorageBytes(storageWarningBytes) : ""} of storage
            on this device. Downloading more field data now may use significantly more space. Your pending
            uploads will still be sent regardless of this download.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            You can free space first from Manage Offline Storage, or continue anyway.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStorageWarningBytes(null)}>Cancel</Button>
          <Button
            onClick={() => navigate("/settings/offline-storage")}
            variant="outlined"
          >
            Manage Offline Storage
          </Button>
          <Button
            onClick={() => { setStorageWarningBytes(null); void runForcedDownload(); }}
            variant="contained"
          >
            Continue Anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
