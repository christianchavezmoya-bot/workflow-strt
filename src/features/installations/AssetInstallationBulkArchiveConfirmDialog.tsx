import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

type Props = {
  open: boolean;
  selectedCount: number;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function AssetInstallationBulkArchiveConfirmDialog({
  open,
  selectedCount,
  deleting,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onClose={() => !deleting && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Archive {selectedCount} Asset{selectedCount !== 1 ? "s" : ""}?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" gutterBottom>
          You are about to archive <strong>{selectedCount}</strong> asset{selectedCount !== 1 ? "s" : ""}. They will be removed from active lists for all users and can be restored later.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Associated workflow runs, issues, and documents will be hidden with the asset.
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
          {deleting ? "Archiving..." : `Archive ${selectedCount}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
