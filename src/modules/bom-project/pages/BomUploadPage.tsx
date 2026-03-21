import { useState } from "react";
import {
  Box, Typography, Button, Stack,
  TextField, Alert, CircularProgress, Divider, Paper, Chip,
} from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import { useNavigate } from "react-router-dom";
import BomStepHeader from "../components/BomStepHeader";
import UploadDropzone from "../components/UploadDropzone";
import WorkbookSheetPicker from "../components/WorkbookSheetPicker";
import { parseWorkbookFile, extractRawRows } from "../services/workbookParser";
import { suggestMappings } from "../services/bomNormalizer";
import { bomApiService } from "../services/bomApiService";
import { useBomProject } from "../store/BomProjectContext";
import { downloadBomTemplate } from "../services/bomTemplateGenerator";

export default function BomUploadPage() {
  const { dispatch } = useBomProject();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [parsedWorkbook, setParsedWorkbook] = useState<Awaited<ReturnType<typeof parseWorkbookFile>> | null>(null);
  const [notes, setNotes] = useState("");

  const handleFile = async (f: File) => {
    setError(null);
    setFile(f);
    setParsing(true);
    try {
      const wb = await parseWorkbookFile(f);
      setParsedWorkbook(wb);
      if (wb.sheets.length > 0) setSelectedSheets([wb.sheets[0].name]);
    } catch (e) {
      setError(`Could not read file: ${String(e)}`);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !parsedWorkbook || selectedSheets.length === 0) return;
    setParsing(true);
    setError(null);
    try {
      const run = await bomApiService.createRun({
        fileName: file.name,
        fileSizeBytes: file.size,
        sheetNames: parsedWorkbook.sheets.map((s) => s.name),
        selectedSheets,
        notes,
      });

      const rawRows = await extractRawRows(file, run.id, selectedSheets);
      const firstSheet = parsedWorkbook.sheets.find((s) => selectedSheets.includes(s.name));
      const suggested = firstSheet ? suggestMappings(firstSheet.headers) : [];

      dispatch({ type: "SET_ACTIVE_RUN", payload: run });
      dispatch({ type: "SET_PARSED_WORKBOOK", payload: parsedWorkbook });
      dispatch({ type: "SET_RAW_ROWS", payload: rawRows });
      dispatch({ type: "SET_MAPPINGS", payload: suggested });

      navigate(`/admin/bom-project/imports/${run.id}/mapping`);
    } catch (e) {
      setError(`Failed to start import: ${String(e)}`);
    } finally {
      setParsing(false);
    }
  };

  const totalRows = parsedWorkbook?.sheets
    .filter((s) => selectedSheets.includes(s.name))
    .reduce((sum, s) => sum + s.rowCount, 0) ?? 0;

  return (
    <Box maxWidth={680} mx="auto">
      <BomStepHeader
        activeStep={0}
        title="Upload your BOM file"
        subtitle="Excel (.xlsx) or CSV files are supported."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Template reminder */}
      {!file && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          action={
            <Button size="small" startIcon={<DownloadOutlinedIcon />} onClick={downloadBomTemplate} color="inherit">
              Download
            </Button>
          }
        >
          First time? Use our Excel template — columns are already set up correctly.
        </Alert>
      )}

      {/* Upload zone */}
      {!parsedWorkbook && (
        <UploadDropzone onFile={handleFile} loading={parsing} />
      )}

      {/* File selected — sheet picker + confirm */}
      {parsedWorkbook && file && (
        <Stack spacing={2.5}>
          {/* File summary */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <InsertDriveFileOutlinedIcon color="primary" />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={600}>{file.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {(file.size / 1024).toFixed(1)} KB · {parsedWorkbook.sheets.length} sheet{parsedWorkbook.sheets.length !== 1 ? "s" : ""}
                </Typography>
              </Box>
              <Button size="small" onClick={() => { setFile(null); setParsedWorkbook(null); setSelectedSheets([]); }}>
                Change
              </Button>
            </Stack>
          </Paper>

          {/* Sheet selector — only show if multiple sheets */}
          {parsedWorkbook.sheets.length > 1 && (
            <Box>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Which sheets contain your BOM data?
              </Typography>
              <WorkbookSheetPicker
                sheets={parsedWorkbook.sheets}
                selected={selectedSheets}
                onChange={setSelectedSheets}
              />
            </Box>
          )}

          {/* Row count summary */}
          {totalRows > 0 && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={`${totalRows} rows detected`} size="small" color="primary" variant="outlined" />
              {selectedSheets.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  from sheet{selectedSheets.length > 1 ? "s" : ""}: {selectedSheets.join(", ")}
                </Typography>
              )}
            </Stack>
          )}

          <Divider />

          <TextField
            label="Notes (optional)"
            multiline
            rows={2}
            size="small"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            placeholder="e.g. Project name, revision number…"
          />

          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button onClick={() => navigate("/admin/bom-project")}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={parsing || selectedSheets.length === 0}
              startIcon={parsing ? <CircularProgress size={16} /> : undefined}
            >
              {parsing ? "Processing…" : "Next: Map Columns →"}
            </Button>
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
