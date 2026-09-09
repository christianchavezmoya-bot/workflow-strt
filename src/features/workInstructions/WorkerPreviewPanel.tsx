import { useState } from "react";
import {
  Alert,
  Button,
  Chip,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  EditOutlined,
  ImageOutlined,
  PersonOutlined,
  QrCodeScannerOutlined,
  VideocamOutlined,
} from "@mui/icons-material";
import type { StepInput, Workflow, WorkflowStep } from "../../types/workflow";
import WheelPicker from "../../components/ui/WheelPicker";
import { ReferenceContentSection, resolveAttachedMedia } from "./ReferenceContent";

function InputPreview({ inp }: { inp: StepInput }) {
  if (inp.type === "text") return <TextField size="small" fullWidth disabled placeholder="Enter text" />;
  if (inp.type === "number") return <TextField size="small" fullWidth disabled type="number" placeholder="Enter a number" />;
  if (inp.type === "note") return <TextField size="small" fullWidth disabled multiline rows={2} placeholder="Enter notes" />;
  if (inp.type === "scan") return (
    <Stack direction="row" spacing={1} alignItems="center">
      <QrCodeScannerOutlined fontSize="small" color="action" />
      <TextField size="small" fullWidth disabled placeholder="Scan or enter value" />
    </Stack>
  );
  if (inp.type === "date") return <TextField size="small" fullWidth disabled type="date" InputLabelProps={{ shrink: true }} />;
  if (inp.type === "checkbox") {
    return (
      <Stack direction="row" alignItems="center" spacing={1}>
        <Switch size="small" disabled />
        <Typography variant="caption">Unchecked</Typography>
      </Stack>
    );
  }
  if (inp.type === "choice") {
    return (
      <Stack direction="row" flexWrap="wrap" gap={0.5} useFlexGap>
        {(inp.options || []).length === 0 ? (
          <Typography variant="caption" color="text.secondary">No options set</Typography>
        ) : (
          inp.options!.map((opt, idx) => <Chip key={idx} label={opt} size="small" variant="outlined" />)
        )}
      </Stack>
    );
  }
  if (inp.type === "dropdown") {
    const opts = inp.options ?? [];
    return (
      <FormControl size="small" fullWidth disabled>
        <Select value={opts[0] ?? ""} displayEmpty>
          {opts.length === 0 ? (
            <MenuItem value="" disabled>No options set</MenuItem>
          ) : (
            opts.map((opt, idx) => <MenuItem key={idx} value={opt}>{opt}</MenuItem>)
          )}
        </Select>
      </FormControl>
    );
  }
  if (inp.type === "wheel") {
    const opts = inp.options ?? [];
    if (opts.length === 0) {
      return <Typography variant="caption" color="text.secondary">No options set</Typography>;
    }
    return <WheelPicker options={opts} value={opts[Math.min(1, opts.length - 1)] ?? opts[0]} onChange={() => {}} />;
  }
  if (inp.type === "photo") return <Button disabled size="small" startIcon={<ImageOutlined />}>Capture photo</Button>;
  if (inp.type === "video") return <Button disabled size="small" startIcon={<VideocamOutlined />}>Capture video</Button>;
  if (inp.type === "signature") return <Button disabled size="small" startIcon={<EditOutlined />}>Capture signature</Button>;
  if (inp.type === "user-select") return (
    <Stack direction="row" spacing={1} alignItems="center">
      <PersonOutlined fontSize="small" color="action" />
      <Typography variant="caption" color="text.secondary">Select from project team</Typography>
    </Stack>
  );
  return <Typography variant="caption" color="text.secondary">Unsupported input type</Typography>;
}

export function WorkerPreviewPanel({
  workflow,
  stepsSorted,
  selectedStepId,
  onSelectStep,
}: {
  workflow: Workflow;
  stepsSorted: WorkflowStep[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
}) {
  const [history, setHistory] = useState<string[]>([]);
  const currentStepId = selectedStepId && workflow.steps.some((s) => s.id === selectedStepId)
    ? selectedStepId
    : (stepsSorted[0]?.id || null);
  const step = stepsSorted.find((s) => s.id === currentStepId) || null;
  const stepReferenceMedia = resolveAttachedMedia(step?.mediaIds, workflow.media);

  function goTo(stepId: string | null) {
    if (!stepId) return;
    setHistory((prev) => (currentStepId ? [...prev, currentStepId] : prev));
    onSelectStep(stepId);
  }

  function goBack() {
    setHistory((prev) => {
      if (!prev.length) return prev;
      onSelectStep(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }

  return (
    <Paper className="glass-card" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={600}>
            Worker Preview
          </Typography>
          <Chip label="Simulation" size="small" />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Simulated technician view. Navigate with the buttons below.
        </Typography>

        {!step ? (
          <Alert severity="info" sx={{ fontSize: 12 }}>
            No steps available. Add a step to begin.
          </Alert>
        ) : (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Typography variant="subtitle2">
                  {String(step.order).padStart(2, "0")} · {step.title || "(Untitled step)"}
                </Typography>
                {step.decisionsEnabled && <Chip label="Branching" size="small" color="primary" />}
              </Stack>
              {step.description && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {step.description}
                </Typography>
              )}
            </Paper>

            {stepReferenceMedia.length > 0 && (
              <Stack spacing={1}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  Reference Content
                </Typography>
                <ReferenceContentSection media={stepReferenceMedia} />
              </Stack>
            )}

            {(step.inputs || []).length > 0 && (
              <Stack spacing={1}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  Inputs
                </Typography>
                {step.inputs.map((inp) => (
                  <Paper key={inp.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
                      <Typography variant="caption" color="text.secondary">
                        {inp.label || "Input"}
                        {inp.required && (
                          <Typography component="span" variant="caption" color="error" sx={{ ml: 0.5 }}>
                            *
                          </Typography>
                        )}
                      </Typography>
                      <Chip label={inp.type.toUpperCase()} size="small" variant="outlined" />
                    </Stack>
                    <InputPreview inp={inp} />
                  </Paper>
                ))}
              </Stack>
            )}

            {step.decisionsEnabled && (step.decisions || []).length > 0 && (
              <Stack spacing={1}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  Decision buttons
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
                  {step.decisions.map((d) => (
                    <Button
                      key={d.id}
                      variant="contained"
                      size="small"
                      disabled={!d.targetStepId}
                      onClick={() => goTo(d.targetStepId)}
                    >
                      {d.label || "Decision"}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            )}

            <Stack direction="row" spacing={1} flexWrap="wrap" gap={0.5} useFlexGap>
              <Button variant="outlined" size="small" onClick={goBack} disabled={history.length === 0}>
                Back
              </Button>
              <Button
                variant="contained"
                size="small"
                color="success"
                onClick={() => goTo(step.nextStepId)}
                disabled={!step.nextStepId}
              >
                Next step
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setHistory([]);
                  onSelectStep(stepsSorted[0]?.id || null);
                }}
              >
                Start over
              </Button>
            </Stack>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
