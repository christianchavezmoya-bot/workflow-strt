import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import type { DashboardWorkspaceAssetItem } from "../../services/projectAssetService";

type QuickActionAsset = Pick<DashboardWorkspaceAssetItem, "assetTag" | "assetName">;

type Props = {
  open: boolean;
  asset: QuickActionAsset | null;
  reason: "unassigned" | "other";
  otherName?: string;
  userFullName?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DashboardAutoAssignConfirmDialog({
  open,
  asset,
  reason,
  otherName,
  userFullName,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{reason === "unassigned" ? "Unassigned Asset" : "Asset Assigned to Another User"}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {reason === "unassigned" ? (
            <>
              <strong>{asset?.assetTag || asset?.assetName}</strong> has no installer assigned. Starting this workflow
              will assign it to <strong>you ({userFullName})</strong>.
            </>
          ) : (
            <>
              <strong>{asset?.assetTag || asset?.assetName}</strong> is currently assigned to <strong>{otherName}</strong>
              . Starting this workflow will reassign it to <strong>you ({userFullName})</strong>.
            </>
          )}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm}>
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
