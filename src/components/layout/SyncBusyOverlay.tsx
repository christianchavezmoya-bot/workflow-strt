/**
 * Full-screen sync busy overlay (native only).
 * Shows a 3D STRATA N-GO mark spinning on the horizontal axis while the offline queue flushes.
 */
import { Backdrop, Box, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import StrataNgoSpinLogo3D from "../branding/StrataNgoSpinLogo3D";
import { isMobileNativePlatform } from "../../utils/platform";
import { isNativeSyncUiActive, isNativeSyncUiActiveNow } from "../../utils/nativeSyncUiState";

const MIN_VISIBLE_MS = 450;

export default function SyncBusyOverlay() {
  const [syncing, setSyncing] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    const applySyncing = (active: boolean) => {
      if (active && !isNativeSyncUiActive(true)) return;

      if (active) {
        if (hideTimerRef.current !== null) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        shownAtRef.current = Date.now();
        setSyncing(true);
        return;
      }

      const shownAt = shownAtRef.current;
      const elapsed = shownAt ? Date.now() - shownAt : MIN_VISIBLE_MS;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        shownAtRef.current = null;
        setSyncing(false);
      }, remaining);
    };

    const onSyncing = (event: Event) => {
      const detail = (event as CustomEvent<{ syncing?: boolean }>).detail;
      applySyncing(Boolean(detail?.syncing));
    };

    window.addEventListener("sync-engine:syncing", onSyncing);

    if (isNativeSyncUiActiveNow()) {
      applySyncing(true);
    }

    return () => {
      window.removeEventListener("sync-engine:syncing", onSyncing);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!isMobileNativePlatform() || !syncing) return null;

  return (
    <Backdrop
      open
      aria-busy="true"
      aria-label="Syncing with server"
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
          sx={{ color: "common.white", fontWeight: 700, letterSpacing: "0.02em" }}
        >
          Syncing…
        </Typography>
      </Stack>
    </Backdrop>
  );
}
