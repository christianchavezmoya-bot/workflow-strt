import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";

export type AutoAssignConfirmState = {
  asset: ProjectAsset;
  reason: "unassigned" | "other";
  otherName?: string;
};

type Props = {
  confirm: AutoAssignConfirmState | null;
  currentUserName: string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function AssetInstallationAutoAssignConfirmDialog({
  confirm,
  currentUserName,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={Boolean(confirm)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {confirm?.reason === "unassigned" ? "Unassigned asset" : "Asset assigned to someone else"}
      </DialogTitle>
      <DialogContent>
        {confirm?.reason === "unassigned" ? (
          <Typography variant="body2">
            <strong>{confirm.asset.assetTag || confirm.asset.assetName}</strong> has no installer assigned.
            Starting this workflow will assign it to <strong>you ({currentUserName})</strong> and notify the Project Manager.
          </Typography>
        ) : (
          <Typography variant="body2">
            <strong>{confirm?.asset.assetTag || confirm?.asset.assetName}</strong> is currently assigned to <strong>{confirm?.otherName}</strong>.
            Starting this workflow will reassign it to <strong>you ({currentUserName})</strong> and notify the Project Manager.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={onConfirm}>
          Assign to me &amp; Start
        </Button>
      </DialogActions>
    </Dialog>
  );
}
