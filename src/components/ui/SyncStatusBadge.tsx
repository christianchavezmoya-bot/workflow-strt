/**
 * SyncStatusBadge — compact sync indicator for the Topbar.
 * Tap to open the Sync Center page (full-screen dialog).
 * API Debug Log is accessible via a button inside the Sync Center.
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
  WarningAmberOutlined,
} from "@mui/icons-material";

import { useCallback, useEffect, useState } from "react";
import { isOfflineModeActive } from "../../services/offlineModeState";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import { pendingGetByEntityId } from "../../services/localDB";
import SyncCenterPage from "../../features/sync/SyncCenterPage";

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)  return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function SyncStatusBadge() {
  const { status, pendingCount, conflictCount, lastSyncAt, syncing, triggerSync, connectivity } = useSyncEngine();
  const [syncCenterOpen, setSyncCenterOpen] = useState(false);

  const iconSx = { fontSize: 13 };

  const badge = (() => {
    if (conflictCount > 0) {
      return (
        <Tooltip title={`${conflictCount} conflict${conflictCount !== 1 ? "s" : ""} need review — tap to open Sync Center`}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <WarningAmberOutlined sx={{ ...iconSx, color: "warning.main" }} />
            <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "warning.main" }}>
              {conflictCount} conflict{conflictCount !== 1 ? "s" : ""}
            </Typography>
          </Stack>
        </Tooltip>
      );
    }

    if (status === "syncing" && !isOfflineModeActive()) {
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
            {connectivity === "token-expired"
              ? "Sign in to sync"
              : "Sync error"}
          </Typography>
          {connectivity !== "token-expired" && (
          <Button
            size="small" variant="text" color="error"
            onClick={(e) => { e.stopPropagation(); void triggerSync(); }}
            sx={{ fontSize: "0.65rem", minWidth: "auto", p: 0, ml: 0.25, textTransform: "none" }}
            disabled={syncing}
          >
            Retry
          </Button>
          )}
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
      <Box onClick={() => setSyncCenterOpen(true)} sx={{ cursor: "pointer" }}>
        {badge}
      </Box>
      <SyncCenterPage open={syncCenterOpen} onClose={() => setSyncCenterOpen(false)} />
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
 * Checks real pending state for this specific entity via IndexedDB.
 */
export function SyncDot({ entityId, sx }: { entityId: string; sx?: object }) {
  const [actionState, setActionState] = useState<"pending" | "uploading" | "failed" | null>(null);

  const refresh = useCallback(async () => {
    const actions = await pendingGetByEntityId(entityId);
    if (actions.length === 0) { setActionState(null); return; }
    if (actions.some(a => a.conflictDetected)) setActionState("failed");
    else if (actions.some(a => a.status === "uploading")) setActionState("uploading");
    else if (actions.some(a => a.status === "failed")) setActionState("failed");
    else setActionState("pending");
  }, [entityId]);

  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener("sync-pending-changed", handler);
    return () => window.removeEventListener("sync-pending-changed", handler);
  }, [refresh]);

  if (!actionState) return null;

  const color =
    actionState === "failed"    ? "error.main"   :
    actionState === "uploading" ? "info.main"     :
                                  "warning.main";

  const animate = actionState === "uploading" || actionState === "pending";

  return (
    <Box sx={{
      width: 7, height: 7,
      borderRadius: "50%",
      bgcolor: color,
      flexShrink: 0,
      ...(animate ? {
        animation: "pulse 1.5s ease-in-out infinite",
        "@keyframes pulse": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.3 } },
      } : {}),
      ...sx,
    }} />
  );
}
