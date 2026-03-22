import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { WarningAmberOutlined } from "@mui/icons-material";

interface Props {
  open: boolean;
  currentAssigneeName: string;
  projectManagerName: string;
  assetTag: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function TakeOverDialog({ open, currentAssigneeName, projectManagerName, assetTag, onConfirm, onCancel, loading }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <WarningAmberOutlined color="warning" />
        Take Over Asset
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Asset <strong>{assetTag}</strong> is currently assigned to <strong>{currentAssigneeName}</strong>.
        </Typography>
        <Typography variant="body2">
          If you proceed, it will be reassigned to you and <strong>{projectManagerName}</strong> will be notified.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={onConfirm} variant="contained" color="warning" disabled={loading}>
          {loading ? "Taking over…" : "Take Over"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
