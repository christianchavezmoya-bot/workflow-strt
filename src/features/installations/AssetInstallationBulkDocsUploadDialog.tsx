import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import QRUploadButton from "../../components/QRUploadButton";
import { ASSET_DOCUMENT_LIMIT, BULK_DOCUMENT_TYPES } from "./assetInstallationBulkActions";

type Props = {
  open: boolean;
  saving: boolean;
  assetCount: number;
  file: File | null;
  docType: string;
  docName: string;
  result: string | null;
  onClose: () => void;
  onFileChange: (file: File | null) => void;
  onDocTypeChange: (docType: string) => void;
  onDocNameChange: (docName: string) => void;
  onQrUploaded: (documentId: string) => void;
  onUpload: () => void;
};

export default function AssetInstallationBulkDocsUploadDialog({
  open,
  saving,
  assetCount,
  file,
  docType,
  docName,
  result,
  onClose,
  onFileChange,
  onDocTypeChange,
  onDocNameChange,
  onQrUploaded,
  onUpload,
}: Props) {
  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>
        Upload document to {assetCount} asset{assetCount !== 1 ? "s" : ""}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info" sx={{ fontSize: 12 }}>
            The same file will be linked to every selected asset. Assets already at {ASSET_DOCUMENT_LIMIT}{" "}
            documents will be skipped automatically.
          </Alert>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              component="label"
              sx={{ justifyContent: "flex-start", textTransform: "none", flex: 1 }}
            >
              {file ? file.name : "Choose file..."}
              <input
                type="file"
                hidden
                accept=".pdf,.xlsx,.xls,.docx,.doc,.json,.png,.jpg,.jpeg"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
            </Button>
            <QRUploadButton
              docType={docType}
              linkedTo="bulk"
              label="Phone"
              onUploaded={async (documentId) => onQrUploaded(documentId)}
            />
          </Stack>
          <TextField
            label="Document name"
            size="small"
            fullWidth
            value={docName}
            onChange={(e) => onDocNameChange(e.target.value)}
          />
          <FormControl fullWidth size="small">
            <InputLabel shrink>Type</InputLabel>
            <Select label="Type" value={docType} onChange={(e) => onDocTypeChange(e.target.value)}>
              {BULK_DOCUMENT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {saving && <LinearProgress />}
          {result ? (
            <Alert severity={result.startsWith("Done") ? "success" : "error"} sx={{ fontSize: 12 }}>
              {result}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!file || saving} onClick={onUpload}>
          {saving ? "Uploading..." : "Upload to all"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
