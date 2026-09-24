/**
 * Settings → Offline Storage (Phase 1G). Fully functional for measurement; project removal is
 * gated entirely behind projectDiscardService's tested safety check — no destructive bypass.
 *
 * Terminology (owner instruction): "Remove from device" / "Available online" / "Download for
 * offline use." Never "Delete Project" — that operation (projectService.purgeProject) is a
 * different, server-destructive action this screen never calls.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import CloudSyncOutlinedIcon from "@mui/icons-material/CloudSyncOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
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
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import {
  getOfflineStorageOverview,
  getProjectStorageSummaries,
  type OfflineStorageOverview,
  type ProjectStorageSummary,
} from "../../services/offlineStorageService";
import {
  discardProjectFromDevice,
  type DiscardBlockerCounts,
  type ProjectDiscardResult,
} from "../../services/projectDiscardService";
import type { StorageHealthLevel } from "../../utils/storageHealth";
import type { StorageManifestCategory } from "../../services/localDB";
import { formatStorageBytes } from "../../utils/formatStorageBytes";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

const HEALTH_COLOR: Record<StorageHealthLevel, "success" | "warning" | "error"> = {
  HEALTHY: "success",
  WARNING: "warning",
  HIGH: "warning",
  CRITICAL: "error",
};

const CATEGORY_LABEL: Record<StorageManifestCategory, string> = {
  CAPTURED_MEDIA: "Photos & Videos",
  CONFIG_MEDIA: "Workflow reference media",
  DOCUMENT: "Reports/Documents",
  REPORT: "Reports",
  OTHER: "Other cache",
};

interface BlockedDialogState {
  project: ProjectStorageSummary;
  message: string;
  blockers?: DiscardBlockerCounts;
}

/** Non-zero blocker counts as display rows — mirrors projectDiscardService.ts's buildMessage(). */
function blockerRows(blockers: DiscardBlockerCounts | undefined): { label: string; count: number }[] {
  if (!blockers) return [];
  return [
    { label: "Workflow changes", count: blockers.workflowChanges },
    { label: "Photos/videos", count: blockers.photosVideosPending },
    { label: "Issues", count: blockers.issuesPending },
    { label: "Time entries", count: blockers.timeTrackingPending },
    { label: "Other changes", count: blockers.otherPendingOperations },
    { label: "Failed sync operations", count: blockers.failedSyncOperations },
  ].filter((row) => row.count > 0);
}

