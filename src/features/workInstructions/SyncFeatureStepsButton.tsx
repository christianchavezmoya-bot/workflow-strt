import { Button } from "@mui/material";
import { SyncOutlined } from "@mui/icons-material";

export interface SyncFeatureStepsButtonProps {
  visible: boolean;
  onClick: () => void;
}

/**
 * Trigger for the Sync Feature Steps action (WF-5) — a deliberately separate, named Builder
 * action from "Regenerate Workflow" (buildAutoSteps in WorkflowBuilder.tsx), which stays fully
 * untouched. This button never mutates workflow.steps itself; it only opens
 * SyncFeatureStepsDialog, which owns the actual preview/confirm/sync flow.
 *
 * A standalone component (rather than inline JSX in WorkflowBuilder.tsx) specifically so it can
 * be unit-tested in isolation — importing WorkflowBuilder.tsx itself currently fails under Vitest
 * due to a pre-existing @mui/x-date-pickers ESM resolution issue in one of its other
 * sub-components, unrelated to this change.
 */
export function SyncFeatureStepsButton({ visible, onClick }: SyncFeatureStepsButtonProps) {
  if (!visible) return null;
  return (
    <Button size="small" variant="outlined" startIcon={<SyncOutlined />} onClick={onClick}>
      Sync Feature Steps
    </Button>
  );
}

export default SyncFeatureStepsButton;
