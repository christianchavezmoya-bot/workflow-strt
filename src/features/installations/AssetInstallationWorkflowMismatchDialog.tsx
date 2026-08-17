import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

type Props = {
  message: string | null | undefined;
  onClose: () => void;
  onConfirm: () => void;
};

export default function AssetInstallationWorkflowMismatchDialog({
  message,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={Boolean(message)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Workflow type mismatch</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 1.5 }}>{message}</Alert>
        <Typography variant="body2">
          You can still start the workflow, but check that this is intentional.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={onConfirm}>
          Start anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}
