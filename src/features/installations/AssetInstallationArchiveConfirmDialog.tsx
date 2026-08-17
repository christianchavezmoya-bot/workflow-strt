import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";

type Props = {
  asset: ProjectAsset | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function AssetInstallationArchiveConfirmDialog({
  asset,
  deleting,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={Boolean(asset)} onClose={() => !deleting && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Archive Asset?</DialogTitle>
      <DialogContent>
        <Typography>
          Archive asset <strong>{asset?.assetTag}</strong>? It will be removed from active lists for all users and can be restored later.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={deleting}
          startIcon={deleting ? <CircularProgress size={14} /> : undefined}
        >
          {deleting ? "Archiving..." : "Archive"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
