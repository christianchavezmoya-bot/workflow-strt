import { ReportProblemOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { BulkWarnRow } from "./assetInstallationBulkActions";

type Props = {
  open: boolean;
  title: string;
  body: string;
  rows: BulkWarnRow[];
  onClose: () => void;
  onProceed: () => void;
};

export default function AssetInstallationBulkWarnDialog({
  open,
  title,
  body,
  rows,
  onClose,
  onProceed,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { border: "1px solid", borderColor: "warning.main" } }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, color: "warning.main" }}>
        <ReportProblemOutlined fontSize="small" />
        {title}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {body}
        </Typography>
        <Box
          sx={{
            maxHeight: 220,
            overflowY: "auto",
            borderRadius: 1,
            border: "1px solid var(--stroke)",
            bgcolor: "rgba(0,0,0,0.04)",
          }}
        >
          <Table size="small" sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, py: 0.5 }}>Asset Tag</TableCell>
                <TableCell sx={{ fontWeight: 700, py: 0.5 }}>Current state</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.assetTag}>
                  <TableCell sx={{ py: 0.5 }}>{row.assetTag}</TableCell>
                  <TableCell sx={{ py: 0.5, color: "text.secondary" }}>{row.current}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" color="warning" onClick={onProceed}>
          Understood - continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
