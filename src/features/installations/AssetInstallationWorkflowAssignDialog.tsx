import { AssignmentOutlined } from "@mui/icons-material";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { AssignFormState } from "./assetInstallationWorkflowAssign";

type Props = {
  open: boolean;
  saving: boolean;
  asset: ProjectAsset | null;
  form: AssignFormState;
  workflowConfigs: WorkflowConfig[];
  onClose: () => void;
  onConfigChange: (configId: string) => void;
  onSave: () => void;
};

export default function AssetInstallationWorkflowAssignDialog({
  open,
  saving,
  asset,
  form,
  workflowConfigs,
  onClose,
  onConfigChange,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <AssignmentOutlined fontSize="small" />
          <span>Assign Workflow - {asset?.assetTag}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl size="small" fullWidth required>
            <InputLabel shrink>Workflow Config (Published) *</InputLabel>
            <Select
              label="Workflow Config (Published) *"
              value={form.workflowConfigId}
              onChange={(e) => onConfigChange(e.target.value)}
            >
              {workflowConfigs.length === 0 && (
                <MenuItem value="" disabled>
                  No published configs match this project&apos;s workflow type
                </MenuItem>
              )}
              {workflowConfigs.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                  {c.configType ? ` - ${c.configType}` : ""}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    v{c.version}
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={saving || !form.workflowConfigId}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          {saving ? "Saving..." : "Assign"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
