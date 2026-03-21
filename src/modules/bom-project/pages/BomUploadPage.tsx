import { useState } from "react";
import {
  Box, Typography, Button, Stack, Stepper, Step, StepLabel,
  TextField, Alert, CircularProgress, Divider,
} from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useNavigate } from "react-router-dom";
import UploadDropzone from "../components/UploadDropzone";
import WorkbookSheetPicker from "../components/WorkbookSheetPicker";
import { parseWorkbookFile, extractRawRows } from "../services/workbookParser";
import { suggestMappings } from "../services/bomNormalizer";
import { bomApiService } from "../services/bomApiService";
import { useBomProject } from "../store/BomProjectContext";
import { downloadBomTemplate } from "../services/bomTemplateGenerator";

const STEPS = ["Upload File", "Select Sheets", "Confirm & Parse"];

export default function BomUploadPage() {
  const { dispatch } = useBomProject();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
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
      // Auto-select first sheet
      if (wb.sheets.length > 0) setSelectedSheets([wb.sheets[0].name]);
      setStep(1);
    } catch (e) {
      setError(`Failed to parse file: ${String(e)}`);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !parsedWorkbook || selectedSheets.length === 0) return;
    setParsing(true);
    setError(null);
    try {
      // Create run record on backend
      const run = await bomApiService.createRun({
        fileName: file.name,
        fileSizeBytes: file.size,
        sheetNames: parsedWorkbook.sheets.map((s) => s.name),
        selectedSheets,
        notes,
      });

      // Extract raw rows client-side
      const rawRows = await extractRawRows(file, run.id, selectedSheets);

      // Build suggested mappings from first selected sheet's headers
      const firstSheet = parsedWorkbook.sheets.find((s) => selectedSheets.includes(s.name));
      const suggested = firstSheet ? suggestMappings(firstSheet.headers) : [];

      dispatch({ type: "SET_ACTIVE_RUN", payload: run });
      dispatch({ type: "SET_PARSED_WORKBOOK", payload: parsedWorkbook });
      dispatch({ type: "SET_RAW_ROWS", payload: rawRows });
      dispatch({ type: "SET_MAPPINGS", payload: suggested });

      navigate(`/admin/bom-project/imports/${run.id}/mapping`);
    } catch (e) {
      setError(`Failed to create import: ${String(e)}`);
    } finally {
      setParsing(false);
    }
  };

  return (
    <Box maxWidth={800} mx="auto">
      <Typography variant="h5" fontWeight={700} gutterBottom>Upload BOM File</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Upload an Excel or CSV file containing your Bill of Materials.
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}
        action={
          <Button size="small" startIcon={<DownloadOutlinedIcon />} onClick={downloadBomTemplate} color="inherit">
            Download Template
          </Button>
        }
      >
        First time? Download our Excel template — it has the correct columns pre-filled with examples.
      </Alert>

      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {step === 0 && (
        <UploadDropzone onFile={handleFile} loading={parsing} />
      )}

      {step === 1 && parsedWorkbook && (
        <Box>
          <WorkbookSheetPicker
            sheets={parsedWorkbook.sheets}
            selected={selectedSheets}
            onChange={setSelectedSheets}
          />
          <Stack direction="row" justifyContent="flex-end" spacing={1} mt={2}>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button
              variant="contained"
              disabled={selectedSheets.length === 0}
              onClick={() => setStep(2)}
            >
              Next
            </Button>
          </Stack>
        </Box>
      )}

      {step === 2 && parsedWorkbook && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Confirm Import</Typography>
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" color="text.secondary">File</Typography>
              <Typography variant="body2" fontWeight={500}>{file?.name}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Selected Sheets</Typography>
              <Typography variant="body2" fontWeight={500}>{selectedSheets.join(", ")}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Total Rows</Typography>
              <Typography variant="body2" fontWeight={500}>
                {parsedWorkbook.sheets
                  .filter((s) => selectedSheets.includes(s.name))
                  .reduce((sum, s) => sum + s.rowCount, 0)}
              </Typography>
            </Box>
            <Divider />
            <TextField
              label="Notes (optional)"
              multiline
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
            />
          </Stack>
          <Stack direction="row" justifyContent="flex-end" spacing={1} mt={3}>
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={parsing}
              startIcon={parsing ? <CircularProgress size={16} /> : undefined}
            >
              {parsing ? "Creating Import…" : "Create Import & Map Columns"}
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
