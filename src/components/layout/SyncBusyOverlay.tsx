/**
 * Full-screen sync busy overlay (native only).
 * Shows a rotating Strata mark while the offline queue is flushing after reconnect.
 */
import { Backdrop, Box, Stack, Typography, keyframes } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import strataLogo from "../../assets/strata_transparent.png";
import { isMobileNativePlatform } from "../../utils/platform";

const spin3d = keyframes`
  from { transform: rotateX(14deg) rotateY(0deg); }
  to { transform: rotateX(14deg) rotateY(360deg); }
`;

const LOGO_WIDTH = { xs: 148, sm: 168 } as const;
const LOGO_HEIGHT = { xs: 78, sm: 88 } as const;

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
        <Box
          aria-label="Strata Worldwide"
          sx={{
            perspective: 1100,
            perspectiveOrigin: "center center",
            width: LOGO_WIDTH,
            height: LOGO_HEIGHT,
          }}
        >
          <Box
            sx={{
              position: "relative",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
              animation: `${spin3d} 1.15s linear infinite`,
              willChange: "transform",
            }}
          >
            <Box
              component="img"
              src={strataLogo}
              alt=""
              draggable={false}
              aria-hidden
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                transform: "translateZ(8px)",
                backfaceVisibility: "hidden",
                filter: "drop-shadow(0 10px 18px rgba(15, 23, 42, 0.45))",
              }}
            />
            <Box
              component="img"
              src={strataLogo}
              alt=""
              draggable={false}
              aria-hidden
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                transform: "rotateY(180deg) translateZ(8px)",
                backfaceVisibility: "hidden",
                opacity: 0.78,
                filter: "brightness(0.82) drop-shadow(0 6px 12px rgba(15, 23, 42, 0.35))",
              }}
            />
          </Box>
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
