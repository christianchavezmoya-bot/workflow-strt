/**
 * SyncCenterPage — full-screen dialog showing sync status and pending queue.
 * Opened by tapping the SyncStatusBadge in the Topbar.
 */

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useEffect, useState } from "react";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import {
  pendingGetAll,
  pendingRemove,
  type PendingAction,
} from "../../services/localDB";
import ApiDebugPanel from "../../components/ui/ApiDebugPanel";

interface Props {
  open: boolean;
  onClose: () => void;
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)  return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const secs = Math.floor((d.getTime() - Date.now()) / 1000);
  if (secs <= 0) return "now";
  if (secs < 60)  return `in ${secs}s`;
  return `in ${Math.floor(secs / 60)}m`;
}

function statusChipColor(
  status: PendingAction["status"]
): "warning" | "info" | "error" | "default" {
  if (status === "uploading") return "info";
  if (status === "failed")    return "error";
  return "warning";
}

function connectivityLabel(
  status: string,
  pendingCount: number
): { label: string; color: "success" | "warning" | "error" | "default" } {
  switch (status) {
    case "synced":
    case "syncing":
    case "pending":
      return { label: "Online", color: "success" };
    case "offline":
      return {
        label: pendingCount > 0 ? `Offline · ${pendingCount} queued` : "Offline",
        color: "warning",
      };
    case "error":
      return { label: "Sync error", color: "error" };
    default:
      return { label: "Unknown", color: "default" };
  }
}

export default function SyncCenterPage({ open, onClose }: Props) {
  const { status, pendingCount, lastSyncAt, syncing, triggerSync } = useSyncEngine();
  const [queue, setQueue]       = useState<PendingAction[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);

  const loadQueue = async () => setQueue(await pendingGetAll());

  useEffect(() => {
    if (open) void loadQueue();
  }, [open]);

  useEffect(() => {
    void loadQueue();
    const h = () => void loadQueue();
    window.addEventListener("sync-pending-changed", h);
    return () => window.removeEventListener("sync-pending-changed", h);
  }, []);

  const handleClearFailed = async () => {
    const failed = queue.filter(a => a.status === "failed");
    await Promise.all(failed.map(a => pendingRemove(a.id)));
    await loadQueue();
  };

  const { label: connLabel, color: connColor } = connectivityLabel(status, pendingCount);
  const hasFailed = queue.some(a => a.status === "failed");

  return (
    <>
      <Dialog open={open} onClose={onClose} fullScreen>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={600}>Sync Center</Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ px: 2, pt: 1, pb: 4 }}>
          {/* Connection status */}
          <Stack spacing={1} mb={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" color="text.secondary">Connection</Typography>
              <Chip
                label={connLabel}
                color={connColor}
                size="small"
                sx={{ fontWeight: 600, fontSize: "0.72rem" }}
              />
            </Stack>

            <Typography variant="body2" color="text.secondary">
              Last sync:{" "}
              <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
                {lastSyncAt ? timeAgo(lastSyncAt) : "Never"}
              </Box>
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Pending:{" "}
              <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
                {pendingCount} action{pendingCount !== 1 ? "s" : ""}
              </Box>
            </Typography>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {/* Action buttons */}
          <Stack direction="row" spacing={1} mb={3} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => void triggerSync()}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
            {hasFailed && (
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={() => void handleClearFailed()}
              >
                Clear Failed
              </Button>
            )}
          </Stack>

          {/* Pending queue */}
          {queue.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              No pending actions — all synced.
            </Typography>
          ) : (
            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary" mb={0.5}>
                Pending queue
              </Typography>
              {queue.map(action => (
                <Box
                  key={action.id}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 1.5,
                    bgcolor: "background.paper",
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                    <Stack spacing={0.5} flex={1} minWidth={0}>
                      <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 600,
                            textTransform: "uppercase",
                            color: "text.secondary",
                            fontSize: "0.65rem",
                          }}
                        >
                          {action.entityType}
                        </Typography>
                        <Chip
                          label={action.status}
                          color={statusChipColor(action.status)}
                          size="small"
                          sx={{ height: 16, fontSize: "0.62rem" }}
                        />
                        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.65rem" }}>
                          {action.method}
                        </Typography>
                      </Stack>

                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          fontSize: "0.68rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {action.url}
                      </Typography>

                      {action.lastError && (
                        <Typography
                          variant="caption"
                          sx={{ color: "error.main", fontSize: "0.65rem" }}
                        >
                          {action.lastError}
                        </Typography>
                      )}
                    </Stack>

                    <Stack alignItems="flex-end" spacing={0.25} flexShrink={0}>
                      <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.63rem" }}>
                        {action.retries > 0 ? `${action.retries} retr${action.retries === 1 ? "y" : "ies"}` : "No retries"}
                      </Typography>
                      {action.nextRetryAt && action.status === "failed" && (
                        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.63rem" }}>
                          Next: {formatTime(action.nextRetryAt)}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}

          <Divider sx={{ mt: 4, mb: 2 }} />

          {/* Link to API Debug Log */}
          <Button
            variant="text"
            size="small"
            sx={{ textTransform: "none", color: "text.secondary", fontSize: "0.72rem" }}
            onClick={() => setDebugOpen(true)}
          >
            View API Debug Log
          </Button>
        </DialogContent>
      </Dialog>

      <ApiDebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
    </>
  );
}
