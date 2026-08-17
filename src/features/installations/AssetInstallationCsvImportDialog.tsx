import { FileUploadOutlined } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  countCsvRowsWithAssetTag,
  csvRowPreview,
  parseAssetInstallationCsv,
  type AssetInstallationCsvRow,
} from "./assetInstallationCsvImport";

type Props = {
  open: boolean;
  importing: boolean;
  rows: AssetInstallationCsvRow[];
  onClose: () => void;
  onRowsChange: (rows: AssetInstallationCsvRow[]) => void;
  onImport: () => void;
};

export default function AssetInstallationCsvImportDialog({
  open,
  importing,
  rows,
  onClose,
  onRowsChange,
  onImport,
}: Props) {
  const validCount = countCsvRowsWithAssetTag(rows);
  const skippedCount = rows.length - validCount;

  async function handleFile(file: File) {
    const text = await file.text();
    onRowsChange(parseAssetInstallationCsv(text));
  }

  return (
    <Dialog open={open} onClose={() => !importing && onClose()} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <FileUploadOutlined fontSize="small" />
            <span>Import Assets from CSV</span>
          </Stack>
          <Tooltip
            title={
              <Box sx={{ fontSize: 12 }}>
                <strong>Expected columns:</strong>
                <br />
                Asset Tag* (required)
                <br />
                Asset Name
                <br />
                Config Type (matched to published configs)
                <br />
                Serial # / Serial Number
                <br />
                Model / Asset Model
                <br />
                Manufacturer
              </Box>
            }
          >
            <IconButton size="small" sx={{ opacity: 0.6 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>i</Typography>
            </IconButton>
          </Tooltip>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {rows.length === 0 ? (
            <Box
              sx={{
                border: "2px dashed",
                borderColor: "divider",
                borderRadius: 2,
                p: 4,
                textAlign: "center",
                cursor: "pointer",
                "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
              }}
              onClick={() => document.getElementById("csv-upload-input")?.click()}
            >
              <FileUploadOutlined sx={{ fontSize: 40, opacity: 0.4, mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Click to upload a CSV file
              </Typography>
              <Typography variant="caption" color="text.disabled">
                or drag and drop
              </Typography>
              <input
                id="csv-upload-input"
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
            </Box>
          ) : (
            <>
              <Alert severity="info" sx={{ fontSize: 12 }}>
                {validCount} valid rows found.
                {skippedCount > 0 && ` ${skippedCount} rows skipped (missing asset tag).`}
              </Alert>
              <Box sx={{ maxHeight: 320, overflow: "auto" }}>
                <Table size="small" sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <Typography variant="caption" fontWeight={700}>
                          Asset Tag
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontWeight={700}>
                          Asset Name
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontWeight={700}>
                          Config Type
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontWeight={700}>
                          Serial #
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontWeight={700}>
                          Model
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row, index) => {
                      const preview = csvRowPreview(row);
                      return (
                        <TableRow key={index} sx={{ opacity: preview.valid ? 1 : 0.4 }}>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  bgcolor: preview.valid ? "success.main" : "error.main",
                                  flexShrink: 0,
                                }}
                              />
                              <Typography variant="body2">{preview.assetTag || "(missing)"}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{preview.assetName}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{preview.configType}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{preview.serialNumber}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{preview.model}</Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
              <Button
                size="small"
                variant="text"
                onClick={() => onRowsChange([])}
                sx={{ alignSelf: "flex-start", fontSize: 12 }}
              >
                Clear / upload different file
              </Button>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={importing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onImport}
          disabled={importing || validCount === 0}
          startIcon={importing ? <CircularProgress size={14} /> : <FileUploadOutlined />}
        >
          {importing
            ? "Importing..."
            : `Import ${validCount} asset${validCount !== 1 ? "s" : ""}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
