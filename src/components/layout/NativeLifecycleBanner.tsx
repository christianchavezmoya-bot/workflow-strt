import CloudSyncOutlinedIcon from "@mui/icons-material/CloudSyncOutlined";
import { Box, Stack, Typography } from "@mui/material";
import { useNativeAppLifecycle } from "../../hooks/useNativeAppLifecycle";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import { isMobileNativePlatform } from "../../utils/platform";

export default function NativeLifecycleBanner() {
  const { phase } = useNativeAppLifecycle();
  const { syncing, pendingCount, connectivity } = useSyncEngine();

  if (!isMobileNativePlatform()) return null;

  const showSyncHint =
    phase === "foreground-sync"
    && connectivity !== "offline"
    && (syncing || pendingCount > 0);

  if (!showSyncHint) return null;

  const detail = syncing
    ? "Syncing your latest changes…"
    : pendingCount > 0
      ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} queued — syncing now`
      : "Checking for updates…";

  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: "rgba(45, 212, 191, 0.1)",
        borderBottom: "1px solid rgba(45, 212, 191, 0.22)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 0.75 }}>
        <CloudSyncOutlinedIcon sx={{ color: "primary.light", fontSize: 18 }} />
        <Typography variant="caption" sx={{ color: "primary.light", fontWeight: 700 }}>
          {detail}
        </Typography>
      </Stack>
    </Box>
  );
}
