/**
 * Compact native sync/consistency dot beside the business logo.
 * Green = in sync; amber = uploads pending; blue = downloading; spinner = active sync.
 */

import { Box, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import { isOfflineModeActive } from "../../services/offlineModeState";
import { isMobileNativePlatform } from "../../utils/platform";
import SyncCenterPage from "../../features/sync/SyncCenterPage";

const LABEL_TIMEOUT_MS = 3_000;

type BootstrapState = { running: boolean };

function indicatorColor(
  conflictCount: number,
  bootstrapRunning: boolean,
  syncing: boolean,
  pendingCount: number,
  status: string,
): string {
  if (conflictCount > 0) return "error.main";
  if (bootstrapRunning) return "info.main";
  if (syncing && !isOfflineModeActive()) return "primary.main";
  if (status === "offline" || status === "error") return "warning.main";
  if (pendingCount > 0 || status === "pending") return "warning.main";
  return "success.main";
}

function indicatorTitle(
  conflictCount: number,
  bootstrapRunning: boolean,
  syncing: boolean,
  pendingCount: number,
  status: string,
  serverReachable: boolean | null,
): string {
  if (conflictCount > 0) {
    return `${conflictCount} sync conflict${conflictCount === 1 ? "" : "s"} — tap for Sync Center`;
  }
  if (bootstrapRunning) return "Downloading field data from server…";
  if (syncing && !isOfflineModeActive()) {
    return pendingCount > 0
      ? `Uploading ${pendingCount} change${pendingCount === 1 ? "" : "s"}…`
      : "Syncing with server…";
  }
  if (isOfflineModeActive()) {
    return pendingCount > 0
      ? `Offline — ${pendingCount} change${pendingCount === 1 ? "" : "s"} queued`
      : "Offline mode — changes will sync when reconnected";
  }
  if (status === "offline" || serverReachable === false) {
    return pendingCount > 0
      ? `Server unreachable — ${pendingCount} change${pendingCount === 1 ? "" : "s"} queued`
      : "Server unreachable";
  }
  if (pendingCount > 0 || status === "pending") {
    return `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to upload`;
  }
  if (status === "error") return "Sync error — tap to open Sync Center";
  return "In sync with server";
}

function busyActivityLabel(
  bootstrapRunning: boolean,
  syncing: boolean,
  pendingCount: number,
): string | null {
  if (bootstrapRunning) return "Downloading…";
  if (syncing && pendingCount > 0) {
    return `Uploading ${pendingCount} change${pendingCount === 1 ? "" : "s"}…`;
  }
  if (syncing) return "Syncing…";
  return null;
}

export default function DataConsistencyIndicator() {
  const { status, pendingCount, conflictCount, syncing, serverReachable } = useSyncEngine();
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [syncCenterOpen, setSyncCenterOpen] = useState(false);
  const [activityLabel, setActivityLabel] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showLabel = useCallback((text: string | null, persistent = false) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setActivityLabel(text);
    if (text && !persistent) {
      hideTimerRef.current = setTimeout(() => {
        setActivityLabel(null);
        hideTimerRef.current = null;
      }, LABEL_TIMEOUT_MS);
    }
  }, []);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    const onStart = () => setBootstrap({ running: true });
    const onDone = () => setBootstrap(null);

    window.addEventListener("bootstrap:started", onStart);
    window.addEventListener("bootstrap:complete", onDone);
    window.addEventListener("bootstrap:error", onDone);
    return () => {
      window.removeEventListener("bootstrap:started", onStart);
      window.removeEventListener("bootstrap:complete", onDone);
      window.removeEventListener("bootstrap:error", onDone);
    };
  }, []);

  useEffect(() => {
    const onUpToDate = (event: Event) => {
      const uploaded = (event as CustomEvent<{ uploaded?: boolean }>).detail?.uploaded === true;
      showLabel(uploaded ? "Changes uploaded" : "Up to date");
    };
    window.addEventListener("sync:up-to-date", onUpToDate);
    return () => window.removeEventListener("sync:up-to-date", onUpToDate);
  }, [showLabel]);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    const bootstrapRunning = bootstrap?.running === true;
    const busyLabel = busyActivityLabel(bootstrapRunning, syncing, pendingCount);

    if (busyLabel) {
      showLabel(busyLabel, true);
      return;
    }

    if (conflictCount > 0) {
      showLabel(`${conflictCount} conflict${conflictCount === 1 ? "" : "s"}`, true);
      return;
    }

    if (isOfflineModeActive()) {
      showLabel(pendingCount > 0 ? `Offline · ${pendingCount} queued` : "Offline", true);
      return;
    }

    if (status === "offline" || serverReachable === false) {
      showLabel("Server unreachable", true);
      return;
    }

    if (pendingCount > 0) {
      showLabel(`${pendingCount} waiting to upload`, true);
      return;
    }

    if (activityLabel && !hideTimerRef.current) {
      return;
    }

    if (status === "synced") {
      showLabel(null);
    }
  }, [
    activityLabel,
    bootstrap?.running,
    conflictCount,
    pendingCount,
    serverReachable,
    showLabel,
    status,
    syncing,
  ]);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  if (!isMobileNativePlatform()) return null;

  const bootstrapRunning = bootstrap?.running === true;
  const busy = (syncing && !isOfflineModeActive()) || bootstrapRunning;
  const color = indicatorColor(conflictCount, bootstrapRunning, syncing, pendingCount, status);
  const title = indicatorTitle(
    conflictCount,
    bootstrapRunning,
    syncing,
    pendingCount,
    status,
    serverReachable,
  );

  return (
    <>
      <Tooltip title={title} arrow>
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          onClick={() => setSyncCenterOpen(true)}
          sx={{ cursor: "pointer", minWidth: 0, flexShrink: 1 }}
        >
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: "1px solid",
              borderColor: color,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              bgcolor: "rgba(255,255,255,0.04)",
            }}
            aria-label={title}
          >
            {busy ? (
              <CircularProgress size={12} thickness={5} sx={{ color }} />
            ) : (
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  bgcolor: color,
                  ...(pendingCount > 0 || bootstrapRunning
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
          {activityLabel && (
            <Typography
              variant="caption"
              noWrap
              sx={{
                color: "text.secondary",
                fontSize: "0.68rem",
                maxWidth: 120,
                lineHeight: 1.2,
              }}
            >
              {activityLabel}
            </Typography>
          )}
        </Stack>
      </Tooltip>
      <SyncCenterPage open={syncCenterOpen} onClose={() => setSyncCenterOpen(false)} />
    </>
  );
}
