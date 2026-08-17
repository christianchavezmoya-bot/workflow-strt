import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";

type Props = {
  asset: ProjectAsset | null;
  purging: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function AssetInstallationPurgeConfirmDialog({
  asset,
  purging,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={Boolean(asset)} onClose={() => !purging && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Asset Permanently?</DialogTitle>
      <DialogContent>
        <Typography>
          Permanently delete asset <strong>{asset?.assetTag}</strong>? This cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={purging}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={purging}
          startIcon={purging ? <CircularProgress size={14} /> : undefined}
        >
          {purging ? "Deleting..." : "Delete permanently"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
