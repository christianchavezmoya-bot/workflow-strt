import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  CheckCircleOutlineOutlined,
  CodeOutlined,
  PictureAsPdfOutlined,
  UploadFileOutlined,
} from "@mui/icons-material";
import type { ProjectAsset } from "../../types/projectAsset";

export type PaperCompletionFormat = "pdf" | "json";

export type RecordPaperCompletionDialogProps = {
  open: boolean;
  asset: ProjectAsset | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: {
    file: File;
    format: PaperCompletionFormat;
    acknowledged: boolean;
    waiveCustomerSignature: boolean;
    customerSignedOnPaper: boolean;
    installerSignedOnPaper: boolean;
    notes: string;
  }) => void | Promise<void>;
};

const ACCEPT_BY_FORMAT: Record<PaperCompletionFormat, string> = {
  pdf: ".pdf,application/pdf",
  json: ".json,application/json",
};

function formatLabel(format: PaperCompletionFormat): string {
  return format === "pdf" ? "PDF" : "JSON";
}

export default function RecordPaperCompletionDialog({
  open,
  asset,
  saving,
  error,
  onClose,
  onSave,
}: RecordPaperCompletionDialogProps) {
  const [format, setFormat] = useState<PaperCompletionFormat>("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [waiveCustomerSignature, setWaiveCustomerSignature] = useState(false);
  const [customerSignedOnPaper, setCustomerSignedOnPaper] = useState(true);
  const [installerSignedOnPaper, setInstallerSignedOnPaper] = useState(true);
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const resetDraft = useCallback(() => {
    setFormat("pdf");
    setFile(null);
    setAcknowledged(false);
    setWaiveCustomerSignature(false);
    setCustomerSignedOnPaper(true);
    setInstallerSignedOnPaper(true);
    setNotes("");
    setLocalError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetDraft();
    }
  }, [open, resetDraft]);

  const assetLabel = useMemo(
    () => asset?.assetTag || asset?.assetName || asset?.id || "Selected asset",
    [asset?.assetTag, asset?.assetName, asset?.id],
  );

  const handlePickFile = (picked: File | null | undefined) => {
    setLocalError(null);
    if (!picked) return;
    const lower = picked.name.toLowerCase();
    if (format === "pdf" && !lower.endsWith(".pdf")) {
      setLocalError("Please choose a PDF file.");
      return;
    }
    if (format === "json" && !lower.endsWith(".json")) {
      setLocalError("Please choose a JSON file.");
      return;
    }
    setFile(picked);
  };

  const handleSave = async () => {
    setLocalError(null);
    if (!file) {
      setLocalError("Upload a completed workflow document before saving.");
      return;
    }
    if (!acknowledged) {
      setLocalError("Confirm that saving will close this asset workflow.");
      return;
    }
    if (!installerSignedOnPaper) {
      setLocalError("Installer sign-off on paper is required.");
      return;
    }
    if (!waiveCustomerSignature && !customerSignedOnPaper) {
      setLocalError("Confirm customer signed on paper, or waive the customer signature.");
      return;
    }
    await onSave({
      file,
      format,
      acknowledged,
      waiveCustomerSignature,
      customerSignedOnPaper,
      installerSignedOnPaper,
      notes: notes.trim(),
    });
  };

  const handleExitWithoutSaving = () => {
    resetDraft();
    onClose();
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : handleExitWithoutSaving} maxWidth="sm" fullWidth>
      <DialogTitle>Record paper completion — {assetLabel}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Alert severity="warning">
            Saving uploads the document, locks the workflow run, and marks this asset <strong>Closed</strong>.
            This is intended for hard-copy / manual completion when the phone workflow was not used.
          </Alert>

          <Tabs
            value={format}
            onChange={(_, value: PaperCompletionFormat) => {
              setFormat(value);
              setFile(null);
              setLocalError(null);
            }}
            variant="fullWidth"
          >
            <Tab icon={<PictureAsPdfOutlined fontSize="small" />} iconPosition="start" label="Upload PDF" value="pdf" />
            <Tab icon={<CodeOutlined fontSize="small" />} iconPosition="start" label="Upload JSON" value="json" />
          </Tabs>

          <Box
            sx={{
              border: "1px dashed",
              borderColor: file ? "success.main" : "divider",
              borderRadius: 2,
              p: 2,
              textAlign: "center",
              bgcolor: "rgba(255,255,255,0.02)",
            }}
          >
            <Stack spacing={1.5} alignItems="center">
              {file ? (
                <>
                  <CheckCircleOutlineOutlined color="success" />
                  <Typography variant="body2" fontWeight={600}>{file.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(file.size / 1024).toFixed(1)} KB · {formatLabel(format)}
                  </Typography>
                </>
              ) : (
                <>
                  <UploadFileOutlined color="action" />
                  <Typography variant="body2" color="text.secondary">
                    Select a signed {formatLabel(format)} completion document for this asset.
                  </Typography>
                </>
              )}
              <Stack direction="row" spacing={1}>
                <Button component="label" size="small" variant="outlined" disabled={saving}>
                  {file ? "Upload again" : "Choose file"}
                  <input
                    hidden
                    type="file"
                    accept={ACCEPT_BY_FORMAT[format]}
                    onChange={(e) => {
                      handlePickFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </Button>
                {file && (
                  <Button size="small" color="inherit" disabled={saving} onClick={() => setFile(null)}>
                    Clear
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>

          <FormControlLabel
            control={
              <Checkbox
                checked={installerSignedOnPaper}
                onChange={(e) => setInstallerSignedOnPaper(e.target.checked)}
                disabled={saving}
              />
            }
            label="Installer signed on paper"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={waiveCustomerSignature}
                onChange={(e) => {
                  setWaiveCustomerSignature(e.target.checked);
                  if (e.target.checked) setCustomerSignedOnPaper(false);
                }}
                disabled={saving}
              />
            }
            label="Waive customer signature (PM/Admin)"
          />
          {!waiveCustomerSignature && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={customerSignedOnPaper}
                  onChange={(e) => setCustomerSignedOnPaper(e.target.checked)}
                  disabled={saving}
                />
              }
              label="Customer signed on paper"
            />
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={saving}
              />
            }
            label="I understand saving will close this asset workflow and cannot be undone from the field app."
          />

          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            disabled={saving}
            placeholder="e.g. Customer requested hard copy only; signed on site."
          />

          {(localError || error) && (
            <Alert severity="error">{localError || error}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleExitWithoutSaving} disabled={saving}>
          Exit without saving
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving || !asset}>
          {saving ? "Saving..." : "Save & close asset"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
