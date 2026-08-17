import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";

export type AssetExportColumnOption = {
  id: string;
  label: string;
};

type Props = {
  open: boolean;
  running: boolean;
  rowCount: number;
  format: "pdf" | "json" | "excel";
  includeProjectMeta: boolean;
  includeBusinessLogo: boolean;
  includeCustomerLogo: boolean;
  customerLogoAvailable: boolean;
  columnOptions: AssetExportColumnOption[];
  selectedColumnIds: string[];
  onClose: () => void;
  onExport: () => void;
  onFormatChange: (format: "pdf" | "json" | "excel") => void;
  onIncludeProjectMetaChange: (checked: boolean) => void;
  onIncludeBusinessLogoChange: (checked: boolean) => void;
  onIncludeCustomerLogoChange: (checked: boolean) => void;
  onSelectedColumnIdsChange: (ids: string[]) => void;
};

export default function AssetInstallationExportDialog({
  open,
  running,
  rowCount,
  format,
  includeProjectMeta,
  includeBusinessLogo,
  includeCustomerLogo,
  customerLogoAvailable,
  columnOptions,
  selectedColumnIds,
  onClose,
  onExport,
  onFormatChange,
  onIncludeProjectMetaChange,
  onIncludeBusinessLogoChange,
  onIncludeCustomerLogoChange,
  onSelectedColumnIdsChange,
}: Props) {
  return (
    <Dialog open={open} onClose={() => !running && onClose()} maxWidth="md" fullWidth>
      <DialogTitle>Export Assets</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            Export uses the current filtered operations view: {rowCount} row(s)
          </Alert>

          <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
            <FormControl sx={{ minWidth: 220 }}>
              <FormLabel>Format</FormLabel>
              <RadioGroup value={format} onChange={(event) => onFormatChange(event.target.value as "pdf" | "json" | "excel")}>
                <FormControlLabel value="pdf" control={<Radio />} label="PDF" />
                <FormControlLabel value="excel" control={<Radio />} label="Excel (.xlsx)" />
                <FormControlLabel value="json" control={<Radio />} label="JSON" />
              </RadioGroup>
            </FormControl>

            <FormControl sx={{ minWidth: 260 }}>
              <FormLabel>Report options</FormLabel>
              <FormGroup>
                <FormControlLabel
                  control={<Checkbox checked={includeProjectMeta} onChange={(event) => onIncludeProjectMetaChange(event.target.checked)} />}
                  label="Include project/customer metadata"
                />
                <FormControlLabel
                  control={<Checkbox checked={includeBusinessLogo} onChange={(event) => onIncludeBusinessLogoChange(event.target.checked)} />}
                  label="Include business logo"
                />
                <FormControlLabel
                  control={<Checkbox checked={includeCustomerLogo} onChange={(event) => onIncludeCustomerLogoChange(event.target.checked)} disabled={!customerLogoAvailable} />}
                  label="Include customer logo"
                />
              </FormGroup>
              {!customerLogoAvailable && (
                <Typography variant="caption" color="text.secondary">
                  Customer logo is available only when the export resolves to one project/customer.
                </Typography>
              )}
              {format === "excel" && (
                <Typography variant="caption" color="text.secondary">
                  Excel export uses a real `.xlsx` workbook with project metadata, adjusted column widths, and no logo images.
                </Typography>
              )}
            </FormControl>
          </Stack>

          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} mb={1}>
              <Typography variant="subtitle2">Columns</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => onSelectedColumnIdsChange(columnOptions.map((column) => column.id))}>Select all</Button>
                <Button size="small" onClick={() => onSelectedColumnIdsChange([])}>Clear</Button>
              </Stack>
            </Stack>
            <Box sx={{ maxHeight: 320, overflowY: "auto", pr: 1 }}>
              <FormGroup>
                {columnOptions.map((column) => (
                  <FormControlLabel
                    key={column.id}
                    control={
                      <Checkbox
                        checked={selectedColumnIds.includes(column.id)}
                        onChange={(event) => {
                          onSelectedColumnIdsChange(
                            event.target.checked
                              ? [...selectedColumnIds, column.id]
                              : selectedColumnIds.filter((id) => id !== column.id),
                          );
                        }}
                      />
                    }
                    label={column.label}
                  />
                ))}
              </FormGroup>
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={running}>Close</Button>
        <Button variant="contained" onClick={onExport} disabled={running || selectedColumnIds.length === 0}>
          {running ? "Exporting..." : `Export ${format.toUpperCase()}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
