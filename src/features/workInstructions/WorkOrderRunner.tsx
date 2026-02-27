import { useEffect, useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  LockOutlined,
  QrCodeScannerOutlined,
  ReportProblemOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import type { StepInput, Workflow, WorkflowStep } from "../../types/workflow";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import type { RunIssue } from "../../types/assetWorkflowRun";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StepCapture {
  stepId: string;
  values: Record<string, string>;
  completedAt: string;
}

interface WorkOrderRunnerProps {
  open: boolean;
  onClose: () => void;
  workflow: Workflow;
  productId: string;
  productName: string;
  /** Links this run to a specific project asset. Required for real run tracking. */
  projectAssetId?: string;
  /** The WorkflowConfig id — used to call startRun() if no runId. */
  workflowConfigId?: string;
  /** Provide to continue an existing run (skips startRun call). */
  existingRunId?: string;
  /** Called after run is locked. */
  onComplete?: (capturedFeatureValues: Record<string, string>) => void;
}

type Stage = "setup" | "running" | "summary";

export default function WorkOrderRunner({
  open,
  onClose,
  workflow,
  productId,
  productName,
  projectAssetId,
  workflowConfigId,
  existingRunId,
  onComplete,
}: WorkOrderRunnerProps) {
  const stepsSorted = useMemo(
    () => [...workflow.steps].sort((a, b) => a.order - b.order),
    [workflow.steps],
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

  // Issue tracking
  const [issues, setIssues] = useState<RunIssue[]>([]);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagDescription, setFlagDescription] = useState("");
  const [flagSeverity, setFlagSeverity] = useState<"low" | "medium" | "high">("medium");
  const [flagIssueType, setFlagIssueType] = useState<"blocking" | "observation">("observation");
  const [flagSubmitted, setFlagSubmitted] = useState(false);

  // Run tracking
  const [activeRunId, setActiveRunId] = useState<string | null>(existingRunId ?? null);
  const [startingRun, setStartingRun] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [blockingError, setBlockingError] = useState<string | null>(null);

  const isRealRun = Boolean(projectAssetId && workflowConfigId);

  const currentStep = stepsSorted.find((s) => s.id === currentStepId) ?? null;
  const currentIndex = stepsSorted.findIndex((s) => s.id === currentStepId);
  const isLastStep = currentStep?.nextStepId === null && !currentStep?.decisionsEnabled;

  useEffect(() => {
    if (open && existingRunId) setActiveRunId(existingRunId);
    if (!open) reset();
  }, [open, existingRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setStage("setup");
    setJobReference("");
    setCurrentStepId(stepsSorted[0]?.id ?? null);
    setHistory([]);
    setValues({});
    setSaved(false);
    setSaveError(null);
    setBlockingError(null);
    setRequiredWarning(false);
    setFlagOpen(false);
    setFlagDescription("");
    setFlagSeverity("medium");
    setFlagIssueType("observation");
    setFlagSubmitted(false);
    setIssues([]);
    setActiveRunId(existingRunId ?? null);
  }

  function submitFlag() {
    if (!flagDescription.trim()) return;
    const issue: RunIssue = {
      id: crypto.randomUUID ? crypto.randomUUID() : `issue_${Date.now()}`,
      description: flagDescription.trim(),
      issueType: flagIssueType,
      isBlocking: flagIssueType === "blocking",
      severity: flagSeverity,
      stepId: currentStep?.id,
      stepTitle: currentStep?.title,
      reportedAt: new Date().toISOString(),
      resolved: false,
    };
    setIssues((prev) => [...prev, issue]);
    setFlagDescription("");
    setFlagSeverity("medium");
    setFlagIssueType("observation");
    setFlagOpen(false);
    setFlagSubmitted(true);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function startRun() {
    setCurrentStepId(stepsSorted[0]?.id ?? null);

    if (isRealRun && !activeRunId) {
      setStartingRun(true);
      setStartError(null);
      try {
        const run = await assetWorkflowRunService.startRun(projectAssetId!, workflowConfigId!);
        setActiveRunId(run.id);
        // Load existing progress if continuing
        if (run.stepResultsJson && run.stepResultsJson !== "[]") {
          try {
            const prev = JSON.parse(run.stepResultsJson) as StepCapture[];
            const prevValues: Record<string, Record<string, string>> = {};
            for (const sc of prev) prevValues[sc.stepId] = sc.values;
            setValues(prevValues);
          } catch {}
        }
        if (run.issuesJson && run.issuesJson !== "[]") {
          try { setIssues(JSON.parse(run.issuesJson) as RunIssue[]); } catch {}
        }
      } catch {
        setStartError("Could not start run. Check your connection and try again.");
        setStartingRun(false);
        return;
      } finally {
        setStartingRun(false);
      }
    }

    setStage("running");
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
    autosaveProgress();
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
    setRequiredWarning(!checkRequired(currentStep));
    if (isLastStep || !currentStep.nextStepId) {
      autosaveProgress();
      setStage("summary");
    } else {
      setHistory((prev) => [...prev, currentStep.id]);
      setCurrentStepId(currentStep.nextStepId);
      autosaveProgress();
    }
  }

  function handleDecision(targetId: string | null) {
    if (!currentStep) return;
    setRequiredWarning(!checkRequired(currentStep));
    autosaveProgress();
    if (targetId) {
      goTo(targetId);
    } else {
      setStage("summary");
    }
  }

  function buildStepsData(): StepCapture[] {
    return stepsSorted
      .map((step) => ({
        stepId: step.id,
        values: values[step.id] ?? {},
        completedAt: new Date().toISOString(),
      }))
      .filter((sc) => Object.keys(sc.values).length > 0);
  }

  function extractFeatureValues(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const step of stepsSorted) {
      for (const inp of step.inputs ?? []) {
        if (inp.featureId) {
          const val = values[step.id]?.[inp.id];
          if (val !== undefined && val !== "") result[inp.featureId] = val;
        }
      }
    }
    return result;
  }

  async function autosaveProgress() {
    if (!activeRunId) return;
    try {
      await assetWorkflowRunService.saveProgress(
        activeRunId,
        JSON.stringify(buildStepsData()),
        JSON.stringify(issues),
      );
    } catch {
      // silent — not critical
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setBlockingError(null);
    try {
      const stepsJson = JSON.stringify(buildStepsData());
      const issuesJson = JSON.stringify(issues);

      if (activeRunId) {
        await assetWorkflowRunService.completeRun(activeRunId, stepsJson, issuesJson);
      }
      // Note: if no activeRunId (preview mode), we still show summary without persisting

      setSaved(true);
      onComplete?.(extractFeatureValues());
      setTimeout(() => handleClose(), 1500);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string; blockingCount?: number } } };
      if (axiosErr?.response?.status === 422) {
        const msg = axiosErr.response?.data?.message ?? "Cannot complete — unresolved blocking issues must be resolved first.";
        setBlockingError(msg);
      } else {
        setSaveError("Save failed. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------
  // Render input
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
        <TextField size="small" fullWidth multiline rows={3} error={isReq}
          placeholder="Enter notes…" value={val} onChange={(e) => onChange(e.target.value)} />
      );
    }
    if (inp.type === "number") {
      return (
        <TextField size="small" fullWidth type="number" error={isReq}
          value={val} onChange={(e) => onChange(e.target.value)} />
      );
    }
    if (inp.type === "date") {
      return (
        <TextField size="small" type="date" fullWidth error={isReq}
          value={val} onChange={(e) => onChange(e.target.value)} InputLabelProps={{ shrink: true }} />
      );
    }
    if (inp.type === "scan") {
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Scan barcode / QR (type manually in browser)">
            <IconButton size="small"><QrCodeScannerOutlined fontSize="small" /></IconButton>
          </Tooltip>
          <TextField size="small" fullWidth error={isReq} placeholder="Scan or enter value"
            value={val} onChange={(e) => onChange(e.target.value)} />
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
              <TextField size="small" fullWidth placeholder={sf.name}
                value={parsed[sf.id] ?? ""}
                onChange={(e) => onChange(JSON.stringify({ ...parsed, [sf.id]: e.target.value }))} />
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
    return (
      <TextField size="small" fullWidth error={isReq} placeholder="Enter text"
        value={val} onChange={(e) => onChange(e.target.value)} />
    );
  }

  // ---------------------------------------------------------------
  // Stage: setup
  // ---------------------------------------------------------------
  function renderSetup() {
    const blockingIssues = issues.filter((i) => i.isBlocking && !i.resolved);
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
            {existingRunId && (
              <Alert severity="info" sx={{ fontSize: 12 }}>
                Continuing a previous run. Your progress has been preserved.
              </Alert>
            )}
            {blockingIssues.length > 0 && (
              <Alert severity="error" sx={{ fontSize: 12 }}>
                {blockingIssues.length} unresolved blocking issue{blockingIssues.length === 1 ? "" : "s"} must be resolved before completing.
              </Alert>
            )}
            <Divider />
            <TextField
              label="Job reference (optional)"
              size="small"
              fullWidth
              placeholder="e.g. serial number, job ID, batch…"
              value={jobReference}
              onChange={(e) => setJobReference(e.target.value)}
            />
            {startError && <Alert severity="error" sx={{ fontSize: 12 }}>{startError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={startRun}
            disabled={stepsSorted.length === 0 || startingRun}
            startIcon={startingRun ? <CircularProgress size={14} /> : undefined}
          >
            {startingRun ? "Starting…" : existingRunId ? "Continue →" : "Start →"}
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
    const blockingCount = issues.filter((i) => i.isBlocking && !i.resolved).length;

    const attachedMedia = (currentStep.mediaIds ?? [])
      .map((id) => (workflow.media ?? []).find((m) => m.id === id))
      .filter(Boolean) as NonNullable<typeof workflow.media>;

    return (
      <>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={600}>
              Step {currentIndex + 1} of {stepsSorted.length}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center">
              {jobReference && <Chip label={jobReference} size="small" variant="outlined" />}
              {issues.length > 0 && (
                <Chip
                  size="small"
                  label={`${issues.length} issue${issues.length === 1 ? "" : "s"}${blockingCount > 0 ? ` (${blockingCount} blocking)` : ""}`}
                  color={blockingCount > 0 ? "error" : "warning"}
                />
              )}
            </Stack>
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
                        width: 72, height: 72, borderRadius: 1, overflow: "hidden",
                        border: "1px solid", borderColor: "divider",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        bgcolor: "action.hover", cursor: "pointer",
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

        {/* Flag issue inline form */}
        <Collapse in={flagOpen}>
          <Box sx={{ px: 3, pb: 1, pt: 0 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Typography variant="caption" fontWeight={700} color="error" display="block" mb={1}>
              Flag issue on this step
            </Typography>
            <Stack spacing={1.25}>
              <TextField
                size="small"
                fullWidth
                multiline
                rows={2}
                label="Describe the issue"
                value={flagDescription}
                onChange={(e) => setFlagDescription(e.target.value)}
              />
              <Stack direction="row" spacing={1}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Issue Type</InputLabel>
                  <Select
                    label="Issue Type"
                    value={flagIssueType}
                    onChange={(e) => setFlagIssueType(e.target.value as "blocking" | "observation")}
                  >
                    <MenuItem value="observation">Observation (non-blocking)</MenuItem>
                    <MenuItem value="blocking">Blocking (must resolve to complete)</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Severity</InputLabel>
                  <Select
                    label="Severity"
                    value={flagSeverity}
                    onChange={(e) => setFlagSeverity(e.target.value as "low" | "medium" | "high")}
                  >
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
              {flagIssueType === "blocking" && (
                <Alert severity="warning" sx={{ fontSize: 11 }}>
                  Blocking issues must be resolved before the workflow can be completed.
                </Alert>
              )}
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => setFlagOpen(false)}>Cancel</Button>
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  disabled={!flagDescription.trim()}
                  onClick={submitFlag}
                >
                  Submit issue
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Collapse>

        <DialogActions sx={{ flexWrap: "wrap", gap: 0.75, justifyContent: "space-between" }}>
          <Stack direction="row" spacing={0.75}>
            <Button onClick={goBack} disabled={history.length === 0} variant="outlined" size="small">
              ← Back
            </Button>
            {!flagOpen && (
              <Tooltip title="Flag an issue on this step">
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<ReportProblemOutlined fontSize="small" />}
                  onClick={() => { setFlagOpen(true); setFlagSubmitted(false); }}
                >
                  {flagSubmitted ? "Issue flagged ✓" : "Flag issue"}
                </Button>
              </Tooltip>
            )}
          </Stack>
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
    const blockingIssues = issues.filter((i) => i.isBlocking && !i.resolved);
    const hasBlockingIssues = blockingIssues.length > 0;

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

            {/* Issues summary */}
            {issues.length > 0 && (
              <Stack spacing={1}>
                <Divider />
                <Typography variant="subtitle2">
                  Issues flagged ({issues.length})
                  {hasBlockingIssues && (
                    <Typography component="span" variant="caption" color="error.main" sx={{ ml: 1 }}>
                      · {blockingIssues.length} blocking
                    </Typography>
                  )}
                </Typography>
                {issues.map((issue) => (
                  <Paper key={issue.id} variant="outlined" sx={{ p: 1.25, borderColor: issue.isBlocking ? "error.main" : undefined }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <Chip
                        size="small"
                        label={issue.issueType}
                        color={issue.isBlocking ? "error" : "default"}
                        sx={{ flexShrink: 0 }}
                      />
                      <Chip size="small" label={issue.severity} variant="outlined" sx={{ flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ flex: 1 }}>
                        {issue.description}
                        {issue.stepTitle && (
                          <Typography component="span" variant="caption" color="text.secondary"> · {issue.stepTitle}</Typography>
                        )}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}

            {hasBlockingIssues && !blockingError && (
              <Alert severity="error" sx={{ fontSize: 12 }}>
                {blockingIssues.length} blocking issue{blockingIssues.length === 1 ? "" : "s"} must be resolved before locking this run.
                {!activeRunId && " (Preview mode: not enforced)"}
              </Alert>
            )}

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

            {blockingError && <Alert severity="error" sx={{ fontSize: 12 }}>{blockingError}</Alert>}
            {saveError && <Alert severity="error" sx={{ fontSize: 12 }}>{saveError}</Alert>}
            {saved && (
              <Alert severity="success" sx={{ fontSize: 12 }} icon={<LockOutlined fontSize="small" />}>
                Run locked and saved successfully.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={saving}>
            {saved ? "Close" : "Discard"}
          </Button>
          {!saved && (
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || (hasBlockingIssues && Boolean(activeRunId))}
              startIcon={saving ? <CircularProgress size={14} /> : undefined}
            >
              {saving ? "Saving…" : activeRunId ? "Lock run ✓" : "Done (preview)"}
            </Button>
          )}
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
