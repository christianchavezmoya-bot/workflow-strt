import { FileDownloadOutlined } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import PdfBlobPreview from "../../components/reports/PdfBlobPreview";
import type { ProjectAsset } from "../../types/projectAsset";

type Props = {
  open: boolean;
  asset: ProjectAsset | null;
  previewLoading: boolean;
  previewError: string | null;
  previewBlob: Blob | null;
  generatingAssetId: string | null;
  onClose: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onExportDocx: () => void;
};

export default function AssetInstallationReportExportDialog({
  open,
  asset,
  previewLoading,
  previewError,
  previewBlob,
  generatingAssetId,
  onClose,
  onExportPdf,
  onExportJson,
  onExportDocx,
}: Props) {
  const generating = asset ? generatingAssetId === asset.id : false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: "92vh" } }}
    >
      <DialogTitle>View/Export Report</DialogTitle>
      <DialogContent sx={{ p: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Box sx={{ px: 3, py: 1.5, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
          <Typography variant="body2" fontWeight={600}>
            {asset ? `${asset.assetTag}${asset.assetName ? ` - ${asset.assetName}` : ""}` : "Report preview"}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, bgcolor: "#525659" }}>
          {previewLoading ? (
            <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: "100%", color: "common.white" }}>
              <CircularProgress color="inherit" />
              <Typography variant="body2">Loading PDF preview...</Typography>
            </Stack>
          ) : previewError ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{previewError}</Alert>
            </Box>
          ) : previewBlob ? (
            <PdfBlobPreview blob={previewBlob} scrollHint="Scroll to view all pages" />
          ) : (
            <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", color: "common.white" }}>
              <Typography variant="body2">No preview available.</Typography>
            </Stack>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, borderTop: "1px solid", borderColor: "divider", justifyContent: "space-between", flexWrap: "nowrap" }}>
        <Button onClick={onClose}>Close</Button>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={generating ? <CircularProgress size={14} /> : <FileDownloadOutlined fontSize="small" />}
            disabled={!asset || previewLoading || generating}
            onClick={onExportPdf}
          >
            Export PDF
          </Button>
          <Button
            variant="outlined"
            disabled={!asset || previewLoading || generating}
            onClick={onExportJson}
          >
            Export JSON
          </Button>
          <Button
            variant="contained"
            disabled={!asset || previewLoading || generating}
            onClick={onExportDocx}
          >
            Export Word
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
