import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import { Box, Stack, Typography } from "@mui/material";
import { useOfflineMode } from "../../contexts/OfflineModeContext";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import { isMobileNativePlatform } from "../../utils/platform";

export default function OfflineModeBanner() {
  const { isOfflineMode } = useOfflineMode();
  const { pendingCount } = useSyncEngine();

  if (!isMobileNativePlatform() || !isOfflineMode) return null;

  const pendingLabel =
    pendingCount === 1
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
