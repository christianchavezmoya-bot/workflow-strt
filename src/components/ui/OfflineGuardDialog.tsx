/**
 * OfflineGuardDialog — Dialog to show when a sensitive action is blocked due to being offline.
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from "@mui/material";
import { WifiOff, Warning } from "@mui/icons-material";

interface Props {
  open: boolean;
  message: string | null;
  onClose: () => void;
}

const OfflineGuardDialog = ({ open, message, onClose }: Props) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <WifiOff color="warning" />
        <Typography variant="h6" component="span">
          No Internet Connection
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 2 }}>
          <Warning sx={{ fontSize: 48, color: "warning.main", mb: 2 }} />
          <Typography variant="body1" textAlign="center" color="text.secondary">
            {message || "This action requires an internet connection. Please connect to a network and try again."}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={onClose} fullWidth>
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OfflineGuardDialog;