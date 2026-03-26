import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  AccessTimeOutlined,
  AttachMoneyOutlined,
  CheckCircleOutlined,
  CloudOffOutlined,
  CommentOutlined,
  DeleteOutlineOutlined,
  DrawOutlined,
  EditOutlined,
  EmailOutlined,
  LockOutlined,
  PauseOutlined,
  PhotoCameraOutlined,
  PlayArrowOutlined,
  QrCodeScannerOutlined,
  ReportProblemOutlined,
  SyncOutlined,
  VideocamOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import type { BomActualItem, BomItem, CaptureField, StepInput, Workflow, WorkflowStep } from "../../types/workflow";
import type { ProductFeatureDefinition } from "../../types/product";
import type { FeatureSelection } from "../../services/productConfigService";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { signatureService } from "../../services/signatureService";
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";
import MediaCapture from "../../components/ui/MediaCapture";
import QRUploadButton from "../../components/QRUploadButton";
import TimeEntriesEditorDialog from "../../components/ui/TimeEntriesEditorDialog";
import SignaturePad from "../../components/ui/SignaturePad";
import { useOfflineTimeQueue } from "../../hooks/useOfflineTimeQueue";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StepCapture {
  stepId: string;
  values: Record<string, string>;
  completedAt: string;
  iterationIndex?: number;
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
  /** Product feature definitions — used to look up feature names for repeatFeatureId steps. */
  productFeatures?: ProductFeatureDefinition[];
  /** Feature selections from the workflow config — provides expected qty per feature. */
  featureSelections?: FeatureSelection[];
}

