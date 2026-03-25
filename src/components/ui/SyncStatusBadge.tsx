/**
 * SyncStatusBadge — compact sync indicator for the Topbar.
 *
 * Shows one of:
 *   ● Synced  2m ago
 *   ↺ Syncing...
 *   ⏳ 3 pending
 *   ⚡ Offline · 3 pending
 *   ⚠ Sync error  [Retry]
 */

import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CheckCircleOutlined,
  CloudOffOutlined,
  ErrorOutlineOutlined,
  SyncOutlined,
  UploadOutlined,
} from "@mui/icons-material";
import { useSyncEngine } from "../../hooks/useSyncEngine";

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)  return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function SyncStatusBadge() {
  const { status, pendingCount, lastSyncAt, syncing, triggerSync } = useSyncEngine();

  // ── Layout helpers ─────────────────────────────────────────────────────────
  const iconSx = { fontSize: 13 };

  if (status === "syncing") {
    return (
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <CircularProgress size={11} thickness={5} />
        <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
          Syncing…
        </Typography>
      </Stack>
    );
  }

  if (status === "offline") {
    return (
      <Tooltip title={pendingCount > 0 ? `${pendingCount} change${pendingCount !== 1 ? "s" : ""} queued — will sync when online` : "No connection"}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ cursor: "default" }}>
          <CloudOffOutlined sx={{ ...iconSx, color: "warning.main" }} />
          <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "warning.main" }}>
            Offline{pendingCount > 0 ? ` · ↑${pendingCount}` : ""}
          </Typography>
        </Stack>
      </Tooltip>
    );
  }

  if (status === "pending") {
    return (
      <Tooltip title={`${pendingCount} change${pendingCount !== 1 ? "s" : ""} waiting to upload`}>
        <Stack
          direction="row" alignItems="center" spacing={0.5}
          onClick={() => void triggerSync()}
          sx={{ cursor: "pointer" }}
        >
          <UploadOutlined sx={{ ...iconSx, color: "warning.main" }} />
          <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "warning.main" }}>
            ↑{pendingCount} pending
          </Typography>
        </Stack>
      </Tooltip>
    );
  }

  if (status === "error") {
    return (
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <ErrorOutlineOutlined sx={{ ...iconSx, color: "error.main" }} />
        <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "error.main" }}>
          Sync error
        </Typography>
        <Button
          size="small"
          variant="text"
          color="error"
          onClick={() => void triggerSync()}
          sx={{ fontSize: "0.65rem", minWidth: "auto", p: 0, ml: 0.25, textTransform: "none" }}
          disabled={syncing}
        >
          Retry
        </Button>
      </Stack>
    );
  }

  // synced
  return (
    <Tooltip title={lastSyncAt ? `Last synced ${timeAgo(lastSyncAt)}` : "Up to date"}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ cursor: "default" }}>
        <CheckCircleOutlined sx={{ ...iconSx, color: "success.main" }} />
        <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "success.main" }}>
          {lastSyncAt ? timeAgo(lastSyncAt) : "Synced"}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

/**
 * Floating sync icon button — for use on card lists.
 * Shows a spinner while syncing, upload icon when pending, nothing when synced.
 */
export function SyncIconButton({ onPress }: { onPress?: () => void }) {
  const { status, triggerSync } = useSyncEngine();
  const handle = () => { void triggerSync(); onPress?.(); };

  if (status === "syncing") return <CircularProgress size={14} thickness={5} sx={{ ml: 0.5 }} />;
  if (status === "error")   return <ErrorOutlineOutlined sx={{ fontSize: 14, color: "error.main", cursor: "pointer", ml: 0.5 }} onClick={handle} />;
  if (status === "pending") return <UploadOutlined sx={{ fontSize: 14, color: "warning.main", cursor: "pointer", ml: 0.5 }} onClick={handle} />;
  return <Box sx={{ width: 14 }} />;
}

/**
 * Tiny dot shown on individual cards to indicate their sync state.
 * Pass the entityId — if it has a pending action in the queue it glows amber.
 */
export function SyncDot({ entityId, sx }: { entityId: string; sx?: object }) {
  // We use a simple DOM event approach — the dot subscribes to pending changes
  // and checks if this entity has a pending action.
  // For now render a static amber dot — entity-level tracking can be added later.
  if (!entityId) return null;
  return (
    <Box
      sx={{
        width: 6, height: 6,
        borderRadius: "50%",
        bgcolor: "warning.main",
        flexShrink: 0,
        animation: "pulse 1.5s ease-in-out infinite",
        "@keyframes pulse": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.3 },
        },
        ...sx,
      }}
    />
  );
}
