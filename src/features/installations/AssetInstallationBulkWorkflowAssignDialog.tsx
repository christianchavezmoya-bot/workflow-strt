import {
  Alert,
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
} from "@mui/material";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import { workflowTypeMismatchMessage } from "./assetInstallationPageLogic";

type Props = {
  open: boolean;
  saving: boolean;
  assetCount: number;
  workflowTypes: WorkflowType[];
  filteredConfigs: WorkflowConfig[];
  latestPublishedConfigs: WorkflowConfig[];
  workflowTypeId: string;
  workflowConfigId: string;
  onClose: () => void;
  onWorkflowTypeChange: (typeId: string) => void;
  onWorkflowConfigChange: (configId: string) => void;
  onApply: () => void;
};

export default function AssetInstallationBulkWorkflowAssignDialog({
  open,
  saving,
  assetCount,
  workflowTypes,
  filteredConfigs,
  latestPublishedConfigs,
  workflowTypeId,
  workflowConfigId,
  onClose,
  onWorkflowTypeChange,
  onWorkflowConfigChange,
  onApply,
}: Props) {
  const selectedType = workflowTypes.find((type) => type.id === workflowTypeId);
  const selectedConfig = latestPublishedConfigs.find((config) => config.id === workflowConfigId);
  const mismatchMessage =
    workflowTypeId && workflowConfigId
      ? workflowTypeMismatchMessage(selectedType?.name, selectedConfig?.configType)
      : null;

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>
        Assign workflow to {assetCount} asset{assetCount !== 1 ? "s" : ""}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel shrink>Workflow type</InputLabel>
            <Select
              label="Workflow type"
              value={workflowTypeId}
              onChange={(e) => onWorkflowTypeChange(e.target.value)}
            >
              {workflowTypes.map((wt) => (
                <MenuItem key={wt.id} value={wt.id}>
                  {wt.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel shrink>Workflow config</InputLabel>
            <Select
              label="Workflow config"
              value={workflowConfigId}
              onChange={(e) => onWorkflowConfigChange(e.target.value)}
            >
              {filteredConfigs.map((wc) => (
                <MenuItem key={wc.id} value={wc.id}>
                  {wc.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {mismatchMessage ? (
            <Alert severity="warning" sx={{ fontSize: "0.8rem" }}>
              {mismatchMessage}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={saving || !workflowTypeId || !workflowConfigId}
          onClick={onApply}
        >
          {saving ? "Saving..." : "Apply"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