type Stage = "setup" | "running" | "summary" | "bom" | "installer-sign" | "customer-sign";

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
  productFeatures,
  featureSelections,
}: WorkOrderRunnerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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
  const [flagIsScopeDeviation, setFlagIsScopeDeviation] = useState(false);
  const [flagExtraHours, setFlagExtraHours] = useState("");
  const [flagCostImpact, setFlagCostImpact] = useState("");
  const [flagSubmitted, setFlagSubmitted] = useState(false);
  const [flagMedia, setFlagMedia] = useState<string[]>([]);
  // Issue editing
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editIssueDesc, setEditIssueDesc] = useState("");
  const [editIssueSeverity, setEditIssueSeverity] = useState<"low" | "medium" | "high">("medium");
  // Issue detail dialog (comments / close)
  const [issueDetailId, setIssueDetailId] = useState<string | null>(null);
  // Right-click context menu anchor for the issues chip
  const [issueMenuAnchor, setIssueMenuAnchor] = useState<Element | null>(null);

  // Repeatable steps — how many iterations per step, current iteration, picker input value
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>({});
  const [repeatIter, setRepeatIter] = useState<Record<string, number>>({});
  const [repeatPickerCount, setRepeatPickerCount] = useState(1);
  // Feature-linked repeatable steps — qty modifications made by installer
  interface QtyModification { stepId: string; featureId: string; featureName: string; expectedQty: number; actualQty: number; reason: string; modifiedAt: string; }
  const [qtyModifications, setQtyModifications] = useState<Record<string, QtyModification>>({});
  const [modifyQtyOpen, setModifyQtyOpen] = useState(false);
  const [modifyQtyStepId, setModifyQtyStepId] = useState<string | null>(null);
  const [modifyQtyValue, setModifyQtyValue] = useState(1);
  const [modifyQtyReason, setModifyQtyReason] = useState("");

  // BOM confirmation
  const [bomActual, setBomActual] = useState<BomActualItem[]>([]);

  // Run tracking
  const [activeRunId, setActiveRunId] = useState<string | null>(existingRunId ?? null);
  const [activeRun, setActiveRun] = useState<AssetWorkflowRun | null>(null);
  const [timeEditorOpen, setTimeEditorOpen] = useState(false);
  const [resumingRun, setResumingRun] = useState(Boolean(existingRunId));
  const [startingRun, setStartingRun] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [blockingError, setBlockingError] = useState<string | null>(null);

  // ── Installer sign-off ────────────────────────────────────────────────────
  const [instPadData,   setInstPadData]   = useState<string | null>(null);
  const [instName,      setInstName]      = useState("");
  const [instOutcome,   setInstOutcome]   = useState<"Completed" | "Conditional">("Completed");
  const [instNotes,     setInstNotes]     = useState("");
  const [instSaving,    setInstSaving]    = useState(false);
  const [instError,     setInstError]     = useState<string | null>(null);
  // stable ref so canvas onChange doesn't re-add listeners on every render
  const instPadOnChange = useRef((d: string | null) => setInstPadData(d));

  // ── Customer sign-off ─────────────────────────────────────────────────────
  type CustSignMode = "options" | "sign-now" | "send-link";
  const [custMode,      setCustMode]      = useState<CustSignMode>("options");
  const [custPadData,   setCustPadData]   = useState<string | null>(null);
  const [custName,      setCustName]      = useState("");
  const [custTitle,     setCustTitle]     = useState("");
  const [custEmail,     setCustEmail]     = useState("");
  const [custOutcome,   setCustOutcome]   = useState<"Completed" | "Conditional" | "Declined">("Completed");
  const [custNotes,     setCustNotes]     = useState("");
  const [custSaving,    setCustSaving]    = useState(false);
  const [custError,     setCustError]     = useState<string | null>(null);
  // send-link form
  const [linkEmail,     setLinkEmail]     = useState("");
  const [linkName,      setLinkName]      = useState("");
  const [linkHours,     setLinkHours]     = useState(72);
  const [linkMsg,       setLinkMsg]       = useState("");
  const [linkSending,   setLinkSending]   = useState(false);
  const [linkSent,      setLinkSent]      = useState(false);
  const custPadOnChange = useRef((d: string | null) => setCustPadData(d));

  const [downtimeReason, setDowntimeReason] = useState("");
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [reasonPopoverAnchor, setReasonPopoverAnchor] = useState<HTMLButtonElement | null>(null);
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

  const { pendingCount, syncing, isOnline, queueOrSend, flush: flushTimeQueue } = useOfflineTimeQueue({
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

  // Tick every second while the dialog is open — drives productiveSecondsLive
  // and downtimeSecondsLive in real time. Running unconditionally (not gated
  // on stage or trackingCategory) means the clock never stops due to a stage
  // transition and always restarts cleanly when tracking switches categories.
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open]);

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
    setFlagIsScopeDeviation(false);
    setFlagExtraHours("");
    setFlagCostImpact("");
    setFlagMedia([]);
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
    setRepeatPickerCount(1);
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
    if (open && (open.category === "productive" || open.category === "downtime")
        && !Number.isNaN(Date.parse(open.startedAtUtc))) {
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
    const derivedIssueType: "blocking" | "observation" | "scope-deviation" =
      flagIsScopeDeviation ? "scope-deviation" : flagSeverity === "high" ? "blocking" : "observation";
    const isBlocking = flagSeverity === "high" && !flagIsScopeDeviation;
    const issue: RunIssue = {
      id: crypto.randomUUID ? crypto.randomUUID() : `issue_${Date.now()}`,
      description: flagDescription.trim(),
      issueType: derivedIssueType,
      isBlocking,
      severity: flagSeverity,
      stepId: currentStep?.id,
      stepTitle: currentStep?.title,
      reportedAt: new Date().toISOString(),
      resolved: false,
      createdBy: currentUserName,
      reportMedia: flagMedia.length > 0 ? flagMedia : undefined,
      ...(flagIsScopeDeviation && {
        extraHours: flagExtraHours ? parseFloat(flagExtraHours) : undefined,
        costImpact: flagCostImpact.trim() || undefined,
      }),
    };
    setIssues((prev) => [...prev, issue]);
    setFlagDescription("");
    setFlagExtraHours("");
    setFlagCostImpact("");
    setFlagMedia([]);
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
    if (activeRunId && isRealRun) {
      try {
        // Call directly (not via the offline queue) — pause is a fire-once
        // action tied to closing the dialog; queuing it causes a stale "sync
        // pending" chip when the user reopens the run.
        const updated = await assetWorkflowRunService.trackTimeEntry(activeRunId, "StopAll");
        if (updated) syncRunTimeState(updated);
      } catch {
        // non-fatal — idle state will be restored on next open
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

      // If the run has no open time entry (was paused → idle), automatically
      // resume productive so the clock starts the moment the tech continues.
      const timeEntries = parseRunTimeEntries(run.timeTrackingJson ?? "[]");
      const hasOpenEntry = timeEntries.some((e) => !e.endedAtUtc);
      if (!hasOpenEntry && run.id) {
        try {
          const resumed = await assetWorkflowRunService.trackTimeEntry(run.id, "ResumeProductive", "Continued");
          if (resumed) syncRunTimeState(resumed);
        } catch { /* non-fatal — tracking will still work manually */ }
      }

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

    // Repeatable step: advance iteration before leaving the step
    const stepHasFeatureLink = (currentStep.inputs ?? []).some((i) => i.featureId && (featureSelections ?? []).some((s) => s.featureId === i.featureId && s.activeCount > 0))
      || (currentStep.captureFields ?? []).some((cf) => cf.featureId && (featureSelections ?? []).some((s) => s.featureId === cf.featureId && s.activeCount > 0));
    if ((stepHasFeatureLink || currentStep.repeatable) && repeatCounts[currentStep.id]) {
      const count = repeatCounts[currentStep.id];
      const cur = repeatIter[currentStep.id] ?? 0;
      if (cur + 1 < count) {
        setRepeatIter((prev) => ({ ...prev, [currentStep.id]: cur + 1 }));
        return;
      }
    }

    if (isLastStep || !currentStep.nextStepId) {
      autosaveProgress();
      setStage("summary");
    } else {
      const nextStepId = currentStep.nextStepId;
      const nextHistory = [...history, currentStep.id];
      setHistory(nextHistory);
      setCurrentStepId(nextStepId);
      // Reset iteration for the next step if it's repeatable
      setRepeatIter((prev) => ({ ...prev, [nextStepId]: 0 }));
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
    const dataSteps: StepCapture[] = [];
    for (const step of stepsSorted) {
      const hasFeatureLink = (step.inputs ?? []).some((i) => i.featureId && (featureSelections ?? []).some((s) => s.featureId === i.featureId && s.activeCount > 0))
        || (step.captureFields ?? []).some((cf) => cf.featureId && (featureSelections ?? []).some((s) => s.featureId === cf.featureId && s.activeCount > 0));
      if ((hasFeatureLink || step.repeatable) && repeatCounts[step.id]) {
        const count = repeatCounts[step.id];
        for (let i = 0; i < count; i++) {
          const iterKey = `${step.id}__iter__${i}`;
          const iterValues = values[iterKey] ?? {};
          if (Object.keys(iterValues).length > 0)
            dataSteps.push({ stepId: step.id, values: iterValues, completedAt: new Date().toISOString(), iterationIndex: i });
        }
      } else {
        const v = values[step.id] ?? {};
        if (Object.keys(v).length > 0)
          dataSteps.push({ stepId: step.id, values: v, completedAt: new Date().toISOString() });
      }
    }

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
      // Include qty modifications as observation issues so they appear in reports
      const qtyModIssues: RunIssue[] = Object.values(qtyModifications).map((mod) => ({
        id: `qty-mod-${mod.stepId}`,
        description: `[Qty Modification] ${mod.featureName}: expected ${mod.expectedQty}, installed ${mod.actualQty}. Reason: ${mod.reason}`,
        issueType: "observation" as const,
        severity: "low" as const,
        stepId: mod.stepId,
        reportedAt: mod.modifiedAt,
        resolved: true,
        isBlocking: false,
        createdBy: currentUserName,
      }));
      const allIssues = [...issues, ...qtyModIssues];
      const issuesJson = JSON.stringify(allIssues);
      const bomJson = bomActual.length > 0 ? JSON.stringify(bomActual) : undefined;

      if (activeRunId) {
        // Flush any queued time-tracking actions before locking — run rejects changes once locked.
        await flushTimeQueue();
        const lockedRun = await assetWorkflowRunService.completeRun(activeRunId, stepsJson, issuesJson, currentUserName, bomJson);
        setActiveRun(lockedRun);
      }
      // Note: if no activeRunId (preview mode), skip signature stages
      setSaved(true);
      onComplete?.(extractFeatureValues());

      if (activeRunId) {
        // Pre-fill installer name and transition to sign-off
        setInstName(currentUserName ?? "");
        setStage("installer-sign");
      } else {
        setTimeout(() => handleClose(), 1200);
      }
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

  async function handleInstallerSign() {
    if (!activeRunId || !instName.trim()) return;
    setInstSaving(true);
    setInstError(null);
    try {
      await signatureService.submitSignature(activeRunId, {
        signerRole: "Installer",
        signerName: instName.trim(),
        signatureData: instPadData ?? undefined,
        reasonCode: instOutcome,
        notes: instNotes.trim() || undefined,
        consentConfirmed: true,
      });
      // Advance to customer sign step
      setCustMode("options");
      setCustPadData(null);
      setCustName(""); setCustTitle(""); setCustEmail(""); setCustNotes("");
      setLinkEmail(""); setLinkName(""); setLinkSent(false);
      setStage("customer-sign");
    } catch {
      setInstError("Failed to submit signature. Check your connection and try again.");
    } finally {
      setInstSaving(false);
    }
  }

  async function handleCustomerSignNow() {
    if (!activeRunId || !custName.trim()) return;
    setCustSaving(true);
    setCustError(null);
    try {
      await signatureService.submitSignature(activeRunId, {
        signerRole: "Customer",
        signerName: custName.trim(),
        signerEmail: custEmail.trim() || undefined,
        signerTitle: custTitle.trim() || undefined,
        signatureData: custPadData ?? undefined,
        reasonCode: custOutcome,
        notes: custNotes.trim() || undefined,
        consentConfirmed: true,
      });
      handleClose();
    } catch {
      setCustError("Failed to submit signature. Check your connection and try again.");
    } finally {
      setCustSaving(false);
    }
  }

  async function handleSendLink() {
    if (!activeRunId || !linkEmail.trim()) return;
    setLinkSending(true);
    setCustError(null);
    try {
      await signatureService.createToken({
        runId: activeRunId,
        recipientEmail: linkEmail.trim(),
        recipientName: linkName.trim() || undefined,
        expiresInHours: linkHours,
        customMessage: linkMsg.trim() || undefined,
      });
      setLinkSent(true);
    } catch {
      setCustError("Failed to send signature link. Check your connection and try again.");
    } finally {
      setLinkSending(false);
    }
  }

  async function handleWaiveCustomerSignature() {
    if (!activeRunId) { handleClose(); return; }
    try {
      await assetWorkflowRunService.waiveCustomerSignature(activeRunId);
    } catch { /* non-critical — close anyway */ }
    handleClose();
  }

  // ---------------------------------------------------------------
  // Render input
  // ---------------------------------------------------------------
  function renderInput(step: WorkflowStep, inp: StepInput, stepIdOverride?: string) {
    const sid = stepIdOverride ?? step.id;
    const val = getInputValue(sid, inp.id);
    const onChange = (v: string) => setInputValue(sid, inp.id, v);
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
    if (inp.type === "photo" || inp.type === "video") {
      const isVideo = inp.type === "video";
      let media: string[] = [];
      try { media = JSON.parse(val || "[]"); } catch {}
      return (
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Button
            size="small"
            variant="outlined"
            component="label"
            startIcon={isVideo ? <VideocamOutlined /> : <PhotoCameraOutlined />}
          >
            {media.length > 0 ? (isVideo ? "Add video" : "Add photo") : (isVideo ? "Capture video" : "Capture photo")}
            <input
              type="file"
              accept={isVideo ? "video/*" : "image/*"}
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => { onChange(JSON.stringify([...media, reader.result as string])); };
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
          </Button>
          <QRUploadButton
            docType="workflow-evidence"
            linkedTo={inp.label}
            label="Upload from Phone"
            onUploaded={() => { /* handled by onUploadedWithData */ }}
            onUploadedWithData={(_, dataUrl) => {
              onChange(JSON.stringify([...media, dataUrl]));
            }}
          />
          </Stack>
          {media.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
              {media.map((src, idx) => (
                <Box key={idx} sx={{ position: "relative" }}>
                  {isVideo
                    ? <Box component="video" src={src} controls sx={{ width: 160, height: 90, borderRadius: 1, border: "1px solid rgba(255,255,255,0.12)" }} />
                    : <Box component="img" src={src} sx={{ width: 80, height: 60, objectFit: "cover", borderRadius: 1, border: "1px solid rgba(255,255,255,0.12)" }} />
                  }
                  <IconButton
                    size="small"
                    onClick={() => onChange(JSON.stringify(media.filter((_, i) => i !== idx)))}
                    sx={{ position: "absolute", top: -8, right: -8, background: "rgba(0,0,0,0.7)", padding: "2px" }}
                  >
                    <DeleteOutlineOutlined sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      );
    }
    if (inp.type === "signature") {
      return (
        <Box>
          {val ? (
            <Box>
              <Box component="img" src={val} sx={{ maxWidth: "100%", height: 100, borderRadius: 1, border: "1px solid rgba(255,255,255,0.12)", display: "block", mb: 1 }} />
              <Button size="small" variant="outlined" onClick={() => onChange("")}>Clear signature</Button>
            </Box>
          ) : (
            <SignaturePad onChange={(dataUrl) => onChange(dataUrl ?? "")} height={120} label="Sign here" />
          )}
        </Box>
      );
    }
    return (
      <TextField size="small" fullWidth error={isReq} placeholder="Enter text"
        value={val} onChange={(e) => onChange(e.target.value)} />
    );
  }

  function renderCaptureField(step: WorkflowStep, field: CaptureField, stepIdOverride?: string) {
    const sid = stepIdOverride ?? step.id;
    const val = getInputValue(sid, field.id);
    const onChange = (v: string) => setInputValue(sid, field.id, v);
    const isReq = field.required && !val.trim();

    if (field.type === "scan") {
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Scan barcode / QR (or type manually)">
            <IconButton size="small"><QrCodeScannerOutlined fontSize="small" /></IconButton>
          </Tooltip>
          <TextField size="small" fullWidth error={isReq}
            placeholder={field.hint || "Scan or enter value"}
            value={val} onChange={(e) => onChange(e.target.value)} />
        </Stack>
      );
    }
    if (field.type === "date") {
      return (
        <TextField size="small" type="date" fullWidth error={isReq}
          value={val} onChange={(e) => onChange(e.target.value)} InputLabelProps={{ shrink: true }} />
      );
    }
    if (field.type === "number") {
      return (
        <TextField size="small" fullWidth type="number" error={isReq}
          placeholder={field.hint || field.unit || ""}
          value={val} onChange={(e) => onChange(e.target.value)} />
      );
    }
    return (
      <TextField size="small" fullWidth error={isReq}
        placeholder={field.hint || "Enter value"}
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
    const hasCaptureFields = (currentStep.captureFields ?? []).length > 0;
    const hasDecisions = currentStep.decisionsEnabled && (currentStep.decisions ?? []).length > 0;
    const isLast = !hasDecisions && !currentStep.nextStepId;
    const blockingCount = issues.filter((i) => i.isBlocking && !i.resolved).length;

    // Feature-linked repeatable step — derived from inputs or capture fields with featureId
    const derivedFeatureLink = (() => {
      // Check inputs first
      for (const inp of currentStep.inputs ?? []) {
        if (inp.featureId) {
          const sel = (featureSelections ?? []).find((s) => s.featureId === inp.featureId && s.activeCount > 0);
          const feat = (productFeatures ?? []).find((f) => f.id === inp.featureId);
          if (sel && feat) return { feature: feat, sel };
        }
      }
      // Then capture fields
      for (const cf of currentStep.captureFields ?? []) {
        if (cf.featureId) {
          const sel = (featureSelections ?? []).find((s) => s.featureId === cf.featureId && s.activeCount > 0);
          const feat = (productFeatures ?? []).find((f) => f.id === cf.featureId);
          if (sel && feat) return { feature: feat, sel };
        }
      }
      return null;
    })();
    const linkedFeature = derivedFeatureLink?.feature ?? null;
    const linkedFeatureSel = derivedFeatureLink?.sel ?? null;
    const expectedQty = linkedFeatureSel?.activeCount ?? 1;
    const activeQtyMod = linkedFeature ? qtyModifications[currentStep.id] : undefined;
    const confirmedQty = activeQtyMod?.actualQty ?? expectedQty;

    // Repeatable step: derive effective step ID (iteration-scoped values key)
    const isFeatureRepeatable = !!linkedFeature;
    const isLegacyRepeatable = !isFeatureRepeatable && !!currentStep.repeatable;
    const repeatCount = (isFeatureRepeatable || isLegacyRepeatable) ? (repeatCounts[currentStep.id] ?? 0) : 0;
    const repeatIdx = (isFeatureRepeatable || isLegacyRepeatable) ? (repeatIter[currentStep.id] ?? 0) : 0;
    // For feature-linked: needsCountPicker = needs confirmation (not a free count entry)
    const needsConfirmation = isFeatureRepeatable && repeatCount === 0;
    const needsCountPicker = isLegacyRepeatable && repeatCount === 0;
    const unitLabel = linkedFeature?.name ?? currentStep.repeatLabel ?? "Unit";
    const effectiveStepId = (isFeatureRepeatable || isLegacyRepeatable) && repeatCount > 0
      ? `${currentStep.id}__iter__${repeatIdx}`
      : currentStep.id;

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
              {/* Time tracking bar — colour-coded, always visible */}
              <Box sx={{
                display: "flex", alignItems: "center", gap: 1.5,
                px: 1.5, py: 0.75, borderRadius: 1.5,
                bgcolor: trackingCategory === "downtime" ? "warning.main"
                  : trackingCategory === "productive" ? "success.dark"
                  : "action.selected",
                transition: "background-color 0.4s ease",
              }}>
                <Box sx={{
                  width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                  bgcolor: trackingCategory ? "#fff" : "text.disabled",
                  animation: trackingCategory ? "timepulse 1.2s ease-in-out infinite" : "none",
                  "@keyframes timepulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.25 } },
                }} />
                <Typography variant="caption" fontWeight={700} sx={{ color: trackingCategory ? "#fff" : "text.secondary", minWidth: 64 }}>
                  {trackingCategory === "productive" ? "Productive" : trackingCategory === "downtime" ? "Downtime" : "Idle"}
                </Typography>
                <Box sx={{ display: "flex", gap: 2, ml: "auto" }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.82rem", letterSpacing: 1, color: trackingCategory === "productive" ? "#fff" : "text.secondary" }}>
                      {formatDuration(productiveSecondsLive)}
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ fontSize: "0.62rem", color: trackingCategory === "productive" ? "rgba(255,255,255,0.7)" : "text.disabled" }}>productive</Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography sx={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.82rem", letterSpacing: 1, color: trackingCategory === "downtime" ? "#fff" : "text.secondary" }}>
                      {formatDuration(downtimeSecondsLive)}
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ fontSize: "0.62rem", color: trackingCategory === "downtime" ? "rgba(255,255,255,0.7)" : "text.disabled" }}>downtime</Typography>
                  </Box>
                </Box>
              </Box>
              {/* Offline / sync status row */}
              <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
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
              {/* Controls row — single toggle button */}
              <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap>
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  sx={{ opacity: 0.65, fontSize: "0.72rem" }}
                  onClick={() => setTimeEditorOpen(true)}
                >
                  Edit Times
                </Button>
                {/* Single toggle: downtime ↔ productive */}
                {trackingCategory === "downtime" ? (
                  <Button
                    size="small"
                    color="success"
                    variant="contained"
                    disabled={trackingBusy}
                    startIcon={trackingBusy ? <CircularProgress size={12} color="inherit" /> : <PlayArrowOutlined />}
                    onClick={() => { void trackRunTime("ResumeProductive"); }}
                  >
                    Resume Productive
                  </Button>
                ) : (
                  <Button
                    size="small"
                    color={trackingCategory === "productive" ? "warning" : "success"}
                    variant="outlined"
                    disabled={trackingBusy}
                    startIcon={trackingBusy ? <CircularProgress size={12} color="inherit" /> : trackingCategory === "productive" ? <PauseOutlined /> : <PlayArrowOutlined />}
                    onClick={(e) => setReasonPopoverAnchor(e.currentTarget)}
                  >
                    {trackingCategory === "productive" ? "Start Downtime" : "Start Productive"}
                  </Button>
                )}
              </Stack>
              {/* Downtime reason popover */}
              <Popover
                open={Boolean(reasonPopoverAnchor)}
                anchorEl={reasonPopoverAnchor}
                onClose={() => { setReasonPopoverAnchor(null); setDowntimeReason(""); }}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                slotProps={{ paper: { sx: { p: 2, width: 300 } } }}
              >
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">
                    {trackingCategory === "productive" ? "Downtime reason" : "Start productive tracking"}
                  </Typography>
                  {trackingCategory === "productive" && (
                    <TextField
                      autoFocus
                      size="small"
                      fullWidth
                      label="Reason"
                      placeholder="Waiting for parts / access / permit…"
                      value={downtimeReason}
                      onChange={(e) => setDowntimeReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && downtimeReason.trim()) {
                          setReasonPopoverAnchor(null);
                          void trackRunTime("StartDowntime", downtimeReason.trim());
                        }
                      }}
                    />
                  )}
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" onClick={() => { setReasonPopoverAnchor(null); setDowntimeReason(""); }}>
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color={trackingCategory === "productive" ? "warning" : "success"}
                      disabled={trackingCategory === "productive" && !downtimeReason.trim()}
                      onClick={() => {
                        setReasonPopoverAnchor(null);
                        if (trackingCategory === "productive") {
                          void trackRunTime("StartDowntime", downtimeReason.trim());
                        } else {
                          void trackRunTime("ResumeProductive");
                        }
                      }}
                    >
                      {trackingCategory === "productive" ? "Start Downtime" : "Start Productive"}
                    </Button>
                  </Stack>
                </Stack>
              </Popover>
            </Stack>
          )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>

            {/* Feature-linked repeatable step — qty confirmation panel */}
            {needsConfirmation && (
              <Paper variant="outlined" sx={{ p: 2, borderColor: "primary.light" }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip size="small" color="primary" label={unitLabel} />
                    <Typography variant="subtitle2">
                      Confirm installed quantity
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Typography variant="body2">
                      Expected: <strong>{confirmedQty} {unitLabel}{confirmedQty !== 1 ? "s" : ""}</strong>
                    </Typography>
                    {activeQtyMod && (
                      <Chip
                        size="small"
                        color="warning"
                        label={`Modified: ${activeQtyMod.actualQty} (was ${activeQtyMod.expectedQty})`}
                      />
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1.5}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => {
                        setRepeatCounts((p) => ({ ...p, [currentStep.id]: confirmedQty }));
                        setRepeatIter((p) => ({ ...p, [currentStep.id]: 0 }));
                      }}
                    >
                      Confirm {confirmedQty} {unitLabel}{confirmedQty !== 1 ? "s" : ""}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="warning"
                      onClick={() => {
                        setModifyQtyStepId(currentStep.id);
                        setModifyQtyValue(confirmedQty);
                        setModifyQtyReason(activeQtyMod?.reason ?? "");
                        setModifyQtyOpen(true);
                      }}
                    >
                      Modify qty
                    </Button>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    You'll capture data once for each {unitLabel.toLowerCase()}.
                    If there is a discrepancy, use "Modify qty" to record the actual count.
                  </Typography>
                </Stack>
              </Paper>
            )}

            {/* Legacy repeatable step — count picker */}
            {needsCountPicker && (
              <Paper variant="outlined" sx={{ p: 2, borderColor: "primary.light" }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">
                    How many {unitLabel}s are you installing?
                  </Typography>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <TextField
                      size="small"
                      type="number"
                      label={`${unitLabel} count`}
                      value={repeatPickerCount}
                      onChange={(e) => setRepeatPickerCount(Math.max(1, Number(e.target.value) || 1))}
                      inputProps={{ min: 1, max: 99 }}
                      sx={{ width: 130 }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => {
                        setRepeatCounts((p) => ({ ...p, [currentStep.id]: repeatPickerCount }));
                        setRepeatIter((p) => ({ ...p, [currentStep.id]: 0 }));
                      }}
                    >
                      Start
                    </Button>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    You'll complete this step once for each {unitLabel.toLowerCase()}.
                  </Typography>
                </Stack>
              </Paper>
            )}

            {/* Repeatable step — iteration header */}
            {(isFeatureRepeatable || isLegacyRepeatable) && repeatCount > 0 && (
              <Paper variant="outlined" sx={{ p: 1.25, bgcolor: "primary.50", borderColor: "primary.light" }}>
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    size="small"
                    color="primary"
                    label={`${unitLabel} ${repeatIdx + 1} of ${repeatCount}`}
                    sx={{ fontWeight: 600 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Complete fields for this {unitLabel.toLowerCase()}, then press Next to continue.
                  </Typography>
                  {isFeatureRepeatable && activeQtyMod && (
                    <Chip size="small" color="warning" variant="outlined"
                      label={`Qty modified (was ${activeQtyMod.expectedQty})`} />
                  )}
                </Stack>
              </Paper>
            )}

            {/* Step content — hidden until count is confirmed for repeatable steps */}
            {!needsConfirmation && !needsCountPicker && (
              <>
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
                          {renderInput(currentStep, inp, effectiveStepId)}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                )}

                {/* Capture fields — structured data for the as-built document */}
                {hasCaptureFields && (
                  <Stack spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "secondary.main", flexShrink: 0 }} />
                      <Typography variant="caption" fontWeight={700} color="secondary.main" sx={{ letterSpacing: 0.5 }}>
                        AS-BUILT DATA CAPTURE
                      </Typography>
                    </Stack>
                    <Stack spacing={1.5}>
                      {(currentStep.captureFields ?? []).map((field) => (
                        <Paper key={field.id} variant="outlined" sx={{ p: 1.5, borderColor: "secondary.main", borderStyle: "dashed", opacity: 0.9 }}>
                          <Stack spacing={1}>
                            <Typography variant="caption" color="text.secondary">
                              {field.label || "Capture Field"}
                              {field.unit && (
                                <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                                  ({field.unit})
                                </Typography>
                              )}
                              {field.required && (
                                <Typography component="span" variant="caption" color="error" sx={{ ml: 0.5 }}>*</Typography>
                              )}
                            </Typography>
                            {renderCaptureField(currentStep, field, effectiveStepId)}
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  </Stack>
                )}

                {requiredWarning && (
                  <Alert severity="warning" sx={{ fontSize: 12 }}>
                    Some required fields are empty — you can still proceed and save.
                  </Alert>
                )}
              </>
            )}
          </Stack>

          {/* Flag issue inline form — inside DialogContent so it scrolls with the page */}
          <Collapse in={flagOpen}>
          <Box sx={{ pt: 2 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Typography variant="caption" fontWeight={700} color="error" display="block" mb={0.5}>
              Flag issue on this step
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.25}>
              <strong>High</strong> severity = <strong>blocking</strong> — workflow cannot be completed until resolved.&nbsp;
              <strong>Medium</strong> or <strong>Low</strong> = observation — noted but does not block completion.
            </Typography>
            <Stack spacing={1.25}>
              {/* Severity selector */}
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <InputLabel>Severity</InputLabel>
                  <Select
                    label="Severity"
                    value={flagSeverity}
                    onChange={(e) => setFlagSeverity(e.target.value as "low" | "medium" | "high")}
                  >
                    <MenuItem value="low">Low — observation, non-blocking</MenuItem>
                    <MenuItem value="medium">Medium — attention needed, non-blocking</MenuItem>
                    <MenuItem value="high">High — blocks completion</MenuItem>
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={flagIsScopeDeviation}
                      onChange={(e) => setFlagIsScopeDeviation(e.target.checked)}
                    />
                  }
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="caption">Scope variation</Typography>
                      <AttachMoneyOutlined sx={{ fontSize: 13, color: "text.disabled" }} />
                      <AccessTimeOutlined sx={{ fontSize: 13, color: "text.disabled" }} />
                    </Stack>
                  }
                />
              </Stack>
              {flagIsScopeDeviation && (
                <Typography variant="caption" color="warning.main" display="block">
                  Work discovered outside the original scope (e.g. additional cabling, unforeseen access requirements). This is a scope variation.
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
                                    label={issue.issueType === "scope-deviation" ? "Scope Var." : issue.isBlocking ? "Blocking" : "Observation"}
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
                label={flagIssueType === "scope-deviation" ? "Describe the scope variation" : "Describe/Add issue here"}
                placeholder={flagIssueType === "scope-deviation" ? "e.g. Additional conduit run required due to obstructed original route…" : "Describe what you observed…"}
                value={flagDescription}
                onChange={(e) => { setFlagDescription(e.target.value); setFlagSubmitted(false); }}
              />
              {flagIsScopeDeviation && (
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
              <MediaCapture
                media={flagMedia}
                onChange={setFlagMedia}
                label="Attach Photo / Video (optional)"
              />
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
        </DialogContent>

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
            {!needsConfirmation && !needsCountPicker && (hasDecisions ? (
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
                {(isFeatureRepeatable || isLegacyRepeatable) && repeatCount > 0 && repeatIdx + 1 < repeatCount
                  ? `Next ${unitLabel} →`
                  : isLast ? "Complete ✓" : "Next step →"}
              </Button>
            ))}
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
                      · {issues.filter((i) => i.issueType === "scope-deviation").length} scope variation{issues.filter((i) => i.issueType === "scope-deviation").length !== 1 ? "s" : ""}
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
                                  label={issue.issueType === "scope-deviation" ? "Scope Var." : issue.isBlocking ? "Blocking" : "Observation"}
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

            {/* Qty modifications summary */}
            {Object.keys(qtyModifications).length > 0 && (
              <Stack spacing={1}>
                <Divider />
                <Typography variant="subtitle2" color="warning.main">
                  Qty modifications ({Object.keys(qtyModifications).length})
                </Typography>
                {Object.values(qtyModifications).map((mod) => (
                  <Paper key={mod.stepId} variant="outlined" sx={{ p: 1.25, borderColor: "warning.main" }}>
                    <Stack spacing={0.25}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Chip size="small" color="warning" label="Qty Modified" />
                        <Typography variant="caption" fontWeight={600}>{mod.featureName}</Typography>
                      </Stack>
                      <Typography variant="caption">
                        Expected: <strong>{mod.expectedQty}</strong> → Installed: <strong>{mod.actualQty}</strong>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">Reason: {mod.reason}</Typography>
                    </Stack>
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
        <DialogActions sx={{ justifyContent: "space-between" }}>
          <Button onClick={handleClose} disabled={saving}>
            {saved ? "Close" : "Discard"}
          </Button>
          {!saved && (
            <Stack direction="row" spacing={1}>
              {hasBlockingIssues && Boolean(activeRunId) && (
                <Button
                  variant="outlined"
                  color="warning"
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={14} /> : undefined}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const stepsJson = JSON.stringify(buildStepsData());
                      const issuesJson = JSON.stringify(issues);
                      await assetWorkflowRunService.saveProgress(activeRunId!, stepsJson, issuesJson, "InProgress");
                      handleClose();
                    } catch { setSaveError("Failed to save progress."); }
                    finally { setSaving(false); }
                  }}
                >
                  Save & close
                </Button>
              )}
              <Button
                variant="contained"
                onClick={() => {
                  const hasBom = (workflow.bomItems ?? []).length > 0;
                  if (hasBom && activeRunId) {
                    setBomActual((workflow.bomItems ?? []).map((item) => ({
                      bomItemId: item.id,
                      description: item.description,
                      isInventory: item.isInventory,
                      expectedQty: item.expectedQty,
                      actualQty: item.expectedQty,
                      unitOfMeasure: item.unitOfMeasure,
                      unitCaptures: item.isInventory
                        ? Array.from({ length: item.expectedQty }, () =>
                            Object.fromEntries((item.captureFields ?? ["Serial No"]).map((f) => [f, ""])))
                        : undefined,
                    })));
                    setStage("bom");
                  } else {
                    handleSave();
                  }
                }}
                disabled={saving || (hasBlockingIssues && Boolean(activeRunId))}
                startIcon={saving ? <CircularProgress size={14} /> : undefined}
              >
                {saving ? "Saving…" : activeRunId ? "Lock run ✓" : "Done (preview)"}
              </Button>
            </Stack>
          )}
        </DialogActions>
      </>
    );
  }

  // ── Stage: BOM confirmation ───────────────────────────────────────────────
  function renderBom() {
    const bomItems = workflow.bomItems ?? [];
    return (
      <>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CheckCircleOutlined color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>Confirm Parts Used</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Verify the parts installed. Adjust quantities and enter serial numbers where required.
            </Typography>
            {bomItems.map((item) => {
              const actual = bomActual.find((a) => a.bomItemId === item.id);
              if (!actual) return null;
              return (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Chip label={item.isInventory ? "Inventory" : "Consumable"} size="small"
                        color={item.isInventory ? "primary" : "default"} variant="outlined" />
                      <Typography variant="body2" fontWeight={600}>{item.description}</Typography>
                      {item.partNumber && (
                        <Typography variant="caption" color="text.secondary">· {item.partNumber}</Typography>
                      )}
                    </Stack>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <TextField
                        label="Actual qty"
                        size="small"
                        type="number"
                        sx={{ width: 100 }}
                        value={actual.actualQty}
                        onChange={(e) => {
                          const qty = Math.max(0, Number(e.target.value) || 0);
                          setBomActual((prev) => prev.map((a) => a.bomItemId !== item.id ? a : {
                            ...a, actualQty: qty,
                            unitCaptures: item.isInventory
                              ? Array.from({ length: qty }, (_, i) =>
                                  a.unitCaptures?.[i] ?? Object.fromEntries((item.captureFields ?? ["Serial No"]).map((f) => [f, ""])))
                              : undefined,
                          }));
                        }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        of {item.expectedQty} {item.unitOfMeasure} expected
                      </Typography>
                    </Stack>
                    {item.isInventory && (actual.unitCaptures ?? []).map((fields, unitIdx) => (
                      <Stack key={unitIdx} spacing={0.75} sx={{ pl: 1, borderLeft: "2px solid", borderColor: "divider" }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                          Unit {unitIdx + 1}
                        </Typography>
                        {(item.captureFields ?? ["Serial No"]).map((fieldName) => (
                          <Stack key={fieldName} direction="row" spacing={1} alignItems="center">
                            {fieldName.toLowerCase().includes("serial") && (
                              <Tooltip title="Scan barcode / QR">
                                <IconButton size="small"><QrCodeScannerOutlined fontSize="small" /></IconButton>
                              </Tooltip>
                            )}
                            <TextField
                              label={fieldName}
                              size="small"
                              fullWidth
                              placeholder={`Enter ${fieldName}`}
                              value={fields[fieldName] ?? ""}
                              onChange={(e) => setBomActual((prev) => prev.map((a) => {
                                if (a.bomItemId !== item.id) return a;
                                const caps = [...(a.unitCaptures ?? [])];
                                caps[unitIdx] = { ...caps[unitIdx], [fieldName]: e.target.value };
                                return { ...a, unitCaptures: caps };
                              }))}
                            />
                          </Stack>
                        ))}
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStage("summary")} disabled={saving}>Back</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} /> : undefined}
          >
            {saving ? "Saving…" : "Complete & sign"}
          </Button>
        </DialogActions>
      </>
    );
  }

  // ── Stage: installer sign-off ────────────────────────────────────────────
  function renderInstallerSign() {
    return (
      <>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <DrawOutlined color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>Installer sign-off</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Step {stepsSorted.length + 1} of {stepsSorted.length + 2} — sign to confirm workflow completion
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {bomActual.length > 0 && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Parts installed</Typography>
                {bomActual.map((item) => (
                  <Stack key={item.bomItemId} spacing={0.5}
                    sx={{ p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Chip size="small" label={item.isInventory ? "Inventory" : "Consumable"}
                        color={item.isInventory ? "primary" : "default"} variant="outlined" />
                      <Typography variant="body2" fontWeight={600}>{item.description}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        · {item.actualQty} {item.unitOfMeasure}
                      </Typography>
                    </Stack>
                    {item.isInventory && (item.unitCaptures ?? []).map((fields, i) => (
                      <Stack key={i} direction="row" flexWrap="wrap" gap={1} sx={{ pl: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50 }}>
                          Unit {i + 1}:
                        </Typography>
                        {Object.entries(fields).filter(([, v]) => v).map(([field, val]) => (
                          <Typography key={field} variant="caption">
                            <strong>{field}:</strong> {val}
                          </Typography>
                        ))}
                      </Stack>
                    ))}
                  </Stack>
                ))}
                <Divider />
              </Stack>
            )}
            <TextField label="Your name *" size="small" fullWidth
              value={instName} onChange={e => setInstName(e.target.value)} />
            <Stack direction="row" spacing={1}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>Outcome</Typography>
                <Select size="small" fullWidth value={instOutcome}
                  onChange={e => setInstOutcome(e.target.value as typeof instOutcome)}>
                  <MenuItem value="Completed">Completed — work done as specified</MenuItem>
                  <MenuItem value="Conditional">Conditional — completed with conditions</MenuItem>
                </Select>
              </Box>
            </Stack>
            <SignaturePad
              label="Draw your signature below (optional)"
              onChange={instPadOnChange.current}
              height={140}
            />
            <TextField label="Notes (optional)" size="small" fullWidth multiline minRows={2}
              value={instNotes} onChange={e => setInstNotes(e.target.value)} />
            {instError && <Alert severity="error" sx={{ fontSize: 12 }}>{instError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Skip &amp; close</Button>
          <Button variant="contained" onClick={handleInstallerSign}
            disabled={instSaving || !instName.trim()}
            startIcon={instSaving ? <CircularProgress size={14} /> : undefined}>
            {instSaving ? "Signing…" : "Sign &amp; continue"}
          </Button>
        </DialogActions>
      </>
    );
  }

  // ── Stage: customer sign-off ──────────────────────────────────────────────
  function renderCustomerSign() {
    return (
      <>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <DrawOutlined color="success" />
            <Typography variant="subtitle1" fontWeight={600}>Customer sign-off</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Step {stepsSorted.length + 2} of {stepsSorted.length + 2} — customer approval
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>

            {/* Option buttons */}
            {custMode === "options" && (
              <Stack spacing={1.5}>
                <Button fullWidth variant="outlined" size="large"
                  startIcon={<DrawOutlined />}
                  onClick={() => setCustMode("sign-now")}
                  sx={{ justifyContent: "flex-start", textTransform: "none", py: 1.5 }}>
                  <Box sx={{ textAlign: "left" }}>
                    <Typography variant="body2" fontWeight={600}>Sign here now</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Customer is present — hand them the device to sign
                    </Typography>
                  </Box>
                </Button>
                <Button fullWidth variant="outlined" size="large"
                  startIcon={<EmailOutlined />}
                  onClick={() => setCustMode("send-link")}
                  sx={{ justifyContent: "flex-start", textTransform: "none", py: 1.5 }}>
                  <Box sx={{ textAlign: "left" }}>
                    <Typography variant="body2" fontWeight={600}>Send signature link</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Email a secure link — run stays pending until customer signs
                    </Typography>
                  </Box>
                </Button>
                <Button fullWidth variant="text" size="large"
                  onClick={handleWaiveCustomerSignature}
                  sx={{ justifyContent: "flex-start", textTransform: "none", color: "text.secondary" }}>
                  <Box sx={{ textAlign: "left" }}>
                    <Typography variant="body2">Skip — no customer signature required</Typography>
                    <Typography variant="caption" color="text.disabled">
                      Run completes without customer approval
                    </Typography>
                  </Box>
                </Button>
              </Stack>
            )}

            {/* Sign now */}
            {custMode === "sign-now" && (
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1}>
                  <TextField label="Customer name *" size="small" fullWidth
                    value={custName} onChange={e => setCustName(e.target.value)} />
                  <TextField label="Title / Role" size="small" fullWidth
                    value={custTitle} onChange={e => setCustTitle(e.target.value)} />
                </Stack>
                <TextField label="Email (optional)" size="small" fullWidth
                  value={custEmail} onChange={e => setCustEmail(e.target.value)} />
                <Select size="small" fullWidth value={custOutcome}
                  onChange={e => setCustOutcome(e.target.value as typeof custOutcome)}>
                  <MenuItem value="Completed">Completed — work accepted</MenuItem>
                  <MenuItem value="Conditional">Conditional — accepted with conditions</MenuItem>
                  <MenuItem value="Declined">Declined — work not accepted</MenuItem>
                </Select>
                <SignaturePad
                  label="Customer signature (optional)"
                  onChange={custPadOnChange.current}
                  height={140}
                />
                <TextField label="Notes (optional)" size="small" fullWidth multiline minRows={2}
                  value={custNotes} onChange={e => setCustNotes(e.target.value)} />
              </Stack>
            )}

            {/* Send link */}
            {custMode === "send-link" && !linkSent && (
              <Stack spacing={1.5}>
                <Alert severity="info" sx={{ fontSize: 12 }}>
                  The customer will receive a secure link to review and sign the completed workflow documentation.
                </Alert>
                <TextField label="Recipient email *" size="small" fullWidth
                  value={linkEmail} onChange={e => setLinkEmail(e.target.value)} />
                <TextField label="Recipient name" size="small" fullWidth
                  value={linkName} onChange={e => setLinkName(e.target.value)} />
                <TextField label="Link expires in (hours)" type="number" size="small" fullWidth
                  value={linkHours} onChange={e => setLinkHours(Number(e.target.value))} />
                <TextField label="Message to customer (optional)" size="small" fullWidth
                  multiline minRows={3} value={linkMsg} onChange={e => setLinkMsg(e.target.value)} />
              </Stack>
            )}

            {linkSent && (
              <Alert severity="success" sx={{ fontSize: 12 }}>
                Signature link sent to {linkEmail}. The run will update automatically when the customer signs.
              </Alert>
            )}

            {custError && <Alert severity="error" sx={{ fontSize: 12 }}>{custError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          {custMode !== "options" && !linkSent && (
            <Button onClick={() => { setCustMode("options"); setCustError(null); }}>Back</Button>
          )}
          <Button onClick={handleClose}>
            {linkSent ? "Close" : "Close without signing"}
          </Button>
          {custMode === "sign-now" && (
            <Button variant="contained" onClick={handleCustomerSignNow}
              disabled={custSaving || !custName.trim()}
              startIcon={custSaving ? <CircularProgress size={14} /> : undefined}>
              {custSaving ? "Signing…" : "Confirm signature"}
            </Button>
          )}
          {custMode === "send-link" && !linkSent && (
            <Button variant="contained" onClick={handleSendLink}
              disabled={linkSending || !linkEmail.trim()}
              startIcon={linkSending ? <CircularProgress size={14} /> : <EmailOutlined />}>
              {linkSending ? "Sending…" : "Send link"}
            </Button>
          )}
        </DialogActions>
      </>
    );
  }

  const issueForDetail = issueDetailId ? issues.find((i) => i.id === issueDetailId) ?? null : null;

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
        {stage === "setup"          && renderSetup()}
        {stage === "running"        && renderRunning()}
        {stage === "summary"        && renderSummary()}
        {stage === "bom"            && renderBom()}
        {stage === "installer-sign" && renderInstallerSign()}
        {stage === "customer-sign"  && renderCustomerSign()}
        {/* ── Persistent offline / sync bar ── */}
        {isRealRun && (!isOnline || pendingCount > 0 || syncing) && (
          <Box sx={{
            px: 2, py: 0.75,
            display: "flex", alignItems: "center", gap: 1,
            borderTop: "1px solid",
            borderColor: !isOnline ? "warning.dark" : "info.dark",
            background: !isOnline ? "rgba(237,108,2,0.13)" : syncing ? "rgba(2,136,209,0.1)" : "rgba(255,152,0,0.08)",
          }}>
            {syncing
              ? <SyncOutlined sx={{ fontSize: 16, color: "info.main", animation: "spin 1s linear infinite", "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } } }} />
              : <CloudOffOutlined sx={{ fontSize: 16, color: "warning.main" }} />
            }
            <Typography variant="caption" fontWeight={600} color={!isOnline ? "warning.main" : "info.main"} sx={{ flex: 1 }}>
              {syncing
                ? `Syncing ${pendingCount} queued action${pendingCount !== 1 ? "s" : ""}…`
                : !isOnline
                  ? `Offline${pendingCount > 0 ? ` — ${pendingCount} action${pendingCount !== 1 ? "s" : ""} queued` : ""}`
                  : `${pendingCount} action${pendingCount !== 1 ? "s" : ""} pending sync`}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {!isOnline ? "Will sync when reconnected" : ""}
            </Typography>
          </Box>
        )}
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

      {/* Modify qty dialog — for feature-linked repeatable steps */}
      <Dialog open={modifyQtyOpen} onClose={() => setModifyQtyOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Modify installed quantity</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ fontSize: 12 }}>
              This modification will be recorded in the run report for review.
            </Alert>
            <TextField
              size="small"
              type="number"
              label="Actual qty installed"
              value={modifyQtyValue}
              onChange={(e) => setModifyQtyValue(Math.max(1, Number(e.target.value) || 1))}
              inputProps={{ min: 1, max: 99 }}
              fullWidth
            />
            <TextField
              size="small"
              label="Reason for modification"
              value={modifyQtyReason}
              onChange={(e) => setModifyQtyReason(e.target.value)}
              placeholder="e.g. Only 3 cameras were delivered on site…"
              multiline
              rows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModifyQtyOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!modifyQtyReason.trim()}
            onClick={() => {
              if (!modifyQtyStepId) return;
              const step = stepsSorted.find((s) => s.id === modifyQtyStepId);
              // Derive feature from inputs or capture fields
              let feat: (typeof productFeatures extends undefined ? never : NonNullable<typeof productFeatures>[0]) | undefined;
              let expQty = 1;
              for (const inp of step?.inputs ?? []) {
                if (inp.featureId) {
                  const sel = (featureSelections ?? []).find((s) => s.featureId === inp.featureId && s.activeCount > 0);
                  const f = (productFeatures ?? []).find((f) => f.id === inp.featureId);
                  if (sel && f) { feat = f; expQty = sel.activeCount; break; }
                }
              }
              if (!feat) {
                for (const cf of step?.captureFields ?? []) {
                  if (cf.featureId) {
                    const sel = (featureSelections ?? []).find((s) => s.featureId === cf.featureId && s.activeCount > 0);
                    const f = (productFeatures ?? []).find((f) => f.id === cf.featureId);
                    if (sel && f) { feat = f; expQty = sel.activeCount; break; }
                  }
                }
              }
              setQtyModifications((prev) => ({
                ...prev,
                [modifyQtyStepId]: {
                  stepId: modifyQtyStepId,
                  featureId: feat?.id ?? "",
                  featureName: feat?.name ?? "Unknown",
                  expectedQty: expQty,
                  actualQty: modifyQtyValue,
                  reason: modifyQtyReason.trim(),
                  modifiedAt: new Date().toISOString(),
                },
              }));
              setModifyQtyOpen(false);
            }}
          >
            Save modification
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
