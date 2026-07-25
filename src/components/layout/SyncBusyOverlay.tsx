/**
 * Full-screen sync busy overlay (native only).
 * Shows a rotating Strata mark while the offline queue is flushing after reconnect.
 */
import { Backdrop, Box, Stack, Typography, keyframes } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import strataLogo from "../../assets/strata_transparent.png";
import { isMobileNativePlatform } from "../../utils/platform";

const spinY = keyframes`
  from { transform: rotateY(0deg); }
  to { transform: rotateY(360deg); }
`;

const MIN_VISIBLE_MS = 450;

export default function SyncBusyOverlay() {
  const [syncing, setSyncing] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    const applySyncing = (active: boolean) => {
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
        <Box sx={{ perspective: 900 }}>
          <Box
            component="img"
            src={strataLogo}
            alt="Strata Worldwide"
            draggable={false}
            sx={{
              width: { xs: 148, sm: 168 },
              height: "auto",
              animation: `${spinY} 1.15s linear infinite`,
              transformStyle: "preserve-3d",
              backfaceVisibility: "hidden",
            }}
          />
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
