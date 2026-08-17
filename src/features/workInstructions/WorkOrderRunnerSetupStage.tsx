import {
  Alert,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import type { RunIssue } from "../../types/assetWorkflowRun";
import type { Workflow } from "../../types/workflow";
import { renderAssetIdentifier, runnerBodyStackSx, runnerDialogContentSx } from "./workOrderRunnerUi";

export interface WorkOrderRunnerSetupStageProps {
  assetTag?: string;
  workflow: Workflow;
  productName: string;
  stepsCount: number;
  prefillValues?: Record<string, Record<string, string>>;
  resumingRun: boolean;
  issues: RunIssue[];
  startError: string | null;
  startingRun: boolean;
  onClose: () => void;
  onStart: () => void;
}

export default function WorkOrderRunnerSetupStage({
  assetTag,
  workflow,
  productName,
  stepsCount,
  prefillValues,
  resumingRun,
  issues,
  startError,
  startingRun,
  onClose,
  onStart,
}: WorkOrderRunnerSetupStageProps) {
  const blockingIssues = issues.filter((i) => i.isBlocking && !i.resolved);

  return (
    <>
      <DialogTitle>
        Run workflow
        {renderAssetIdentifier(assetTag)}
      </DialogTitle>
      <DialogContent sx={runnerDialogContentSx}>
        <Stack spacing={2.5} sx={runnerBodyStackSx}>
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">Workflow</Typography>
            <Typography variant="subtitle2">{workflow.name}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">Product</Typography>
            <Typography variant="subtitle2">{productName}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              {stepsCount} step{stepsCount === 1 ? "" : "s"}
            </Typography>
          </Stack>
          {prefillValues && !resumingRun && Object.keys(prefillValues).length > 0 && (
            <Alert severity="info" sx={{ fontSize: 12 }}>
              Values from the previous run have been pre-loaded. Review and update
              each step before completing.
            </Alert>
          )}
          {resumingRun && (
            <Alert severity="info" sx={{ fontSize: 12 }}>
              Continuing a previous run. Your progress will be restored.
            </Alert>
          )}
          {blockingIssues.length > 0 && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              {blockingIssues.length} unresolved blocking issue{blockingIssues.length === 1 ? "" : "s"} must be resolved before completing.
            </Alert>
          )}
          {startError && <Alert severity="error" sx={{ fontSize: 12 }}>{startError}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={onStart}
          disabled={stepsCount === 0 || startingRun}
          startIcon={startingRun ? <CircularProgress size={14} /> : undefined}
        >
          {startingRun ? "Loading..." : resumingRun ? "Continue ->" : "Start ->"}
        </Button>
      </DialogActions>
    </>
  );
}
