import { useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  QrCodeScannerOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import type { StepInput, Workflow, WorkflowStep } from "../../types/workflow";
import type { StepCapture } from "../../types/workOrder";
import { workOrderService } from "../../services/workOrderService";

interface WorkOrderRunnerProps {
  open: boolean;
  onClose: () => void;
  workflow: Workflow;
  productId: string;
  productName: string;
  /** Links this work order execution to a specific project asset. */
  projectAssetId?: string;
  /** Called immediately after the work order is successfully saved. */
  onComplete?: () => void;
}

type Stage = "setup" | "running" | "summary";

export default function WorkOrderRunner({ open, onClose, workflow, productId, productName, projectAssetId, onComplete }: WorkOrderRunnerProps) {
  const stepsSorted = useMemo(
    () => [...workflow.steps].sort((a, b) => a.order - b.order),
    [workflow.steps]
  );

  const [stage, setStage] = useState<Stage>("setup");
  const [jobReference, setJobReference] = useState("");
  const [currentStepId, setCurrentStepId] = useState<string | null>(stepsSorted[0]?.id ?? null);
  const [history, setHistory] = useState<string[]>([]);
  // values[stepId][inputId] = string value
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [requiredWarning, setRequiredWarning] = useState(false);

  const currentStep = stepsSorted.find((s) => s.id === currentStepId) ?? null;
  const currentIndex = stepsSorted.findIndex((s) => s.id === currentStepId);
  const isLastStep = currentStep?.nextStepId === null && !currentStep?.decisionsEnabled;

  function reset() {
    setStage("setup");
    setJobReference("");
    setCurrentStepId(stepsSorted[0]?.id ?? null);
    setHistory([]);
    setValues({});
    setSaved(false);
    setSaveError(null);
    setRequiredWarning(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function startRun() {
    setStage("running");
    setCurrentStepId(stepsSorted[0]?.id ?? null);
  }

  function setInputValue(stepId: string, inputId: string, val: string) {
    setValues((prev) => ({
      ...prev,
      [stepId]: { ...(prev[stepId] ?? {}), [inputId]: val },
    }));
  }

  function getInputValue(stepId: string, inputId: string): string {
    return values[stepId]?.[inputId] ?? "";
  }

  function checkRequired(step: WorkflowStep): boolean {
    for (const inp of step.inputs ?? []) {
      if (inp.required && !getInputValue(step.id, inp.id).trim()) return false;
    }
    return true;
  }

  function goTo(targetId: string | null) {
    if (!targetId || !currentStepId) return;
    setHistory((prev) => [...prev, currentStepId]);
    setCurrentStepId(targetId);
    setRequiredWarning(false);
  }

  function goBack() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCurrentStepId(prev);
    setRequiredWarning(false);
  }

  function handleNext() {
    if (!currentStep) return;
    // Show warning but never block — technicians may not have all info on-site
    setRequiredWarning(!checkRequired(currentStep));
    if (isLastStep || !currentStep.nextStepId) {
      setStage("summary");
    } else {
      setHistory((prev) => [...prev, currentStep.id]);
      setCurrentStepId(currentStep.nextStepId);
    }
  }

  function handleDecision(targetId: string | null) {
    if (!currentStep) return;
    // Show warning but never block
    setRequiredWarning(!checkRequired(currentStep));
    if (targetId) {
      goTo(targetId);
    } else {
      setStage("summary");
    }
  }

  // Build StepCapture array from values
  function buildStepsData(): StepCapture[] {
    return stepsSorted
      .map((step) => ({
        stepId: step.id,
        values: values[step.id] ?? {},
        completedAt: new Date().toISOString(),
      }))
      .filter((sc) => Object.keys(sc.values).length > 0);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await workOrderService.create({
        workflowTemplateId: workflow.id,
        productId,
        jobReference: jobReference.trim(),
        stepsDataJson: JSON.stringify(buildStepsData()),
        projectAssetId,
      });
      setSaved(true);
      onComplete?.();
      setTimeout(() => handleClose(), 1200);
    } catch {
      setSaveError("Save failed. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------
  // Render an interactive input for execution
  // ---------------------------------------------------------------
  function renderInput(step: WorkflowStep, inp: StepInput) {
    const val = getInputValue(step.id, inp.id);
    const onChange = (v: string) => setInputValue(step.id, inp.id, v);
    const isReq = inp.required && !val.trim();

    if (inp.type === "checkbox") {
      return (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Switch
            size="small"
            checked={val === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
          />
          <Typography variant="caption">{val === "true" ? "Confirmed" : "Not confirmed"}</Typography>
        </Stack>
      );
    }
    if (inp.type === "choice") {
      const opts = inp.options ?? [];
      return (
        <ToggleButtonGroup
          value={val || null}
          exclusive
          onChange={(_, next) => { if (next !== null) onChange(next); }}
          size="small"
        >
          {opts.map((opt) => (
            <ToggleButton key={opt} value={opt}>{opt}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      );
    }
    if (inp.type === "note") {
      return (
        <TextField
          size="small"
          fullWidth
          multiline
          rows={3}
          error={isReq}
          placeholder="Enter notes…"
          value={val}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    if (inp.type === "number") {
      return (
        <TextField
          size="small"
          fullWidth
          type="number"
          error={isReq}
          value={val}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    if (inp.type === "date") {
      return (
        <TextField
          size="small"
          type="date"
          fullWidth
          error={isReq}
          value={val}
          onChange={(e) => onChange(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      );
    }
    if (inp.type === "scan") {
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Scan barcode / QR (type manually in browser)">
            <IconButton size="small"><QrCodeScannerOutlined fontSize="small" /></IconButton>
          </Tooltip>
          <TextField
            size="small"
            fullWidth
            error={isReq}
            placeholder="Scan or enter value"
            value={val}
            onChange={(e) => onChange(e.target.value)}
          />
        </Stack>
      );
    }
    if (inp.type === "component") {
      let parsed: Record<string, string> = {};
      try { parsed = JSON.parse(val || "{}"); } catch {}
      const subFields = inp.subFields ?? [];
      return (
        <Stack spacing={1}>
          {subFields.length === 0 && (
            <Typography variant="caption" color="text.secondary">No sub-fields defined.</Typography>
          )}
          {subFields.map((sf) => (
            <Stack key={sf.id} direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 140, flexShrink: 0, color: "text.secondary" }}>
                {sf.name}
              </Typography>
              <TextField
                size="small"
                fullWidth
                placeholder={sf.name}
                value={parsed[sf.id] ?? ""}
                onChange={(e) => onChange(JSON.stringify({ ...parsed, [sf.id]: e.target.value }))}
              />
            </Stack>
          ))}
        </Stack>
      );
    }
    if (inp.type === "photo" || inp.type === "video" || inp.type === "signature") {
      return (
        <Button size="small" variant="outlined" disabled>
          {inp.type === "photo" ? "📷 Capture photo" : inp.type === "video" ? "🎥 Capture video" : "✍ Capture signature"}
          &nbsp;<Typography variant="caption" color="text.secondary">(not available in browser)</Typography>
        </Button>
      );
    }
    // text / default
    return (
      <TextField
        size="small"
        fullWidth
        error={isReq}
        placeholder="Enter text"
        value={val}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // ---------------------------------------------------------------
  // Stage: setup
  // ---------------------------------------------------------------
  function renderSetup() {
    return (
      <>
        <DialogTitle>Run workflow</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">Workflow</Typography>
              <Typography variant="subtitle2">{workflow.name}</Typography>
            </Stack>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">Product</Typography>
              <Typography variant="subtitle2">{productName}</Typography>
            </Stack>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">{stepsSorted.length} step{stepsSorted.length === 1 ? "" : "s"}</Typography>
            </Stack>
            <Divider />
            <TextField
              label="Job reference (optional)"
              size="small"
              fullWidth
              placeholder="e.g. serial number, job ID, batch…"
              value={jobReference}
              onChange={(e) => setJobReference(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" onClick={startRun} disabled={stepsSorted.length === 0}>
            Start →
          </Button>
        </DialogActions>
      </>
    );
  }

  // ---------------------------------------------------------------
  // Stage: running
  // ---------------------------------------------------------------
  function renderRunning() {
    if (!currentStep) return null;
    const progress = stepsSorted.length > 0 ? ((currentIndex + 1) / stepsSorted.length) * 100 : 0;
    const hasInputs = (currentStep.inputs ?? []).length > 0;
    const hasDecisions = currentStep.decisionsEnabled && (currentStep.decisions ?? []).length > 0;
    const isLast = !hasDecisions && !currentStep.nextStepId;

    // Attached media
    const attachedMedia = (currentStep.mediaIds ?? [])
      .map((id) => workflow.media?.find((m) => m.id === id))
      .filter(Boolean) as typeof workflow.media;

    return (
      <>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={600}>
              Step {currentIndex + 1} of {stepsSorted.length}
            </Typography>
            {jobReference && <Chip label={jobReference} size="small" variant="outlined" />}
          </Stack>
          <LinearProgress variant="determinate" value={progress} sx={{ mt: 1, borderRadius: 1 }} />
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="h6" fontWeight={600}>{currentStep.title || "(Untitled step)"}</Typography>
              {currentStep.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {currentStep.description}
                </Typography>
              )}
            </Box>

            {/* Media thumbnails */}
            {attachedMedia.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {attachedMedia.map((m) => (
                  <Tooltip key={m.id} title={m.name}>
                    <Box
                      component="a"
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: 1,
                        overflow: "hidden",
                        border: "1px solid",
                        borderColor: "divider",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: "action.hover",
                        cursor: "pointer",
                        "&:hover": { borderColor: "primary.main" },
                      }}
                    >
                      {m.type === "image" ? (
                        <img src={m.url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <Typography variant="caption" color="text.secondary">🎥</Typography>
                      )}
                    </Box>
                  </Tooltip>
                ))}
              </Stack>
            )}

            {/* Inputs */}
            {hasInputs && (
              <Stack spacing={1.5}>
                {(currentStep.inputs ?? []).map((inp) => (
                  <Paper key={inp.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={1}>
                      <Typography variant="caption" color="text.secondary">
                        {inp.label || "Input"}
                        {inp.required && (
                          <Typography component="span" variant="caption" color="error" sx={{ ml: 0.5 }}>*</Typography>
                        )}
                      </Typography>
                      {renderInput(currentStep, inp)}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}

            {requiredWarning && (
              <Alert severity="warning" sx={{ fontSize: 12 }}>
                Some required fields are empty — you can still proceed and save.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 0.75, justifyContent: "space-between" }}>
          <Button onClick={goBack} disabled={history.length === 0} variant="outlined" size="small">
            ← Back
          </Button>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {hasDecisions ? (
              (currentStep.decisions ?? []).map((d) => (
                <Button
                  key={d.id}
                  variant="contained"
                  size="small"
                  onClick={() => handleDecision(d.targetStepId)}
                >
                  {d.label || "Decision"}
                </Button>
              ))
            ) : (
              <Button
                variant="contained"
                color={isLast ? "success" : "primary"}
                size="small"
                onClick={handleNext}
              >
                {isLast ? "Complete ✓" : "Next step →"}
              </Button>
            )}
          </Stack>
        </DialogActions>
      </>
    );
  }

  // ---------------------------------------------------------------
  // Stage: summary
  // ---------------------------------------------------------------
  function renderSummary() {
    const stepsData = buildStepsData();
    const totalCaptured = stepsData.reduce((acc, sc) => acc + Object.keys(sc.values).length, 0);

    return (
      <>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CheckCircleOutlined color="success" />
            <Typography variant="subtitle1" fontWeight={600}>Workflow complete</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {jobReference && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">Job reference:</Typography>
                <Chip label={jobReference} size="small" />
              </Stack>
            )}
            <Typography variant="body2" color="text.secondary">
              {stepsSorted.length} step{stepsSorted.length === 1 ? "" : "s"} completed · {totalCaptured} value{totalCaptured === 1 ? "" : "s"} captured
            </Typography>

            {stepsData.length > 0 && (
              <Stack spacing={1.5}>
                <Divider />
                <Typography variant="subtitle2">Captured data</Typography>
                {stepsData.map((sc) => {
                  const step = stepsSorted.find((s) => s.id === sc.stepId);
                  if (!step) return null;
                  return (
                    <Paper key={sc.stepId} variant="outlined" sx={{ p: 1.5 }}>
                      <Typography variant="caption" fontWeight={600} display="block" mb={0.75}>
                        {String(step.order).padStart(2, "0")} · {step.title || "(Untitled step)"}
                      </Typography>
                      <Stack spacing={0.5}>
                        {(step.inputs ?? []).map((inp) => {
                          const val = sc.values[inp.id];
                          if (!val) return null;
                          return (
                            <Stack key={inp.id} direction="row" spacing={1}>
                              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>{inp.label}:</Typography>
                              <Typography variant="caption">{val === "true" ? "✓ Yes" : val}</Typography>
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}

            {saveError && <Alert severity="error" sx={{ fontSize: 12 }}>{saveError}</Alert>}
            {saved && (
              <Alert severity="success" sx={{ fontSize: 12 }} icon={<CheckCircleOutlined fontSize="small" />}>
                Work order saved successfully.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={saving}>Discard</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || saved}
            startIcon={saving ? <CircularProgress size={14} /> : undefined}
          >
            {saving ? "Saving…" : "Save work order"}
          </Button>
        </DialogActions>
      </>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      {stage === "setup" && renderSetup()}
      {stage === "running" && renderRunning()}
      {stage === "summary" && renderSummary()}
    </Dialog>
  );
}