export default function OfflineStorageScreen() {
  const navigate = useNavigate();
  const { triggerSync, canSync } = useSyncEngine();
  const [overview, setOverview] = useState<OfflineStorageOverview | null>(null);
  const [projects, setProjects] = useState<ProjectStorageSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingProject, setPendingProject] = useState<ProjectStorageSummary | null>(null);
  const [blockedDialog, setBlockedDialog] = useState<BlockedDialogState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [lastRemoval, setLastRemoval] = useState<ProjectDiscardResult | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, proj] = await Promise.all([getOfflineStorageOverview(), getProjectStorageSummaries()]);
      setOverview(ov);
      setProjects(proj);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function handleRemoveClick(project: ProjectStorageSummary) {
    setPendingProject(project);
  }

  /** "Manage" on a project the screen already knows is blocked — reuses the pre-computed check
   *  from getProjectStorageSummaries() (Blocker 1 fix): no second round-trip, and the dialog is
   *  reachable proactively rather than only as a failed-Remove fallback. Never offers a
   *  destructive Remove action. */
  function handleManageClick(project: ProjectStorageSummary) {
    setBlockedDialog({
      project,
      message: project.discardCheck.message,
      blockers: project.discardCheck.blockers,
    });
  }

  async function confirmRemove() {
    if (!pendingProject) return;
    setRemoving(true);
    try {
      const result = await discardProjectFromDevice(pendingProject.projectId);
      if (!result.removed) {
        // Defense in depth: the screen believed this project was safe, but the service's own
        // (re-run) check refused — e.g. a queued action arrived between load and tap. Show the
        // SAME blocked dialog, using the fresh result rather than any stale cached one.
        setBlockedDialog({ project: pendingProject, message: result.message, blockers: result.blockers });
      } else {
        setLastRemoval(result);
      }
      await reload();
    } finally {
      setRemoving(false);
      setPendingProject(null);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await triggerSync();
    } finally {
      setSyncing(false);
      setBlockedDialog(null);
      // Refresh both eligibility (has the project become safe?) and the storage summary —
      // required test #5: after a successful sync, a previously-blocked project can now show
      // "Remove from device" instead of "Manage".
      await reload();
    }
  }

  if (loading || !overview || !projects) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const level = overview.health.level;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: "auto" }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton size="small" onClick={() => navigate("/settings")} aria-label="Back to Settings">
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={700}>N-Go Offline Storage</Typography>
      </Stack>

      {lastRemoval?.removed && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setLastRemoval(null)}>
          {lastRemoval.message}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Used by N-Go</Typography>
            <Typography variant="body2" fontWeight={600}>{formatStorageBytes(overview.nGoUsageBytes)}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Available on device</Typography>
            {/* data-device-storage-source is an internal diagnostic only: it lets a developer tell
                NATIVE_DEVICE_API / WEB_QUOTA_ESTIMATE / UNAVAILABLE apart in the DOM inspector.
                Users only ever see the plain figure ("42.6 GB") — never an API name. */}
            <Typography
              variant="body2"
              fontWeight={600}
              data-device-storage-source={overview.device.source}
            >
              {overview.device.freeBytes != null
                ? formatStorageBytes(overview.device.freeBytes)
                : overview.device.quotaBytes != null
                  ? `${formatStorageBytes(Math.max(0, overview.device.quotaBytes - (overview.device.quotaUsageBytes ?? 0)))} (browser estimate)`
                  : "Unknown"}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">Storage health</Typography>
            <Chip size="small" label={level} color={HEALTH_COLOR[level]} sx={{ fontWeight: 700 }} />
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, overview.health.nGoUsageRatio * 100)}
            color={HEALTH_COLOR[level]}
            sx={{ height: 6, borderRadius: 1 }}
          />
          {level === "CRITICAL" && (
            <Alert severity="error" icon={<ErrorOutlineOutlinedIcon />}>
              N-Go is using {formatStorageBytes(overview.nGoUsageBytes)} of storage on this device. You can free
              space by removing completed or inactive projects from this phone. Your synced server data will not
              be deleted.
            </Alert>
          )}
        </Stack>
      </Paper>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, textAlign: "center" }}>
          <Typography variant="h6">{overview.offlineProjectCount}</Typography>
          <Typography variant="caption" color="text.secondary">Offline projects</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, textAlign: "center" }}>
          <Typography variant="h6">{overview.pendingSyncOperations}</Typography>
          <Typography variant="caption" color="text.secondary">Pending sync operations</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, textAlign: "center" }}>
          <Typography variant="h6" color={overview.droppedSyncOperations > 0 ? "error.main" : "text.primary"}>
            {overview.droppedSyncOperations}
          </Typography>
          <Typography variant="caption" color="text.secondary">Failed sync operations</Typography>
        </Paper>
      </Stack>

      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ p: 1.5, pb: 0.5 }}>Breakdown</Typography>
        <List dense disablePadding>
          {overview.breakdown
            .filter((b) => b.count > 0)
            .map((b) => (
              <ListItem key={b.category} divider>
                <ListItemText primary={CATEGORY_LABEL[b.category]} secondary={`${b.count} item${b.count === 1 ? "" : "s"}`} />
                <Typography variant="body2">{formatStorageBytes(b.bytes)}</Typography>
              </ListItem>
            ))}
          {overview.breakdown.every((b) => b.count === 0) && (
            <ListItem>
              <ListItemText secondary="Nothing cached on this device yet." />
            </ListItem>
          )}
        </List>
      </Paper>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Projects on this device</Typography>
      <Stack spacing={1}>
        {projects.map((project) => (
          <Paper key={project.projectId} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="body2" fontWeight={600}>{project.name}</Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {project.status}
                  {project.closedAtUtc
                    ? ` · Closed ${formatDate(project.closedAtUtc)}`
                    : ` · Last synced ${formatDate(project.lastSyncedAt)}`}
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={600}>{formatStorageBytes(project.estimatedBytes)}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
              {project.discardCheck.eligibility === "SAFE_TO_REMOVE" ? (
                <Button
                  size="small"
                  color="error"
                  variant="text"
                  startIcon={<DeleteOutlineOutlinedIcon fontSize="small" />}
                  onClick={() => handleRemoveClick(project)}
                >
                  Remove from device
                </Button>
              ) : (
                // Enabled (Blocker 1 fix): tapping it surfaces WHY the project is blocked,
                // structured counts, and Sync Now — never a disabled dead-end and never a
                // destructive Remove action.
                <Button
                  size="small"
                  variant="text"
                  onClick={() => handleManageClick(project)}
                >
                  Manage
                </Button>
              )}
            </Stack>
          </Paper>
        ))}
        {projects.length === 0 && (
          <Alert severity="info">No projects are downloaded for offline use on this device.</Alert>
        )}
      </Stack>

      {/* Confirmation — real removal only after the safety check has already passed. */}
      <Dialog open={!!pendingProject} onClose={() => setPendingProject(null)}>
        <DialogTitle>Remove this project's offline copy?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Remove this project's offline copy from this device?
          </Typography>
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            Synced server data will not be deleted.
          </Typography>
          <Typography variant="body2">
            You can download this project again later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingProject(null)} disabled={removing}>Cancel</Button>
          <Button onClick={() => void confirmRemove()} color="error" variant="contained" disabled={removing}>
            {removing ? <CircularProgress size={16} /> : "Remove from device"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Blocked: unsynced work — no destructive bypass in Phase 1. Reached either proactively
          (tapping "Manage" on a known-blocked project) or as a defense-in-depth fallback from a
          Remove attempt the service itself refused. */}
      <Dialog open={!!blockedDialog} onClose={() => setBlockedDialog(null)}>
        <DialogTitle>Can't remove this project yet</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This project has unsynced changes and cannot be removed from this device yet.
          </Typography>
          {blockerRows(blockedDialog?.blockers).length > 0 && (
            <List dense disablePadding sx={{ mt: 1.5 }}>
              {blockerRows(blockedDialog?.blockers).map((row) => (
                <ListItem key={row.label} disableGutters sx={{ py: 0.25 }}>
                  <ListItemText primary={`${row.count} ${row.label.toLowerCase()}`} />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBlockedDialog(null)}>Cancel</Button>
          <Button
            onClick={() => void handleSyncNow()}
            variant="contained"
            disabled={syncing || !canSync}
            startIcon={syncing ? <CircularProgress size={16} /> : <CloudSyncOutlinedIcon />}
          >
            Sync Now
          </Button>
        </DialogActions>
      </Dialog>

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        Removing a project's offline copy only affects this device. The project stays "Available online" and can
        be downloaded for offline use again at any time.
      </Typography>
    </Box>
  );
}
