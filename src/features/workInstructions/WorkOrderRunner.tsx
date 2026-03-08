import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  CloudOffOutlined,
  CommentOutlined,
  DeleteOutlineOutlined,
  EditOutlined,
  LockOutlined,
  PauseOutlined,
  QrCodeScannerOutlined,
  ReportProblemOutlined,
  SyncOutlined,
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
  Menu,
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
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";
import TimeEntriesEditorDialog from "../../components/ui/TimeEntriesEditorDialog";
import { useOfflineTimeQueue } from "../../hooks/useOfflineTimeQueue";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StepCapture {
  stepId: string;
  values: Record<string, string>;
  completedAt: string;
}

interface RunTimeEntry {
  id: string;
  category: "productive" | "downtime";
  startedAtUtc: string;
  endedAtUtc?: string | null;
  reason?: string | null;
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

function parseRunTimeEntries(json: string): RunTimeEntry[] {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>[];
    if (!Array.isArray(raw)) return [];
    // Normalize both camelCase (new) and PascalCase (legacy DB records)
    return raw.map((e) => ({
      id: String(e.id ?? e.Id ?? ""),
      category: String(e.category ?? e.Category ?? "productive") as "productive" | "downtime",
      startedAtUtc: String(e.startedAtUtc ?? e.StartedAtUtc ?? ""),
      endedAtUtc: (e.endedAtUtc ?? e.EndedAtUtc ?? null) as string | null,
      reason: (e.reason ?? e.Reason ?? null) as string | null,
    }));
  } catch {
    return [];
  }
}

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

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
  const [flagIssueType, setFlagIssueType] = useState<"blocking" | "observation" | "scope-deviation">("observation");
  const [flagExtraHours, setFlagExtraHours] = useState("");
  const [flagCostImpact, setFlagCostImpact] = useState("");
  const [flagSubmitted, setFlagSubmitted] = useState(false);
  // Issue editing
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editIssueDesc, setEditIssueDesc] = useState("");
  const [editIssueSeverity, setEditIssueSeverity] = useState<"low" | "medium" | "high">("medium");
  // Issue detail dialog (comments / close)
  const [issueDetailId, setIssueDetailId] = useState<string | null>(null);
  // Right-click context menu anchor for the issues chip
  const [issueMenuAnchor, setIssueMenuAnchor] = useState<Element | null>(null);

  // Run tracking
  const [activeRunId, setActiveRunId] = useState<string | null>(existingRunId ?? null);
  const [activeRun, setActiveRun] = useState<AssetWorkflowRun | null>(null);
  const [timeEditorOpen, setTimeEditorOpen] = useState(false);
  const [resumingRun, setResumingRun] = useState(Boolean(existingRunId));
  const [startingRun, setStartingRun] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [blockingError, setBlockingError] = useState<string | null>(null);
  const [downtimeReason, setDowntimeReason] = useState("");
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [productiveSecondsBase, setProductiveSecondsBase] = useState(0);
  const [downtimeSecondsBase, setDowntimeSecondsBase] = useState(0);
  const [trackingCategory, setTrackingCategory] = useState<"productive" | "downtime" | null>(null);
  const [trackingStartedAt, setTrackingStartedAt] = useState<string | null>(null);
  const [tickNow, setTickNow] = useState(Date.now());

  const isRealRun = Boolean(projectAssetId && workflowConfigId);

  // Stable callback ref — avoids stale closures inside the hook
  const syncRunTimeStateRef = useCallback((run: AssetWorkflowRun) => {
    setActiveRun(run);
    syncRunTimeState(run);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { pendingCount, syncing, isOnline, queueOrSend } = useOfflineTimeQueue({
    runId: isRealRun ? activeRunId : null,
    onSynced: syncRunTimeStateRef,
  });

  const currentStep = stepsSorted.find((s) => s.id === currentStepId) ?? null;
  const currentIndex = stepsSorted.findIndex((s) => s.id === currentStepId);
  const isLastStep = currentStep?.nextStepId === null && !currentStep?.decisionsEnabled;

  const liveElapsedSeconds = useMemo(() => {
    if (!trackingStartedAt || !trackingCategory) return 0;
    const startMs = Date.parse(trackingStartedAt);
    if (Number.isNaN(startMs)) return 0;
    return Math.max(0, Math.floor((tickNow - startMs) / 1000));
  }, [trackingStartedAt, trackingCategory, tickNow]);

  const productiveSecondsLive = productiveSecondsBase + (trackingCategory === "productive" ? liveElapsedSeconds : 0);
  const downtimeSecondsLive = downtimeSecondsBase + (trackingCategory === "downtime" ? liveElapsedSeconds : 0);

  useEffect(() => {
    if (open && existingRunId) setActiveRunId(existingRunId);
    if (!open) reset();
  }, [open, existingRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stage !== "running" || !trackingCategory || !trackingStartedAt) return;
    const t = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [stage, trackingCategory, trackingStartedAt]);

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
    setFlagIssueType("observation");
    setFlagExtraHours("");
    setFlagCostImpact("");
    setFlagSubmitted(false);
    setIssues([]);
    setActiveRunId(existingRunId ?? null);
    setActiveRun(null);
    setTimeEditorOpen(false);
    setResumingRun(Boolean(existingRunId));
    setEditingIssueId(null);
    setEditIssueDesc("");
    setEditIssueSeverity("medium");
    setIssueDetailId(null);
    setIssueMenuAnchor(null);
    setDowntimeReason("");
    setTrackingBusy(false);
    setProductiveSecondsBase(0);
    setDowntimeSecondsBase(0);
    setTrackingCategory(null);
    setTrackingStartedAt(null);
    setTickNow(Date.now());
  }

  function syncRunTimeState(run: {
    timeTrackingJson?: string;
    productiveSeconds?: number;
    downtimeSeconds?: number;
  }) {
    setProductiveSecondsBase(run.productiveSeconds ?? 0);
    setDowntimeSecondsBase(run.downtimeSeconds ?? 0);
    const entries = parseRunTimeEntries(run.timeTrackingJson ?? "[]");
    const open = [...entries].reverse().find((e) => !e.endedAtUtc) ?? null;
    if (open && (open.category === "productive" || open.category === "downtime")) {
      setTrackingCategory(open.category);
      setTrackingStartedAt(open.startedAtUtc);
    } else {
      setTrackingCategory(null);
      setTrackingStartedAt(null);
    }
  }

  async function trackRunTime(action: "StartDowntime" | "StopDowntime" | "ResumeProductive", reason?: string) {
    if (!activeRunId) return;
    setTrackingBusy(true);
    try {
      const updated = await queueOrSend(action, reason);
      if (updated) {
        // Online — sync from authoritative server response
        setActiveRun(updated);
        syncRunTimeState(updated);
      } else {
        // Queued (offline) — apply optimistic UI state immediately
        const nowIso = new Date().toISOString();
        if (action === "StartDowntime") {
          setProductiveSecondsBase(productiveSecondsLive);
          setTrackingCategory("downtime");
          setTrackingStartedAt(nowIso);
        } else if (action === "StopDowntime") {
          setDowntimeSecondsBase(downtimeSecondsLive);
          setTrackingCategory(null);
          setTrackingStartedAt(null);
        } else if (action === "ResumeProductive") {
          setDowntimeSecondsBase(downtimeSecondsLive);
          setTrackingCategory("productive");
          setTrackingStartedAt(nowIso);
        }
      }
      if (action !== "StartDowntime") setDowntimeReason("");
    } catch {
      setSaveError("Could not update time tracking. Please try again.");
    } finally {
      setTrackingBusy(false);
    }
  }

  function submitFlag() {
    if (!flagDescription.trim()) return;
    const isScopeDev = flagIssueType === "scope-deviation";
    const isBlocking = !isScopeDev && flagSeverity === "high";
    const issue: RunIssue = {
      id: crypto.randomUUID ? crypto.randomUUID() : `issue_${Date.now()}`,
      description: flagDescription.trim(),
      issueType: flagIssueType,
      isBlocking,
      severity: isScopeDev ? "medium" : flagSeverity,
      stepId: currentStep?.id,
      stepTitle: currentStep?.title,
      reportedAt: new Date().toISOString(),
      resolved: false,
      createdBy: currentUserName,
      ...(isScopeDev && {
        extraHours: flagExtraHours ? parseFloat(flagExtraHours) : undefined,
        costImpact: flagCostImpact.trim() || undefined,
      }),
    };
    setIssues((prev) => [...prev, issue]);
    setFlagDescription("");
    setFlagExtraHours("");
    setFlagCostImpact("");
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
        ? { ...i, description: editIssueDesc.trim(), severity: editIssueSeverity, isBlocking,
            issueType: i.issueType === "scope-deviation" ? "scope-deviation" : isBlocking ? "blocking" : "observation" }
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
    if (activeRunId && isRealRun && trackingCategory !== "downtime") {
      try {
        const updated = await queueOrSend("StartDowntime", "Paused by user");
        if (updated) {
          setActiveRun(updated);
          syncRunTimeState(updated);
        }
        // If queued (offline), the run persists via localStorage — no UI update needed here
        // since we're closing the dialog anyway
      } catch {
        // keep pause flow resilient
      }
    }
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
      setActiveRun(run);
      syncRunTimeState(run);

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
                <Tooltip title="Right-click for details">
                  <Chip
                    size="small"
                    label={`${issues.length} issue${issues.length === 1 ? "" : "s"}${blockingCount > 0 ? ` (${blockingCount} blocking)` : ""}`}
                    color={blockingCount > 0 ? "error" : "warning"}
                    onContextMenu={(e) => { e.preventDefault(); setIssueMenuAnchor(e.currentTarget); }}
                    sx={{ cursor: "context-menu" }}
                  />
                </Tooltip>
              )}
              <Menu
                anchorEl={issueMenuAnchor}
                open={Boolean(issueMenuAnchor)}
                onClose={() => setIssueMenuAnchor(null)}
                PaperProps={{ sx: { minWidth: 280, maxWidth: 360 } }}
              >
                <Typography variant="caption" fontWeight={700} sx={{ px: 2, py: 0.75, display: "block", textTransform: "uppercase", letterSpacing: 0.8, color: "text.secondary" }}>
                  Issues — click to jump to step
                </Typography>
                {issues.map((issue) => (
                  <MenuItem
                    key={issue.id}
                    onClick={() => {
                      if (issue.stepId) setCurrentStepId(issue.stepId);
                      setIssueDetailId(issue.id);
                      setIssueMenuAnchor(null);
                    }}
                    sx={{ gap: 1, alignItems: "flex-start", py: 0.75 }}
                  >
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: issue.severity === "high" ? "error.main" : issue.severity === "medium" ? "warning.main" : "text.disabled", flexShrink: 0, mt: 0.6 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {issue.stepTitle ?? "No step"}
                      </Typography>
                      <Typography variant="caption" noWrap sx={{ textDecoration: issue.resolved ? "line-through" : "none" }}>
                        {issue.description.length > 60 ? issue.description.slice(0, 60) + "…" : issue.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Menu>
            </Stack>
          </Stack>
          <LinearProgress variant="determinate" value={progress} sx={{ mt: 1, borderRadius: 1 }} />
          {isRealRun && activeRunId && (
            <Stack spacing={1} sx={{ mt: 1.25 }}>
              {/* Status row: state badge + time totals + offline/sync indicator */}
              <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                <Chip
                  size="small"
                  variant={trackingCategory ? "filled" : "outlined"}
                  color={trackingCategory === "productive" ? "success" : trackingCategory === "downtime" ? "warning" : "default"}
                  label={
                    trackingCategory === "productive"
                      ? "● Productive"
                      : trackingCategory === "downtime"
                      ? "● Downtime"
                      : "Idle"
                  }
                  sx={{ fontWeight: 600, letterSpacing: 0.2 }}
                />
                <Chip size="small" color="success" variant="outlined" label={`Productive: ${formatDuration(productiveSecondsLive)}`} />
                <Chip
                  size="small"
                  color={downtimeSecondsLive > 0 ? "warning" : "default"}
                  variant="outlined"
                  label={`Downtime: ${formatDuration(downtimeSecondsLive)}`}
                />
                {/* Offline / sync status */}
                {syncing ? (
                  <Chip
                    size="small"
                    color="info"
                    variant="outlined"
                    icon={<SyncOutlined sx={{ fontSize: "0.85rem !important", animation: "spin 1s linear infinite", "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } } }} />}
                    label="Syncing…"
                  />
                ) : !isOnline ? (
                  <Chip
                    size="small"
                    color="warning"
                    variant="filled"
                    icon={<CloudOffOutlined sx={{ fontSize: "0.85rem !important" }} />}
                    label={pendingCount > 0 ? `Offline · ${pendingCount} queued` : "Offline"}
                    sx={{ fontWeight: 600 }}
                  />
                ) : pendingCount > 0 ? (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    icon={<SyncOutlined sx={{ fontSize: "0.85rem !important" }} />}
                    label={`${pendingCount} pending sync`}
                  />
                ) : null}
              </Stack>
              {/* Controls row */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={0.75} alignItems={{ sm: "center" }} useFlexGap>
                {/* Reason field — only editable when not already tracking downtime */}
                {trackingCategory !== "downtime" && (
                  <TextField
                    size="small"
                    label="Downtime reason"
                    value={downtimeReason}
                    onChange={(e) => setDowntimeReason(e.target.value)}
                    placeholder="Waiting for parts / access / permit..."
                    sx={{ minWidth: 220, flex: 1 }}
                  />
                )}
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {/* Edit times */}
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    sx={{ opacity: 0.65, fontSize: "0.72rem" }}
                    onClick={() => setTimeEditorOpen(true)}
                  >
                    Edit Times
                  </Button>
                  {/* Single downtime toggle */}
                  <Button
                    size="small"
                    color="warning"
                    variant={trackingCategory === "downtime" ? "contained" : "outlined"}
                    disabled={trackingBusy || (trackingCategory !== "downtime" && !downtimeReason.trim())}
                    onClick={() => {
                      if (trackingCategory === "downtime") {
                        void trackRunTime("StopDowntime");
                      } else {
                        void trackRunTime("StartDowntime", downtimeReason.trim());
                      }
                    }}
                  >
                    {trackingCategory === "downtime" ? "Stop Downtime" : "Start Downtime"}
                  </Button>
                  {/* Productive button — greyed out / disabled while already productive */}
                  <Button
                    size="small"
                    color="success"
                    variant={trackingCategory === "productive" ? "outlined" : "contained"}
                    disabled={trackingBusy || trackingCategory === "productive"}
                    onClick={() => { void trackRunTime("ResumeProductive"); }}
                    sx={trackingCategory === "productive" ? { opacity: 0.5, cursor: "default" } : {}}
                  >
                    {trackingCategory === "productive" ? "Running..." : "Resume Productive"}
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          )}
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
              {/* Issue type selector */}
              <FormControl size="small" sx={{ maxWidth: 300 }}>
                <InputLabel>Issue type</InputLabel>
                <Select
                  label="Issue type"
                  value={flagIssueType}
                  onChange={(e) => setFlagIssueType(e.target.value as typeof flagIssueType)}
                >
                  <MenuItem value="observation">Observation — noted, non-blocking</MenuItem>
                  <MenuItem value="blocking">Blocking — must resolve before completion</MenuItem>
                  <MenuItem value="scope-deviation">Scope deviation — work outside original scope</MenuItem>
                </Select>
              </FormControl>
              {flagIssueType !== "scope-deviation" && (
                <Typography variant="caption" color="text.secondary" display="block">
                  {flagIssueType === "blocking"
                    ? "Workflow cannot be completed until this is resolved."
                    : "Logged for record — does not block completion."}
                </Typography>
              )}
              {flagIssueType === "scope-deviation" && (
                <Typography variant="caption" color="warning.main" display="block">
                  Use for work discovered outside the original scope (e.g. additional cabling, unforeseen access requirements).
                </Typography>
              )}

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
                                : <Chip size="small"
                                    label={issue.issueType === "scope-deviation" ? "Scope Dev." : issue.isBlocking ? "Blocking" : "Observation"}
                                    color={issue.issueType === "scope-deviation" ? "warning" : issue.isBlocking ? "error" : "warning"}
                                    sx={{ height: 18, fontSize: 10 }} />
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
                label={flagIssueType === "scope-deviation" ? "Describe the out-of-scope work" : "Describe/Add issue here"}
                placeholder={flagIssueType === "scope-deviation" ? "e.g. Additional conduit run required due to obstructed original route…" : "Describe what you observed…"}
                value={flagDescription}
                onChange={(e) => { setFlagDescription(e.target.value); setFlagSubmitted(false); }}
              />
              {flagIssueType !== "scope-deviation" && (
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
              )}
              {flagIssueType === "scope-deviation" && (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <TextField
                    size="small"
                    label="Extra hours (est.)"
                    type="number"
                    inputProps={{ min: 0, step: 0.5 }}
                    value={flagExtraHours}
                    onChange={(e) => setFlagExtraHours(e.target.value)}
                    sx={{ maxWidth: 160 }}
                  />
                  <TextField
                    size="small"
                    label="Cost impact (optional)"
                    placeholder="e.g. £250 materials"
                    value={flagCostImpact}
                    onChange={(e) => setFlagCostImpact(e.target.value)}
                    sx={{ flex: 1 }}
                  />
                </Stack>
              )}
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
            {isRealRun && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                <Chip size="small" color="success" variant="outlined" label={`Productive ${formatDuration(productiveSecondsLive)}`} />
                <Chip size="small" color={downtimeSecondsLive > 0 ? "warning" : "default"} variant="outlined" label={`Downtime ${formatDuration(downtimeSecondsLive)}`} />
              </Stack>
            )}

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
                  {issues.filter((i) => i.issueType === "scope-deviation").length > 0 && (
                    <Typography component="span" variant="caption" color="warning.main" sx={{ ml: 1 }}>
                      · {issues.filter((i) => i.issueType === "scope-deviation").length} scope deviation{issues.filter((i) => i.issueType === "scope-deviation").length !== 1 ? "s" : ""}
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
                              : <Chip size="small"
                                  label={issue.issueType === "scope-deviation" ? "Scope Dev." : issue.isBlocking ? "Blocking" : "Observation"}
                                  color={issue.issueType === "scope-deviation" ? "warning" : issue.isBlocking ? "error" : "default"}
                                  sx={{ flexShrink: 0 }} />
                            }
                            {issue.issueType !== "scope-deviation" && (
                              <Chip size="small" label={issue.severity} variant="outlined" sx={{ flexShrink: 0 }} />
                            )}
                            {issue.issueType === "scope-deviation" && (issue.extraHours != null || issue.costImpact) && (
                              <Chip size="small" variant="outlined" color="warning"
                                label={[issue.extraHours != null ? `+${issue.extraHours}h` : null, issue.costImpact].filter(Boolean).join(" · ")}
                                sx={{ flexShrink: 0 }} />
                            )}
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
      {activeRun && (
        <TimeEntriesEditorDialog
          open={timeEditorOpen}
          run={activeRun}
          onClose={() => setTimeEditorOpen(false)}
          onSaved={(updated) => {
            setActiveRun(updated);
            syncRunTimeState(updated);
          }}
        />
      )}
    </>
  );
}
