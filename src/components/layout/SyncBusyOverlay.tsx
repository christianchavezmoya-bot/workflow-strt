/**
 * Full-screen sync busy overlay (native only).
 * Shows a rotating Strata mark while the offline queue is flushing after reconnect.
 */
import { Backdrop, Box, Stack, Typography, keyframes } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import strataSyncMark from "../../assets/strata-sync-mark.svg";
import { isMobileNativePlatform } from "../../utils/platform";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
        bgcolor: "rgba(11, 29, 36, 0.58)",
        backdropFilter: "blur(2px)",
      }}
    >
      <Stack alignItems="center" spacing={2}>
        <Box
          component="img"
          src={strataSyncMark}
          alt=""
          draggable={false}
          sx={{
            width: { xs: 88, sm: 96 },
            height: { xs: 88, sm: 96 },
            animation: `${spin} 1.15s linear infinite`,
            filter: "drop-shadow(0 4px 12px rgba(37, 99, 235, 0.35))",
          }}
        />
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
