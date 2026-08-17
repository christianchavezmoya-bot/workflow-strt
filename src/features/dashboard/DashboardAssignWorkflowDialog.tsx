import { PlayArrowOutlined } from "@mui/icons-material";
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
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import { resolveConfigWorkflowTypeId } from "../installations/assetInstallationPageLogic";
import { workflowModeLabel } from "./dashboardPageLogic";

type AssignForm = {
  workflowConfigId: string;
  workflowTypeId: string;
};

type Props = {
  open: boolean;
  saving: boolean;
  assetLabel?: string;
  workflowMode?: string | null;
  workflowConfigs: WorkflowConfig[];
  workflowTypes: WorkflowType[];
  assignForm: AssignForm;
  onAssignFormChange: (form: AssignForm) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function DashboardAssignWorkflowDialog({
  open,
  saving,
  assetLabel,
  workflowMode,
  workflowConfigs,
  workflowTypes,
  assignForm,
  onAssignFormChange,
  onClose,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PlayArrowOutlined fontSize="small" />
          <span>Assign Workflow - {assetLabel}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Workflow Type: <strong>{workflowModeLabel(workflowMode)}</strong> (set by the project)
          </Typography>
          <FormControl size="small" fullWidth required>
            <InputLabel shrink>Workflow Config (Published) *</InputLabel>
            <Select
              label="Workflow Config (Published) *"
              value={assignForm.workflowConfigId}
              onChange={(event) => {
                const config = workflowConfigs.find((item) => item.id === event.target.value);
                onAssignFormChange({
                  workflowConfigId: event.target.value,
                  workflowTypeId: config ? resolveConfigWorkflowTypeId(config, workflowTypes) : "",
                });
              }}
            >
              {workflowConfigs.length === 0 && (
                <MenuItem value="" disabled>
                  No published configs available for this product
                </MenuItem>
              )}
              {workflowConfigs.map((config) => (
                <MenuItem key={config.id} value={config.id}>
                  {config.name}
                  {config.configType ? ` - ${config.configType}` : ""}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    v{config.version}
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
          disabled={!assignForm.workflowConfigId || saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {saving ? "Saving..." : "Assign"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
