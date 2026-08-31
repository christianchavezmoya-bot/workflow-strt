import { Chip } from "@mui/material";
import { isDevAppBuild } from "../../utils/appEnvironment";

/** Small, non-intrusive DEV-only environment marker for testers. */
export default function DevEnvironmentBadge() {
  if (!isDevAppBuild()) return null;

  return (
    <Chip
      label="DEV"
      size="small"
      color="warning"
      variant="outlined"
      sx={{
        height: 22,
        fontSize: "0.65rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        "& .MuiChip-label": { px: 0.75 },
      }}
    />
  );
}
