import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, CircularProgress, Snackbar } from "@mui/material";
import { RefreshOutlined } from "@mui/icons-material";
import { useSyncEngine } from "../../hooks/useSyncEngine";

const PULL_THRESHOLD = 72;  // raw finger-pixels before triggering
const MAX_VISUAL     = 80;  // max indicator travel in px

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { isOnline, syncing, pendingCount, triggerSync } = useSyncEngine();

  const [pullY, setPullY]         = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast]         = useState<string | null>(null);

  // Refs so touch handlers never go stale without re-registering
  const startYRef      = useRef(0);
  const pullDeltaRef   = useRef(0);
  const activePullRef  = useRef(false);
  const isOnlineRef    = useRef(isOnline);
  const pendingRef     = useRef(pendingCount);
  const syncingRef     = useRef(syncing);
  const triggerRef     = useRef(triggerSync);
  const refreshingRef  = useRef(refreshing);

  isOnlineRef.current   = isOnline;
  pendingRef.current    = pendingCount;
  syncingRef.current    = syncing;
  triggerRef.current    = triggerSync;
  refreshingRef.current = refreshing;

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await triggerRef.current();
    } finally {
      setRefreshing(false);
      setPullY(0);
      pullDeltaRef.current = 0;
    }
  }, []);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (window.scrollY > 2) return;
      startYRef.current   = e.touches[0].clientY;
      pullDeltaRef.current = 0;
      activePullRef.current = true;
      setIsPulling(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!activePullRef.current) return;
      if (window.scrollY > 2) {
        activePullRef.current = false;
        setPullY(0);
        setIsPulling(false);
        return;
      }

      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        pullDeltaRef.current = 0;
        setPullY(0);
        setIsPulling(false);
        return;
      }

      pullDeltaRef.current = delta;
      // Rubber-band: indicator moves at ~50% of finger speed, capped at MAX_VISUAL
      const visual = Math.min(MAX_VISUAL, delta * 0.5);
      setPullY(visual);
      setIsPulling(true);

      // Prevent native scroll-bounce while pulling down from the top
      if (delta > 4) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!activePullRef.current) return;
      activePullRef.current = false;
      setIsPulling(false);

      const delta = pullDeltaRef.current;

      if (delta < PULL_THRESHOLD) {
        // Didn't pull far enough — snap back
        setPullY(0);
        pullDeltaRef.current = 0;
        return;
      }

      const canRefresh =
        isOnlineRef.current &&
        !syncingRef.current &&
        pendingRef.current === 0;

      if (!canRefresh) {
        const reason =
          !isOnlineRef.current      ? "You're offline — connect to sync" :
          pendingRef.current > 0    ? "Finish your current changes before syncing" :
                                      "Sync already in progress";
        setToast(reason);
        setPullY(0);
        pullDeltaRef.current = 0;
        return;
      }

      void doRefresh();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove",  onTouchMove,  { passive: false });
    document.addEventListener("touchend",   onTouchEnd,   { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove",  onTouchMove);
      document.removeEventListener("touchend",   onTouchEnd);
    };
  }, [doRefresh]);

  // Indicator sits just above viewport when hidden, slides in during pull
  const indicatorY = (pullY > 0 || refreshing)
    ? pullY + 20   // 20px below the fixed topbar at rest of pull
    : -60;         // hidden above viewport

  // Rotation: 0° at rest → 180° at threshold → keeps spinning when refreshing
  const iconRotation = Math.min(180, (pullDeltaRef.current / PULL_THRESHOLD) * 180);
  const atThreshold  = pullDeltaRef.current >= PULL_THRESHOLD;

  return (
    <Box sx={{ position: "relative" }}>
      {/* ── Pull indicator bubble ── */}
      <Box sx={{
        position:  "fixed",
        top:       0,
        left:      "50%",
        zIndex:    1600,  // above topbar (150) but below dialogs
        width:     44,
        height:    44,
        borderRadius: "50%",
        display:   "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor:   "background.paper",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        border:    "1px solid rgba(255,255,255,0.1)",
        transform: `translateX(-50%) translateY(${indicatorY}px)`,
        transition: isPulling
          ? "none"                                         // follows finger instantly
          : "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)", // spring snap-back / snap-in
        pointerEvents: "none",
      }}>
        {refreshing ? (
          <CircularProgress size={20} thickness={5} />
        ) : (
          <RefreshOutlined sx={{
            fontSize: 20,
            color: atThreshold ? "primary.main" : "text.secondary",
            transform: `rotate(${iconRotation}deg)`,
            transition: "color 0.2s, transform 0.1s linear",
          }} />
        )}
      </Box>

      {children}

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ mb: "calc(64px + env(safe-area-inset-bottom))" }}
      >
        <Alert
          severity="warning"
          onClose={() => setToast(null)}
          sx={{ width: "100%" }}
        >
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  );
}
