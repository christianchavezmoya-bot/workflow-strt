/**
 * Full-screen sync busy overlay (native only).
 * Shows a 3D STRATA N-GO mark spinning on the vertical Y-axis while a foreground
 * sync session is active (upload flush + bootstrap download until fully ready).
 */
import { Backdrop, Box, Button, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import StrataNgoSpinLogo3D from "../branding/StrataNgoSpinLogo3D";
import { isMobileNativePlatform } from "../../utils/platform";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import {
  NATIVE_FOREGROUND_SYNC_SESSION_EVENT,
  type NativeForegroundSyncSessionState,
} from "../../utils/nativeForegroundSyncSession";

const MIN_VISIBLE_MS = 450;
const SYNC_CENTER_OPEN_EVENT = "sync-center:open-request";

export default function SyncBusyOverlay() {
  const { pendingCount, syncing } = useSyncEngine();
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    const applyState = (state: NativeForegroundSyncSessionState) => {
      if (state.overlayVisible) {
        if (hideTimerRef.current !== null) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        shownAtRef.current = Date.now();
        setConflictsOnly(state.conflictsOnly);
        setOverlayVisible(true);
        return;
      }

      setConflictsOnly(false);
      const shownAt = shownAtRef.current;
      const elapsed = shownAt ? Date.now() - shownAt : MIN_VISIBLE_MS;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        shownAtRef.current = null;
        setOverlayVisible(false);
      }, remaining);
    };

    const onSessionState = (event: Event) => {
      const detail = (event as CustomEvent<NativeForegroundSyncSessionState>).detail;
      if (detail) applyState(detail);
    };

    window.addEventListener(NATIVE_FOREGROUND_SYNC_SESSION_EVENT, onSessionState);

    return () => {
      window.removeEventListener(NATIVE_FOREGROUND_SYNC_SESSION_EVENT, onSessionState);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const openSyncCenter = () => {
    window.dispatchEvent(new Event(SYNC_CENTER_OPEN_EVENT));
  };

  if (!isMobileNativePlatform() || !overlayVisible) return null;

  const statusLine = (() => {
    if (conflictsOnly) return null;
    if (syncing && pendingCount > 0) {
      return `Uploading ${pendingCount} item${pendingCount === 1 ? "" : "s"}…`;
    }
    return "Syncing…";
  })();

  return (
    <Backdrop
      open
      aria-busy={!conflictsOnly}
      aria-label={conflictsOnly ? "Sync conflicts need attention" : "Syncing with server"}
      sx={{
        zIndex: 1300,
        flexDirection: "column",
        bgcolor: "rgba(11, 29, 36, 0.62)",
      }}
    >
      <Stack alignItems="center" spacing={2}>
        <Box
          aria-label="Strata N-go"
          sx={{
            filter: "drop-shadow(0 12px 22px rgba(15, 23, 42, 0.5))",
            bgcolor: "transparent",
          }}
        >
          <StrataNgoSpinLogo3D />
        </Box>
        <Typography
          variant="body1"
          sx={{ color: "common.white", fontWeight: 700, letterSpacing: "0.02em", textAlign: "center", px: 2 }}
        >
          {conflictsOnly
            ? "Resolve conflicts in Sync Center to finish syncing."
            : statusLine}
        </Typography>
        {conflictsOnly && (
          <Button
            variant="contained"
            color="warning"
            onClick={openSyncCenter}
            sx={{ fontWeight: 700 }}
          >
            Open Sync Center
          </Button>
        )}
      </Stack>
    </Backdrop>
  );
}

export { SYNC_CENTER_OPEN_EVENT };
