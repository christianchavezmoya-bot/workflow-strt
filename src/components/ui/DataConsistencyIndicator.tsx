/**
 * Compact native sync/consistency dot beside the business logo.
 *
 * Steady green  = offline-ready (bootstrap complete + fresh, uploads caught up, idle)
 * Amber pulse   = online but not offline-ready yet
 * Blue spinner  = downloading field data (bootstrap)
 * Teal spinner  = uploading queued changes
 * Red           = sync conflicts
 */

import { Box, CircularProgress, Tooltip } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import {
  offlineBootstrapService,
  type BootstrapStatus,
} from "../../services/offlineBootstrapService";
import { isOfflineModeActive } from "../../services/offlineModeState";
import { isMobileNativePlatform } from "../../utils/platform";
import SyncCenterPage from "../../features/sync/SyncCenterPage";

type IndicatorVisual =
  | { kind: "spinner"; color: string; title: string }
  | { kind: "dot"; color: string; pulse: boolean; title: string };

function buildNotReadyTitle(
  bootstrapStatus: BootstrapStatus | null,
  pendingCount: number,
  status: string,
): string {
  const reasons: string[] = [];
  if (pendingCount > 0 || status === "pending") {
    reasons.push(
      `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to upload`,
    );
  }
  if (!bootstrapStatus?.lastCompletedAt) {
    reasons.push("field data not downloaded yet");
  } else if (bootstrapStatus.isStale) {
    reasons.push("cached field data is stale — refresh recommended");
  }
  if (status === "error") {
    reasons.push("sync error — tap for Sync Center");
  }
  if (reasons.length === 0) {
    reasons.push("preparing offline cache");
  }
  return `Not offline-ready — ${reasons.join("; ")}. Tap for Sync Center`;
}

function deriveIndicator(
  bootstrapStatus: BootstrapStatus | null,
  conflictCount: number,
  syncing: boolean,
  pendingCount: number,
  status: string,
  serverReachable: boolean | null,
): IndicatorVisual {
  if (conflictCount > 0) {
    return {
      kind: "dot",
      color: "error.main",
      pulse: false,
      title: `${conflictCount} sync conflict${conflictCount === 1 ? "" : "s"} — tap for Sync Center`,
    };
  }

  const bootstrapRunning = bootstrapStatus?.isRunning === true;

  if (bootstrapRunning) {
    return {
      kind: "spinner",
      color: "info.main",
      title: "Downloading field data from server…",
    };
  }

  if (syncing && !isOfflineModeActive()) {
    return {
      kind: "spinner",
      color: "primary.main",
      title: pendingCount > 0
        ? `Uploading ${pendingCount} change${pendingCount === 1 ? "" : "s"}…`
        : "Syncing with server…",
    };
  }

  const isOffline =
    isOfflineModeActive()
    || status === "offline"
    || serverReachable === false;

  const uploadClear = pendingCount === 0 && status !== "pending";
  const offlineReady =
    uploadClear
    && (bootstrapStatus?.readyForOffline ?? false)
    && status !== "error";

  if (offlineReady) {
    return {
      kind: "dot",
      color: "success.main",
      pulse: false,
      title: "Ready for offline — field data downloaded and uploads caught up",
    };
  }

  if (isOffline) {
    if (isOfflineModeActive()) {
      return {
        kind: "dot",
        color: "warning.main",
        pulse: false,
        title: pendingCount > 0
          ? `Offline mode — ${pendingCount} change${pendingCount === 1 ? "" : "s"} queued`
          : bootstrapStatus?.lastCompletedAt
            ? "Offline mode — using cached field data"
            : "Offline mode — field data may be incomplete",
      };
    }
    return {
      kind: "dot",
      color: "warning.main",
      pulse: false,
      title: pendingCount > 0
        ? `Server unreachable — ${pendingCount} change${pendingCount === 1 ? "" : "s"} queued`
        : "Server unreachable — cached data only",
    };
  }

  if (status === "error") {
    return {
      kind: "dot",
      color: "warning.main",
      pulse: true,
      title: "Sync error — tap to open Sync Center",
    };
  }

  return {
    kind: "dot",
    color: "warning.main",
    pulse: true,
    title: buildNotReadyTitle(bootstrapStatus, pendingCount, status),
  };
}

export default function DataConsistencyIndicator() {
  const { status, pendingCount, conflictCount, syncing, serverReachable } = useSyncEngine();
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [syncCenterOpen, setSyncCenterOpen] = useState(false);

  const reloadBootstrapStatus = useCallback(async () => {
    const next = await offlineBootstrapService.getStatus();
    setBootstrapStatus(next);
  }, []);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    void reloadBootstrapStatus();

    const onBootstrapChange = () => { void reloadBootstrapStatus(); };
    const onSyncChange = () => { void reloadBootstrapStatus(); };

    window.addEventListener("bootstrap:started", onBootstrapChange);
    window.addEventListener("bootstrap:complete", onBootstrapChange);
    window.addEventListener("bootstrap:error", onBootstrapChange);
    window.addEventListener("sync-pending-changed", onSyncChange);
    window.addEventListener("sync-engine:flush-complete", onSyncChange);

    return () => {
      window.removeEventListener("bootstrap:started", onBootstrapChange);
      window.removeEventListener("bootstrap:complete", onBootstrapChange);
      window.removeEventListener("bootstrap:error", onBootstrapChange);
      window.removeEventListener("sync-pending-changed", onSyncChange);
      window.removeEventListener("sync-engine:flush-complete", onSyncChange);
    };
  }, [reloadBootstrapStatus]);

  if (!isMobileNativePlatform()) return null;

  const visual = deriveIndicator(
    bootstrapStatus,
    conflictCount,
    syncing,
    pendingCount,
    status,
    serverReachable,
  );

  return (
    <>
      <Tooltip title={visual.title} arrow>
        <Box
          onClick={() => setSyncCenterOpen(true)}
          sx={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "1px solid",
            borderColor: visual.color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            cursor: "pointer",
            bgcolor: "rgba(255,255,255,0.04)",
          }}
          aria-label={visual.title}
        >
          {visual.kind === "spinner" ? (
            <CircularProgress size={12} thickness={5} sx={{ color: visual.color }} />
          ) : (
            <Box
              sx={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                bgcolor: visual.color,
                ...(visual.pulse
                  ? {
                      animation: "consistency-pulse 1.6s ease-in-out infinite",
                      "@keyframes consistency-pulse": {
                        "0%, 100%": { opacity: 1 },
                        "50%": { opacity: 0.35 },
                      },
                    }
                  : {}),
              }}
            />
          )}
        </Box>
      </Tooltip>
      <SyncCenterPage open={syncCenterOpen} onClose={() => setSyncCenterOpen(false)} />
    </>
  );
}
