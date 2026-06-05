import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

type DeleteConfirmDialogProps = {
  open: boolean;
  entityType: string;
  entityLabel?: string | null;
  title?: string;
  message?: string;
  confirmLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

const DeleteConfirmDialog = ({
  open,
  entityType,
  entityLabel,
  title,
  message,
  confirmLabel,
  loading = false,
  onClose,
  onConfirm
}: DeleteConfirmDialogProps) => {
  const labelPart = entityLabel?.trim() ? ` (${entityLabel.trim()})` : "";
  const displayMessage = message ?? `Delete ${entityType}${labelPart}? This operation can not be undone.`;
  const displayTitle = title ?? "Confirm Delete";
  const displayConfirm = confirmLabel ?? "Delete";

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        className: "glass-card",
        sx: {
          backgroundColor: "var(--panel)",
          border: "1px solid var(--stroke)",
          borderRadius: 2
        }
      }}
    >
      <DialogTitle>{displayTitle}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{displayMessage}</Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="contained" color="error" onClick={onConfirm} disabled={loading}>
          {loading ? `${displayConfirm}ing...` : displayConfirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfirmDialog;
