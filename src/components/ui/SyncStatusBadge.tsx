/**
 * SyncStatusBadge — compact sync indicator for the Topbar.
 * Tap to open the API debug log panel.
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
  UploadOutlined,
} from "@mui/icons-material";

import { useState } from "react";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import ApiDebugPanel from "./ApiDebugPanel";

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)  return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function SyncStatusBadge() {
  const { status, pendingCount, lastSyncAt, syncing, triggerSync } = useSyncEngine();
  const [debugOpen, setDebugOpen] = useState(false);

  const iconSx = { fontSize: 13 };
  const openDebug = () => setDebugOpen(true);

  const badge = (() => {
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
        <Tooltip title={pendingCount > 0 ? `${pendingCount} change${pendingCount !== 1 ? "s" : ""} queued` : "No connection"}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
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
        <Stack direction="row" alignItems="center" spacing={0.5} onClick={() => void triggerSync()}>
          <UploadOutlined sx={{ ...iconSx, color: "warning.main" }} />
          <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "warning.main" }}>
            ↑{pendingCount} pending
          </Typography>
        </Stack>
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
            size="small" variant="text" color="error"
            onClick={(e) => { e.stopPropagation(); void triggerSync(); }}
            sx={{ fontSize: "0.65rem", minWidth: "auto", p: 0, ml: 0.25, textTransform: "none" }}
            disabled={syncing}
          >
            Retry
          </Button>
        </Stack>
      );
    }

    return (
      <Tooltip title={lastSyncAt ? `Last synced ${timeAgo(lastSyncAt)}` : "Up to date"}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <CheckCircleOutlined sx={{ ...iconSx, color: "success.main" }} />
          <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "success.main" }}>
            {lastSyncAt ? timeAgo(lastSyncAt) : "Synced"}
          </Typography>
        </Stack>
      </Tooltip>
    );
  })();

  return (
    <>
      <Box onClick={openDebug} sx={{ cursor: "pointer" }}>
        {badge}
      </Box>
      <ApiDebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
    </>
  );
}

/**
 * Floating sync icon button — for use on card lists.
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
 */
export function SyncDot({ entityId, sx }: { entityId: string; sx?: object }) {
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
