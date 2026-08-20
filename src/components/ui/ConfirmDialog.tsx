import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

export type ConfirmSeverity = "info" | "warning" | "error";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: ConfirmSeverity;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const confirmColor = (severity: ConfirmSeverity) => {
  switch (severity) {
    case "error":
      return "error" as const;
    case "info":
      return "primary" as const;
    default:
      return "warning" as const;
  }
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  severity = "warning",
  loading = false,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
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
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={confirmColor(severity)}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? `${confirmLabel}…` : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
