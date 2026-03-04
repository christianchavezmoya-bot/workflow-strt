import { useEffect, useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  CommentOutlined,
  DeleteOutlineOutlined,
  EditOutlined,
  LockOutlined,
  PauseOutlined,
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
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";

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
  /** Values from a previous run to pre-populate as editable defaults (re-run scenario). */
  prefillValues?: Record<string, Record<string, string>>;
  /** Called after run is locked. */
  onComplete?: (capturedFeatureValues: Record<string, string>) => void;
  /** Called when user pauses — receives progress, step titles, and any feature values captured so far. */
  onPause?: (progress: { done: number; total: number; completedTitles: string[]; partialFeatureValues: Record<string, string> }) => void;
  /** Full name of the currently logged-in user, stored on each issue. */
  currentUserName?: string;
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
  prefillValues,
  onComplete,
  onPause,
  currentUserName,
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
  const [values, setValues] = useState<Record<string, Record<string, string>>>(prefillValues ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [requiredWarning, setRequiredWarning] = useState(false);

  // Issue tracking
  const [issues, setIssues] = useState<RunIssue[]>([]);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagDescription, setFlagDescription] = useState("");
  const [flagSeverity, setFlagSeverity] = useState<"low" | "medium" | "high">("medium");
  const [flagSubmitted, setFlagSubmitted] = useState(false);
  // Issue editing
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editIssueDesc, setEditIssueDesc] = useState("");
  const [editIssueSeverity, setEditIssueSeverity] = useState<"low" | "medium" | "high">("medium");
  // Issue detail dialog (comments / close)
  const [issueDetailId, setIssueDetailId] = useState<string | null>(null);

  // Run tracking
  const [activeRunId, setActiveRunId] = useState<string | null>(existingRunId ?? null);
  const [resumingRun, setResumingRun] = useState(Boolean(existingRunId));
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
    setValues(prefillValues ?? {});
    setSaved(false);
    setSaveError(null);
    setBlockingError(null);
    setRequiredWarning(false);
    setFlagOpen(false);
    setFlagDescription("");
    setFlagSeverity("medium");
    setFlagSubmitted(false);
    setIssues([]);
    setActiveRunId(existingRunId ?? null);
    setResumingRun(Boolean(existingRunId));
    setEditingIssueId(null);
    setEditIssueDesc("");
    setEditIssueSeverity("medium");
    setIssueDetailId(null);
  }

  function submitFlag() {
    if (!flagDescription.trim()) return;
    const isBlocking = flagSeverity === "high";
    const issue: RunIssue = {
      id: crypto.randomUUID ? crypto.randomUUID() : `issue_${Date.now()}`,
      description: flagDescription.trim(),
      issueType: isBlocking ? "blocking" : "observation",
      isBlocking,
      severity: flagSeverity,
      stepId: currentStep?.id,
      stepTitle: currentStep?.title,
      reportedAt: new Date().toISOString(),
      resolved: false,
      createdBy: currentUserName,
    };
    setIssues((prev) => [...prev, issue]);
    // Clear description only — keep form open so user can add more issues
    setFlagDescription("");
    setFlagSubmitted(true);
  }

  function deleteIssue(id: string) {
    setIssues((prev) => prev.filter((i) => i.id !== id));
    autosaveProgress();
  }

  function startEditIssue(issue: RunIssue) {
    setEditingIssueId(issue.id);
    setEditIssueDesc(issue.description);
    setEditIssueSeverity(issue.severity);
  }

  function saveEditIssue() {
    if (!editingIssueId || !editIssueDesc.trim()) return;
    const isBlocking = editIssueSeverity === "high";
    setIssues((prev) => prev.map((i) =>
      i.id === editingIssueId
        ? { ...i, description: editIssueDesc.trim(), severity: editIssueSeverity, isBlocking, issueType: isBlocking ? "blocking" : "observation" }
        : i,
    ));
    setEditingIssueId(null);
    setEditIssueDesc("");
    setEditIssueSeverity("medium");
    autosaveProgress();
  }

  function handleIssueDetailSave(updated: RunIssue) {
    setIssues((prev) => prev.map((i) => i.id === updated.id ? updated : i));
    autosaveProgress();
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePause() {
    await autosaveProgress();
    const completedTitles = history
      .map((id) => stepsSorted.find((s) => s.id === id)?.title ?? "")
      .filter(Boolean);
    const partialFeatureValues = extractFeatureValues();
    onPause?.({ done: history.length, total: stepsSorted.length, completedTitles, partialFeatureValues });
    reset();
    onClose();
  }

  async function startRun() {
    if (!isRealRun) {
      setCurrentStepId(stepsSorted[0]?.id ?? null);
      setStage("running");
      return;
    }

    setStartingRun(true);
    setStartError(null);
    try {
      // Fetch or create the run. Backend is idempotent: returns existing active run if present.
      let run = activeRunId
        ? await assetWorkflowRunService.getById(activeRunId)
        : await assetWorkflowRunService.startRun(projectAssetId!, workflowConfigId!);

      if (!run) {
        setStartError("Could not load run. Please try again.");
        return;
      }
      setActiveRunId(run.id);

      // Restore step values and issues from saved progress
      let prevValues: Record<string, Record<string, string>> = {};
      let navRestored = false;
      if (run.stepResultsJson && run.stepResultsJson !== "[]") {
        try {
          const prev = JSON.parse(run.stepResultsJson) as StepCapture[];
          const navEntry = prev.find((sc) => sc.stepId === "__nav__");
          const dataEntries = prev.filter((sc) => sc.stepId !== "__nav__");

          // Restore input values
          for (const sc of dataEntries) prevValues[sc.stepId] = sc.values;
          setValues(prevValues);

          // Restore exact navigation position from nav marker
          if (navEntry?.values?.currentStepId) {
            const savedStepId = navEntry.values.currentStepId;
            const savedHistory: string[] = JSON.parse(navEntry.values.historyJson ?? "[]");
            setCurrentStepId(savedStepId);
            setHistory(savedHistory);
            setResumingRun(true);
            navRestored = true;
          }
        } catch {}
      }
      if (run.issuesJson && run.issuesJson !== "[]") {
        try { setIssues(JSON.parse(run.issuesJson) as RunIssue[]); } catch {}
      }

      // Fallback if no nav marker: go to first step without captured data
      if (!navRestored) {
        const hasData = Object.keys(prevValues).length > 0;
        if (hasData) {
          setResumingRun(true);
          const firstIncomplete = stepsSorted.find((s) => !Object.keys(prevValues[s.id] ?? {}).length);
          const resumeStepId = firstIncomplete?.id ?? stepsSorted[stepsSorted.length - 1]?.id ?? null;
          const resumeIdx = stepsSorted.findIndex((s) => s.id === resumeStepId);
          setHistory(stepsSorted.slice(0, Math.max(resumeIdx, 0)).map((s) => s.id));
          setCurrentStepId(resumeStepId);
        } else {
          setCurrentStepId(stepsSorted[0]?.id ?? null);
        }
      }
    } catch {
      setStartError("Could not start run. Check your connection and try again.");
      return;
    } finally {
      setStartingRun(false);
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
    setFlagOpen(false);
    setFlagSubmitted(false);
    if (isLastStep || !currentStep.nextStepId) {
      autosaveProgress();
      setStage("summary");
    } else {
      const nextStepId = currentStep.nextStepId;
      const nextHistory = [...history, currentStep.id];
      setHistory(nextHistory);
      setCurrentStepId(nextStepId);
      autosaveProgress(nextStepId, nextHistory);
    }
  }

  function handleDecision(targetId: string | null) {
    if (!currentStep) return;
    setRequiredWarning(!checkRequired(currentStep));
    setFlagOpen(false);
    setFlagSubmitted(false);
    if (targetId) {
      const nextHistory = [...history, currentStep.id];
      setHistory(nextHistory);
      setCurrentStepId(targetId);
      autosaveProgress(targetId, nextHistory);
    } else {
      autosaveProgress();
      setStage("summary");
    }
  }

  function buildStepsData(navStepId?: string, navHistory?: string[]): StepCapture[] {
    const dataSteps = stepsSorted
      .map((step) => ({
        stepId: step.id,
        values: values[step.id] ?? {},
        completedAt: new Date().toISOString(),
      }))
      .filter((sc) => Object.keys(sc.values).length > 0);

    // Navigation marker — always saved so exact step + history can be restored on resume.
    // When navigating forward we pass the NEXT step explicitly (state updates are async,
    // so reading currentStepId/history from closure would give the previous step).
    const navEntry: StepCapture = {
      stepId: "__nav__",
      values: {
        currentStepId: navStepId ?? currentStepId ?? stepsSorted[0]?.id ?? "",
        historyJson: JSON.stringify(navHistory ?? history),
      },
      completedAt: new Date().toISOString(),
    };
    return [...dataSteps, navEntry];
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

  async function autosaveProgress(navStepId?: string, navHistory?: string[]) {
    if (!activeRunId) return;
    try {
      await assetWorkflowRunService.saveProgress(
        activeRunId,
        JSON.stringify(buildStepsData(navStepId, navHistory)),
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
        await assetWorkflowRunService.completeRun(activeRunId, stepsJson, issuesJson, currentUserName);
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
            {startingRun ? "Loading…" : resumingRun ? "Continue →" : "Start →"}
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
          <Box sx={{ px: 3, pb: 1.5, pt: 0 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Typography variant="caption" fontWeight={700} color="error" display="block" mb={0.5}>
              Flag issue on this step
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.25}>
              <strong>High</strong> severity = <strong>blocking</strong> — workflow cannot be completed until resolved.&nbsp;
              <strong>Medium</strong> or <strong>Low</strong> = observation — noted but does not block completion.
            </Typography>
            <Stack spacing={1.25}>
              {/* Issues already flagged on this step */}
              {issues.filter((i) => i.stepId === currentStep?.id).length > 0 && (
                <Stack spacing={0.75}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Flagged on this step:
                  </Typography>
                  {issues.filter((i) => i.stepId === currentStep?.id).map((issue) => (
                    <Paper key={issue.id} variant="outlined" sx={{ p: 1, borderColor: issue.isBlocking ? "error.light" : "warning.light" }}>
                      {editingIssueId === issue.id ? (
                        <Stack spacing={0.75}>
                          <TextField size="small" fullWidth multiline rows={2} label="Description"
                            value={editIssueDesc} onChange={(e) => setEditIssueDesc(e.target.value)} />
                          <FormControl size="small" sx={{ maxWidth: 220 }}>
                            <InputLabel>Severity</InputLabel>
                            <Select label="Severity" value={editIssueSeverity}
                              onChange={(e) => setEditIssueSeverity(e.target.value as "low" | "medium" | "high")}>
                              <MenuItem value="low">Low — observation only</MenuItem>
                              <MenuItem value="medium">Medium — attention needed</MenuItem>
                              <MenuItem value="high">High — blocks completion</MenuItem>
                            </Select>
                          </FormControl>
                          <Stack direction="row" spacing={0.75}>
                            <Button size="small" variant="contained" color="primary" disabled={!editIssueDesc.trim()} onClick={saveEditIssue}>Save</Button>
                            <Button size="small" onClick={() => setEditingIssueId(null)}>Cancel</Button>
                          </Stack>
                        </Stack>
                      ) : (
                        <Stack spacing={0.25}>
                          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {issue.resolved
                                ? <Chip size="small" label="Resolved" color="success" sx={{ height: 18, fontSize: 10 }} />
                                : <Chip size="small" label={issue.isBlocking ? "Blocking" : "Observation"} color={issue.isBlocking ? "error" : "warning"} sx={{ height: 18, fontSize: 10 }} />
                              }
                              <Chip size="small" label={issue.severity.toUpperCase()} variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                            </Stack>
                            <Stack direction="row" spacing={0}>
                              <Tooltip title="Add comments or close issue">
                                <IconButton size="small" onClick={() => setIssueDetailId(issue.id)} sx={{ p: 0.25 }}>
                                  <CommentOutlined sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit issue"><IconButton size="small" onClick={() => startEditIssue(issue)} sx={{ p: 0.25 }}><EditOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                              <Tooltip title="Delete issue"><IconButton size="small" color="error" onClick={() => deleteIssue(issue.id)} sx={{ p: 0.25 }}><DeleteOutlineOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                            </Stack>
                          </Stack>
                          <Typography variant="caption" sx={issue.resolved ? { textDecoration: "line-through", color: "text.disabled" } : undefined}>{issue.description}</Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                            {issue.createdBy ? `${issue.createdBy} · ` : ""}{new Date(issue.reportedAt).toLocaleString()}
                          </Typography>
                        </Stack>
                      )}
                    </Paper>
                  ))}
                </Stack>
              )}
              <TextField
                size="small"
                fullWidth
                multiline
                rows={2}
                label="Describe the issue"
                placeholder="Describe what you observed…"
                value={flagDescription}
                onChange={(e) => { setFlagDescription(e.target.value); setFlagSubmitted(false); }}
              />
              <FormControl size="small" sx={{ maxWidth: 260 }}>
                <InputLabel>Severity</InputLabel>
                <Select
                  label="Severity"
                  value={flagSeverity}
                  onChange={(e) => setFlagSeverity(e.target.value as "low" | "medium" | "high")}
                >
                  <MenuItem value="low">Low — observation only</MenuItem>
                  <MenuItem value="medium">Medium — attention needed</MenuItem>
                  <MenuItem value="high">High — blocks completion</MenuItem>
                </Select>
              </FormControl>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disabled={!flagDescription.trim()}
                  onClick={submitFlag}
                  sx={{ flexShrink: 0 }}
                >
                  Add issue
                </Button>
                {flagSubmitted && (
                  <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                    ✓ Issue added — type another or close
                  </Typography>
                )}
                <Box sx={{ flex: 1 }} />
                <Button size="small" variant="text" color="inherit" onClick={() => { setFlagOpen(false); setFlagSubmitted(false); }}>
                  Close
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Collapse>

        <DialogActions sx={{ flexWrap: "wrap", gap: 0.75, justifyContent: "space-between" }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Button onClick={goBack} disabled={history.length === 0} variant="outlined" size="small">
              ← Back
            </Button>
            {!flagOpen && (() => {
              const stepIssueCount = issues.filter((i) => i.stepId === currentStep?.id).length;
              return (
                <Tooltip title="Flag an issue on this step">
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<ReportProblemOutlined fontSize="small" />}
                    onClick={() => { setFlagOpen(true); setFlagSubmitted(false); }}
                  >
                    {stepIssueCount > 0 ? `Issues (${stepIssueCount}) +` : "Flag issue"}
                  </Button>
                </Tooltip>
              );
            })()}
          </Stack>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
            <Tooltip title="Save progress and close — resume later from where you left off">
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<PauseOutlined fontSize="small" />}
                onClick={handlePause}
              >
                Pause
              </Button>
            </Tooltip>
            <Tooltip title="Close without saving current step inputs">
              <Button size="small" color="inherit" onClick={handleClose}>
                Cancel
              </Button>
            </Tooltip>
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
                    {editingIssueId === issue.id ? (
                      <Stack spacing={0.75}>
                        <TextField size="small" fullWidth multiline rows={2} label="Description"
                          value={editIssueDesc} onChange={(e) => setEditIssueDesc(e.target.value)} />
                        <FormControl size="small" sx={{ maxWidth: 220 }}>
                          <InputLabel>Severity</InputLabel>
                          <Select label="Severity" value={editIssueSeverity}
                            onChange={(e) => setEditIssueSeverity(e.target.value as "low" | "medium" | "high")}>
                            <MenuItem value="low">Low — observation only</MenuItem>
                            <MenuItem value="medium">Medium — attention needed</MenuItem>
                            <MenuItem value="high">High — blocks completion</MenuItem>
                          </Select>
                        </FormControl>
                        <Stack direction="row" spacing={0.75}>
                          <Button size="small" variant="contained" color="primary" disabled={!editIssueDesc.trim()} onClick={saveEditIssue}>Save</Button>
                          <Button size="small" onClick={() => setEditingIssueId(null)}>Cancel</Button>
                        </Stack>
                      </Stack>
                    ) : (
                      <Stack spacing={0.5}>
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {issue.resolved
                              ? <Chip size="small" label="Resolved" color="success" sx={{ flexShrink: 0 }} />
                              : <Chip size="small" label={issue.isBlocking ? "Blocking" : "Observation"} color={issue.isBlocking ? "error" : "default"} sx={{ flexShrink: 0 }} />
                            }
                            <Chip size="small" label={issue.severity} variant="outlined" sx={{ flexShrink: 0 }} />
                            {issue.stepTitle && <Chip size="small" label={issue.stepTitle} variant="outlined" sx={{ flexShrink: 0 }} />}
                          </Stack>
                          <Stack direction="row" spacing={0}>
                            <Tooltip title="Add comments or close issue">
                              <IconButton size="small" onClick={() => setIssueDetailId(issue.id)} sx={{ p: 0.25 }}>
                                <CommentOutlined sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit issue"><IconButton size="small" onClick={() => startEditIssue(issue)} sx={{ p: 0.25 }}><EditOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                            <Tooltip title="Delete issue"><IconButton size="small" color="error" onClick={() => deleteIssue(issue.id)} sx={{ p: 0.25 }}><DeleteOutlineOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                          </Stack>
                        </Stack>
                        <Typography variant="caption" sx={issue.resolved ? { textDecoration: "line-through", color: "text.disabled" } : undefined}>{issue.description}</Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                          {issue.createdBy ? `${issue.createdBy} · ` : ""}{new Date(issue.reportedAt).toLocaleString()}
                        </Typography>
                      </Stack>
                    )}
                  </Paper>
                ))}
              </Stack>
            )}

            {hasBlockingIssues && !blockingError && (
              <Alert severity="error" sx={{ fontSize: 12 }}>
                {blockingIssues.length} blocking issue{blockingIssues.length === 1 ? "" : "s"} must be closed before locking this run.
                {activeRunId
                  ? " Click the comment icon on each blocking issue to add notes and close it."
                  : " (Preview mode: not enforced)"}
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

  const issueForDetail = issueDetailId ? issues.find((i) => i.id === issueDetailId) ?? null : null;

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        {stage === "setup" && renderSetup()}
        {stage === "running" && renderRunning()}
        {stage === "summary" && renderSummary()}
      </Dialog>
      {issueForDetail && (
        <IssueDetailDialog
          open={Boolean(issueDetailId)}
          issue={issueForDetail}
          currentUser={currentUserName ?? "Unknown"}
          onClose={() => setIssueDetailId(null)}
          onSave={(updated) => handleIssueDetailSave(updated as RunIssue)}
        />
      )}
    </>
  );
}
