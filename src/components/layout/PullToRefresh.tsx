import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, CircularProgress, Snackbar } from "@mui/material";
import type { AlertColor } from "@mui/material";
import { RefreshOutlined } from "@mui/icons-material";
import { useSyncEngine } from "../../hooks/useSyncEngine";

const PULL_THRESHOLD = 72;  // raw finger-pixels before triggering
const MAX_VISUAL     = 80;  // max indicator travel in px

type ToastState = { message: string; severity: AlertColor } | null;

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { canSync, syncing, pendingCount, triggerSync } = useSyncEngine();

  const [pullY, setPullY]         = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast]         = useState<ToastState>(null);

  // Refs so touch handlers never go stale without re-registering
  const startYRef      = useRef(0);
  const pullDeltaRef   = useRef(0);
  const activePullRef  = useRef(false);
  const canSyncRef     = useRef(canSync);
  const pendingRef     = useRef(pendingCount);
  const syncingRef     = useRef(syncing);
  const triggerRef     = useRef(triggerSync);
  const refreshingRef  = useRef(refreshing);
  const dialogOpenRef  = useRef(false);

  canSyncRef.current    = canSync;
  pendingRef.current    = pendingCount;
  syncingRef.current    = syncing;
  triggerRef.current    = triggerSync;
  refreshingRef.current = refreshing;

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await triggerRef.current({ forceDownload: false });
      if (result.upToDate) {
        setToast({
          message: result.uploaded ? "Changes uploaded" : "Up to date",
          severity: "success",
        });
      } else if (result.downloadScheduled) {
        setToast({
          message: result.uploaded ? "Synced — updating field data…" : "Updating field data…",
          severity: "info",
        });
      }
    } finally {
      setRefreshing(false);
      setPullY(0);
      pullDeltaRef.current = 0;
    }
  }, []);

  // Pull-to-refresh must not show bottom toasts over open dialogs (e.g. Sync Center).
  useEffect(() => {
    const syncDialogState = () => {
      dialogOpenRef.current = !!document.querySelector(".MuiDialog-root, .MuiModal-root");
    };
    syncDialogState();
    const observer = new MutationObserver(syncDialogState);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (dialogOpenRef.current) return;
      if (refreshingRef.current) return;
      if (window.scrollY > 2) return;
      if (e.touches.length !== 1) return;
      activePullRef.current = true;
      setIsPulling(true);
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!activePullRef.current) return;
      const delta = Math.max(0, e.touches[0].clientY - startYRef.current);
      if (delta > 0 && window.scrollY <= 2) {
        e.preventDefault();
      }
      pullDeltaRef.current = Math.min(delta, MAX_VISUAL);
      setPullY(pullDeltaRef.current);
    };

    const onTouchEnd = () => {
      if (!activePullRef.current) return;
      activePullRef.current = false;
      setIsPulling(false);

      const delta = pullDeltaRef.current;

      if (delta < PULL_THRESHOLD) {
        setPullY(0);
        pullDeltaRef.current = 0;
        return;
      }

      const canRefresh =
        canSyncRef.current &&
        !syncingRef.current;

      if (dialogOpenRef.current) {
        setPullY(0);
        pullDeltaRef.current = 0;
        return;
      }

      if (!canRefresh) {
        const reason =
          !canSyncRef.current ? "Server not reachable — connect to your field network to sync" :
          "Sync already in progress";
        setToast({ message: reason, severity: "warning" });
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

  const indicatorY = (pullY > 0 || refreshing)
    ? pullY + 20
    : -60;

  const iconRotation = Math.min(180, (pullDeltaRef.current / PULL_THRESHOLD) * 180);
  const atThreshold  = pullDeltaRef.current >= PULL_THRESHOLD;

  return (
    <Box sx={{ position: "relative" }}>
      <Box sx={{
        position:  "fixed",
        top:       0,
        left:      "50%",
        zIndex:    1600,
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
          ? "none"
          : "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
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
          severity={toast?.severity ?? "info"}
          onClose={() => setToast(null)}
          sx={{ width: "100%", visibility: toast ? "visible" : "hidden" }}
        >
          {toast?.message ?? ""}
        </Alert>
      </Snackbar>
    </Box>
  );
}
