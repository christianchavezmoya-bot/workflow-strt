/**
 * ConnectivityDebugBar — legacy wrapper; status chips now live in Sync Center on native.
 * Kept for imports that expect a bar layout; composes ConnectivityStatusChips only.
 */
import { Box, Stack } from "@mui/material";
import ConnectivityStatusChips from "./ConnectivityStatusChips";

export default function ConnectivityDebugBar() {
  return (
    <Box
      sx={{
        width: "100%",
        px: 0,
        py: 0.5,
        borderTop: "0.5px solid",
        borderColor: "rgba(255,255,255,0.08)",
        bgcolor: "transparent",
      }}
    >
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
        <ConnectivityStatusChips />
      </Stack>
    </Box>
  );
}
