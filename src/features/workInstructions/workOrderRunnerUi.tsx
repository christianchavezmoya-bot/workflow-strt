import { Typography } from "@mui/material";
import { isMobileNativePlatform } from "../../utils/platform";

export const runnerDialogContentSx = {
  overflowX: "hidden",
  overflowY: isMobileNativePlatform() ? "auto" : undefined,
  overscrollBehavior: isMobileNativePlatform() ? "contain" : undefined,
  flex: isMobileNativePlatform() ? 1 : undefined,
  minHeight: isMobileNativePlatform() ? 0 : undefined,
  px: isMobileNativePlatform() ? 1.5 : 3,
} as const;

export const runnerBodyStackSx = {
  mt: 1,
  maxWidth: "100%",
  minWidth: 0,
} as const;

export function renderAssetIdentifier(assetTag?: string) {
  if (!assetTag?.trim()) return null;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
      Asset ID: {assetTag}
    </Typography>
  );
}
