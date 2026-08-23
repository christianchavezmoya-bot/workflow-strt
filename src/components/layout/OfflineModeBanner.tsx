import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import { Box, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useOfflineMode } from "../../contexts/OfflineModeContext";
import { pendingCount as getPendingCount } from "../../services/localDB";
import { isMobileNativePlatform } from "../../utils/platform";

export default function OfflineModeBanner() {
  const { isOfflineMode } = useOfflineMode();
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(() => {
    void getPendingCount().then(setPendingCount).catch(() => {});
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [isOfflineMode, refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
    window.addEventListener("sync-pending-changed", refreshPendingCount);
    window.addEventListener("offline-mode-online", refreshPendingCount);
    window.addEventListener("app-foregrounded", refreshPendingCount);
    window.addEventListener("online", refreshPendingCount);
    window.addEventListener("offline", refreshPendingCount);
    return () => {
      window.removeEventListener("sync-pending-changed", refreshPendingCount);
      window.removeEventListener("offline-mode-online", refreshPendingCount);
      window.removeEventListener("app-foregrounded", refreshPendingCount);
      window.removeEventListener("online", refreshPendingCount);
      window.removeEventListener("offline", refreshPendingCount);
    };
  }, [refreshPendingCount]);

  if (!isMobileNativePlatform() || !isOfflineMode) return null;

  const pendingLabel =
    pendingCount === 0
      ? "No changes waiting to sync"
      : pendingCount === 1
        ? "1 change waiting to sync"
        : `${pendingCount} changes waiting to sync`;

  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: "rgba(245, 158, 11, 0.12)",
        borderBottom: "1px solid rgba(245, 158, 11, 0.25)",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 1 }}
      >
        <CloudOffOutlinedIcon sx={{ color: "warning.light", fontSize: 18 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{ color: "warning.light", fontSize: "0.82rem", fontWeight: 700, lineHeight: 1.2 }}
          >
            Offline mode
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "warning.light", opacity: 0.92, display: "block", lineHeight: 1.2 }}
          >
            Changes will sync when reconnected. {pendingLabel}.
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
