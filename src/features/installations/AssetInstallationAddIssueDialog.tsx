import { ReportProblemOutlined } from "@mui/icons-material";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import MediaCapture from "../../components/ui/MediaCapture";
import type { ProjectAsset } from "../../types/projectAsset";

export type AssetInstallationIssueForm = {
  description: string;
  severity: "low" | "medium" | "high";
};

type Props = {
  open: boolean;
  asset: ProjectAsset | null;
  form: AssetInstallationIssueForm;
  media: string[];
  onClose: () => void;
  onFormChange: (form: AssetInstallationIssueForm) => void;
  onMediaChange: (media: string[]) => void;
  onSubmit: () => void;
};

export default function AssetInstallationAddIssueDialog({
  open,
  asset,
  form,
  media,
  onClose,
  onFormChange,
  onMediaChange,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ReportProblemOutlined color="error" fontSize="small" />
          <span>Add Issue - {asset?.assetTag}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Description"
            size="small"
            fullWidth
            multiline
            rows={3}
            value={form.description}
            onChange={(e) => onFormChange({ ...form, description: e.target.value })}
            placeholder="Describe the issue..."
            InputLabelProps={{ shrink: true }}
          />
          <FormControl size="small" fullWidth>
            <InputLabel shrink>Severity</InputLabel>
            <Select
              label="Severity"
              value={form.severity}
              onChange={(e) => onFormChange({ ...form, severity: e.target.value as AssetInstallationIssueForm["severity"] })}
            >
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </Select>
          </FormControl>
          <MediaCapture
            media={media}
            onChange={onMediaChange}
            label="Attach Photo / Video (optional)"
            qrDocType="issue-photo"
            qrLinkedTo={asset?.id ?? ""}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onSubmit} disabled={!form.description.trim()}>
          Add issue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
