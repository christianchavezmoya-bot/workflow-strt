import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AccessTimeOutlined,
  AttachMoneyOutlined,
  CloudOffOutlined,
  CommentOutlined,
  DeleteOutlineOutlined,
  DrawOutlined,
  EditOutlined,
  EmailOutlined,
  PauseOutlined,
  PhotoCameraOutlined,
  PlayArrowOutlined,
  PlayCircleOutlineOutlined,
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
import type { Feature } from "../../types/feature";
import type { FeatureSelection } from "../../services/productConfigService";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { signatureService } from "../../services/signatureService";
import { featureService } from "../../services/featureService";
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";
import MediaCapture from "../../components/ui/MediaCapture";
import QRUploadButton from "../../components/QRUploadButton";
import WorkflowDateCapture from "../../components/ui/WorkflowDateCapture";
import WheelPicker from "../../components/ui/WheelPicker";
import TimeEntriesEditorDialog from "../../components/ui/TimeEntriesEditorDialog";
import DiagnosticClockBar from "../../components/ui/DiagnosticClockBar";
import SignaturePad from "../../components/ui/SignaturePad";
import { useAuth } from "../../hooks/useAuth";
import { useOfflineTimeQueue } from "../../hooks/useOfflineTimeQueue";
import { useProjectTimeZone } from "../../hooks/useProjectTimeZone";
import { canEditRun } from "../../utils/runEditPermissions";
import {
  getMissingWorkflowItems,
  getRunMissingMediaSteps,
  getRunMissingWorkflowItems,
  splitMissingItemsByGate,
  type MissingWorkflowItem,
} from "../../utils/workflowCompleteness";
import { measurePayload } from "../../utils/syncDiagnostics";
import {
  fileToDataUrl,
  prepareWorkflowMediaFile,
  WORKFLOW_VIDEO_MAX_BYTES,
  formatBytesLabel,
} from "../../utils/mediaProcessing";
import { API_LARGE_PAYLOAD_WARNING_BYTES } from "../../utils/syncPolicy";
import { isMobileNativePlatform } from "../../utils/platform";
import { NATIVE_BOTTOM_NAV_INSET, nativeDialogActionsSx, nativeDialogSx } from "../../utils/nativeDialogInsets";
import { nativeTooltipTouchProps } from "../../utils/nativeTooltipTouchProps";
import { randomId } from "../../utils/randomId";
import { markOfflinePerf } from "../../utils/offlinePerf";
import { formatInstant } from "../../utils/datetime";
import { shouldSkipRunMutation } from "../../services/connectivityMonitor";
import WorkOrderRunnerBomStage from "./WorkOrderRunnerBomStage";
import WorkOrderRunnerConsumablesStage, { type UnlistedConsumable } from "./WorkOrderRunnerConsumablesStage";
import WorkOrderRunnerCustomerSignStage from "./WorkOrderRunnerCustomerSignStage";
import WorkOrderRunnerInstallerSignStage from "./WorkOrderRunnerInstallerSignStage";
import WorkOrderRunnerSetupStage from "./WorkOrderRunnerSetupStage";
import WorkOrderRunnerSummaryStage from "./WorkOrderRunnerSummaryStage";
import {
  formatDuration,
  parseRunTimeEntries,
  renderAssetIdentifier,
  runnerBodyStackSx,
  runnerDialogContentSx,
} from "./workOrderRunnerUi";

// Types

type RunnerProductFeature = Pick<ProductFeatureDefinition, "id" | "name" | "options"> & {
  valueType: string;
  subProperties?: Feature["subProperties"];
  isInventory?: boolean;
  manufacturerPartNumber?: string;
};

interface StepCapture {
  stepId: string;
  values: Record<string, string>;
  completedAt: string;
  iterationIndex?: number;
}

interface WorkOrderRunnerProps {
  open: boolean;
  onClose: () => void;
  workflow: Workflow;
  productId: string;
  productName: string;
  /** Preview-only walkthrough for web work-instruction preview. */
  previewWalkthrough?: boolean;
  /** Links this run to a specific project asset. Required for real run tracking. */
  projectAssetId?: string;
  /** The WorkflowConfig id â€" used to call startRun() if no runId. */
  workflowConfigId?: string;
  /** Provide to continue an existing run (skips startRun call). */
  existingRunId?: string;
  /** Values from a previous run to pre-populate as editable defaults (re-run scenario). */
  prefillValues?: Record<string, Record<string, string>>;
  /** Called after run is locked. */
  onComplete?: (capturedFeatureValues: Record<string, string>) => void;
  /** Called when user pauses â€" receives progress, step titles, and any feature values captured so far. */
  onPause?: (progress: { done: number; total: number; completedTitles: string[]; partialFeatureValues: Record<string, string> }) => void;
  /** Full name of the currently logged-in user, stored on each issue. */
  currentUserName?: string;
  /** ID of the currently logged-in user â€" used for missing-media flag ownership. */
  currentUserId?: string;
  /** Asset tag shown in dashboard flags. */
  assetTag?: string;
  /** Job number shown in dashboard flags. */
  jobNumber?: string;
  /** Project id — used to resolve site timezone when timeZoneId prop is not passed. */
  projectId?: string;
  /** IANA timezone for run timeline display (project site). Overrides hook when set. */
  timeZoneId?: string;
  /** Product feature definitions â€" used to look up feature names for repeatFeatureId steps. */
  productFeatures?: RunnerProductFeature[];
  /** Feature selections from the workflow config â€" provides expected qty per feature. */
  featureSelections?: FeatureSelection[];
  /** Project team members for user-select inputs. Falls back to allUsers when empty. */
  teamMembers?: { id: string; fullName: string }[];
  /** All active users â€" fallback when no team is assigned to the project. */
  allUsers?: { id: string; fullName: string }[];
  /** When opening a locked run for installer sign-off review, show summary before signature. */
  signoffReviewMode?: boolean;
}

type Stage = "setup" | "running" | "summary" | "bom" | "consumables" | "installer-sign" | "customer-sign";
type ValidationDialogMode = "blocking" | "warning";
type PendingStepAction =
  | { type: "next" }
  | { type: "decision"; targetId: string | null }
  | { type: "review"; stepId: string | null; iterationIndex?: number };

type MissingCaptureTarget = MissingWorkflowItem & { stepId: string; iterationIndex?: number };

export default function WorkOrderRunner({
  open,
  onClose,
  workflow,
  productId,
  productName,
  previewWalkthrough = false,
  projectAssetId,
  workflowConfigId,
  existingRunId,
  prefillValues,
  onComplete,
  onPause,
  currentUserName,
  currentUserId,
  assetTag,
  jobNumber,
  projectId: projectIdProp,
  timeZoneId: timeZoneIdProp,
  productFeatures,
  featureSelections,
  teamMembers,
  allUsers,
  signoffReviewMode = false,
}: WorkOrderRunnerProps) {
  const resolvedTimeZone = useProjectTimeZone(projectIdProp) ?? timeZoneIdProp;
  const userSelectOptions = (teamMembers && teamMembers.length > 0 ? teamMembers : (allUsers ?? [])).map((u) => u.fullName);
  const stepsSorted = useMemo(
    () => [...workflow.steps].sort((a, b) => a.order - b.order),
    [workflow.steps],
  );

  const [stage, setStage] = useState<Stage>("setup");
  const firstRenderMarkedRef = useRef(false);
  const [currentStepId, setCurrentStepId] = useState<string | null>(stepsSorted[0]?.id ?? null);
  const [history, setHistory] = useState<string[]>([]);
  // values[stepId][inputId] = string value
  const [values, setValues] = useState<Record<string, Record<string, string>>>(prefillValues ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const sheetDragStartY = useRef(0);
  const sheetDragStartTime = useRef(0);
  const sheetDragOffsetRef = useRef(0);
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [validationDialogMode, setValidationDialogMode] = useState<ValidationDialogMode>("blocking");
  const [validationDialogItems, setValidationDialogItems] = useState<MissingWorkflowItem[]>([]);
  const [pendingStepAction, setPendingStepAction] = useState<PendingStepAction | null>(null);

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
  const [flagSessionIssueIds, setFlagSessionIssueIds] = useState<string[]>([]);
  // Issue editing
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editIssueDesc, setEditIssueDesc] = useState("");
  const [editIssueSeverity, setEditIssueSeverity] = useState<"low" | "medium" | "high">("medium");
  // Issue detail dialog (comments / close)
  const [issueDetailId, setIssueDetailId] = useState<string | null>(null);
  // Right-click context menu anchor for the issues chip
  const [issueMenuAnchor, setIssueMenuAnchor] = useState<Element | null>(null);

  // Repeatable steps â€" how many iterations per step, current iteration, picker input value
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>({});
  const [repeatIter, setRepeatIter] = useState<Record<string, number>>({});
  const [repeatPickerCount, setRepeatPickerCount] = useState(1);
  // Feature-linked repeatable steps â€" qty modifications made by installer
  interface QtyModification { stepId: string; featureId: string; featureName: string; expectedQty: number; actualQty: number; reason: string; modifiedAt: string; }
  const [qtyModifications, setQtyModifications] = useState<Record<string, QtyModification>>({});
  const [modifyQtyOpen, setModifyQtyOpen] = useState(false);
  const [modifyQtyStepId, setModifyQtyStepId] = useState<string | null>(null);
  const [modifyQtyValue, setModifyQtyValue] = useState(1);
  const [modifyQtyReason, setModifyQtyReason] = useState("");
  const [showSummaryIssues, setShowSummaryIssues] = useState(false);
  const [showSummaryQtyMods, setShowSummaryQtyMods] = useState(false);
  const [showSummaryCapturedData, setShowSummaryCapturedData] = useState(false);

  // BOM confirmation
  const [bomActual, setBomActual] = useState<BomActualItem[]>([]);
  const [unlistedConsumables, setUnlistedConsumables] = useState<UnlistedConsumable[]>([]);

  // Consumable features from the product library â€" drives the end-of-run survey
  const [libConsumableFeatures, setLibConsumableFeatures] = useState<Feature[]>([]);
  useEffect(() => {
    if (!open || !productId) return;
    featureService.getByProduct(productId)
      .then((feats) => setLibConsumableFeatures(feats.filter((f) => !f.isInventory)))
      .catch(() => {});
  }, [open, productId]);

  useEffect(() => {
    if (!open) {
      setSheetDragOffset(0);
    }
  }, [open]);

  // Run tracking
  const { user } = useAuth();
  const [activeRunId, setActiveRunId] = useState<string | null>(existingRunId ?? null);
  const [activeRun, setActiveRun] = useState<AssetWorkflowRun | null>(null);
  const [timeEditorOpen, setTimeEditorOpen] = useState(false);
  const runningContentRef = useRef<HTMLDivElement>(null);

  function handleSheetTouchStart(clientY: number) {
    if (!isMobileNativePlatform() || !activeRunId || stage !== "running") return;
    sheetDragStartY.current = clientY;
    sheetDragStartTime.current = performance.now();
  }

  function handleSheetTouchMove(clientY: number) {
    if (!isMobileNativePlatform() || !activeRunId || stage !== "running") return;
    const delta = clientY - sheetDragStartY.current;
    if (delta > 0) {
      const next = Math.min(delta, 220);
      sheetDragOffsetRef.current = next;
      setSheetDragOffset(next);
    }
  }

  function handleSheetTouchEnd() {
    const offset = sheetDragOffsetRef.current;
    const elapsedMs = Math.max(1, performance.now() - sheetDragStartTime.current);
    const velocity = offset / elapsedMs;
    const dismiss = offset > 44 || (offset > 24 && velocity > 0.55);
    if (dismiss) {
      void handleClose();
    }
    sheetDragOffsetRef.current = 0;
    setSheetDragOffset(0);
  }

  const nativeBottomInset = NATIVE_BOTTOM_NAV_INSET;

  const runEditPerms = useMemo(
    () => (activeRun && user ? canEditRun(activeRun, user.role) : { time: true, data: true, finalized: false }),
    [activeRun, user],
  );
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const autosaveInFlightRef = useRef<Promise<void> | null>(null);
  const [resumingRun, setResumingRun] = useState(Boolean(existingRunId));
  const [startingRun, setStartingRun] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [blockingError, setBlockingError] = useState<string | null>(null);

  // â"€â"€ Installer sign-off â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [instPadData,   setInstPadData]   = useState<string | null>(null);
  const [instName,      setInstName]      = useState("");
  const [instOutcome,   setInstOutcome]   = useState<"Completed" | "Conditional">("Completed");
  const [instNotes,     setInstNotes]     = useState("");
  const [instConsent,   setInstConsent]   = useState(false);
  const [instSaving,    setInstSaving]    = useState(false);
  const [instError,     setInstError]     = useState<string | null>(null);
  // stable ref so canvas onChange doesn't re-add listeners on every render
  const instPadOnChange = useRef((d: string | null) => setInstPadData(d));

  // â"€â"€ Customer sign-off â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const isRealRun = Boolean(projectAssetId && workflowConfigId);

  // Stable callback ref â€" avoids stale closures inside the hook
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
  const isPreviewWalkthrough = previewWalkthrough && !isRealRun;

  function getFeatureLinkContext(step: WorkflowStep) {
    for (const inp of step.inputs ?? []) {
      if (inp.featureId) {
        const sel = (featureSelections ?? []).find((s) => s.featureId === inp.featureId && s.activeCount > 0);
        const feat = (productFeatures ?? []).find((f) => f.id === inp.featureId);
        if (sel && feat) return { feature: feat, sel };
      }
    }
    for (const cf of step.captureFields ?? []) {
      if (cf.featureId) {
        const sel = (featureSelections ?? []).find((s) => s.featureId === cf.featureId && s.activeCount > 0);
        const feat = (productFeatures ?? []).find((f) => f.id === cf.featureId);
        if (sel && feat) return { feature: feat, sel };
      }
    }
    return null;
  }

  function getEffectiveStepId(step: WorkflowStep): string {
    const linkedFeatureContext = getFeatureLinkContext(step);
    const isFeatureRepeatable = !!linkedFeatureContext?.feature;
    const isLegacyRepeatable = !isFeatureRepeatable && !!step.repeatable;
    const repeatCount = (isFeatureRepeatable || isLegacyRepeatable) ? (repeatCounts[step.id] ?? 0) : 0;
    const repeatIdx = (isFeatureRepeatable || isLegacyRepeatable) ? (repeatIter[step.id] ?? 0) : 0;
    return (isFeatureRepeatable || isLegacyRepeatable) && repeatCount > 0
      ? `${step.id}__iter__${repeatIdx}`
      : step.id;
  }

  function getStepMissingItems(step: WorkflowStep | null): MissingWorkflowItem[] {
    if (!step) return [];
    const effectiveStepId = getEffectiveStepId(step);
    return getMissingWorkflowItems(step, values[effectiveStepId]);
  }

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
    if (!open || !isPreviewWalkthrough) return;
    firstRenderMarkedRef.current = false;
    setStage("running");
    setCurrentStepId(stepsSorted[0]?.id ?? null);
    setHistory([]);
  }, [open, isPreviewWalkthrough, stepsSorted]);

  useLayoutEffect(() => {
    if (!open || stage !== "running" || firstRenderMarkedRef.current) return;
    firstRenderMarkedRef.current = true;
    markOfflinePerf("first_render", "runner");
  }, [open, stage]);

  // Tick every second while the dialog is open â€" drives productiveSecondsLive
  // and downtimeSecondsLive in real time. Running unconditionally (not gated
  // on stage or trackingCategory) means the clock never stops due to a stage
  // transition and always restarts cleanly when tracking switches categories.
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  function reset() {
    firstRenderMarkedRef.current = false;
    setStage("setup");
    setCurrentStepId(stepsSorted[0]?.id ?? null);
    setHistory([]);
    setValues(prefillValues ?? {});
    setSaved(false);
    setSaveError(null);
    setBlockingError(null);
    setValidationDialogOpen(false);
    setValidationDialogItems([]);
    setPendingStepAction(null);
    setShowSummaryIssues(false);
    setShowSummaryQtyMods(false);
    setShowSummaryCapturedData(false);
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
    setUnlistedConsumables([]);
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
        setActiveRun(updated);
        syncRunTimeState(updated);
      }
      if (action !== "StartDowntime") setDowntimeReason("");
    } catch {
      setSaveError("Could not update time tracking. Please try again.");
    } finally {
      setTrackingBusy(false);
    }
  }

  function resetFlagForm() {
    setFlagDescription("");
    setFlagExtraHours("");
    setFlagCostImpact("");
    setFlagMedia([]);
    setFlagSubmitted(false);
    setFlagIsScopeDeviation(false);
    setFlagSeverity("medium");
  }

  function openFlagDialog() {
    setFlagSessionIssueIds([]);
    resetFlagForm();
    setFlagOpen(true);
  }

  function closeFlagDialog() {
    setFlagSessionIssueIds([]);
    resetFlagForm();
    setFlagOpen(false);
  }

  function cancelFlagDialog() {
    if (flagSessionIssueIds.length > 0) {
      setIssues((prev) => prev.filter((issue) => !flagSessionIssueIds.includes(issue.id)));
      scheduleAutosave();
    }
    setFlagSessionIssueIds([]);
    resetFlagForm();
    setFlagOpen(false);
  }

  function submitFlag() {
    if (!flagDescription.trim()) return;
    const derivedIssueType: "blocking" | "observation" | "scope-deviation" =
      flagIsScopeDeviation ? "scope-deviation" : flagSeverity === "high" ? "blocking" : "observation";
    const isBlocking = flagSeverity === "high" && !flagIsScopeDeviation;
    const issueId = randomId("issue");
    const issue: RunIssue = {
      id: issueId,
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
    setFlagSessionIssueIds((prev) => [...prev, issueId]);
    resetFlagForm();
    setFlagSubmitted(true);
    scheduleAutosave();
  }

  function deleteIssue(id: string) {
    setIssues((prev) => prev.filter((i) => i.id !== id));
    setFlagSessionIssueIds((prev) => prev.filter((issueId) => issueId !== id));
    scheduleAutosave();
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
    scheduleAutosave();
  }

  function handleIssueDetailSave(updated: RunIssue) {
    setIssues((prev) => prev.map((i) => i.id === updated.id ? updated : i));
    scheduleAutosave();
  }

  function handleClose() {
    // Close immediately; persist progress in the background so Pause/backdrop
    // are not blocked by slow online PUTs (offline path queues locally either way).
    if (activeRunId && isRealRun && stage === "running") {
      clearTimeout(autosaveTimerRef.current);
      const runId = activeRunId;
      const stepsJson = JSON.stringify(buildStepsData());
      const issuesJson = JSON.stringify(issues);
      onClose();
      void (async () => {
        try {
          if (autosaveInFlightRef.current) {
            try {
              await autosaveInFlightRef.current;
            } catch {
              // ignore — snapshot save below is authoritative
            }
          }
          await assetWorkflowRunService.saveProgress(runId, stepsJson, issuesJson);
        } catch {
          // silent — not critical for dismiss
        }
      })();
      return;
    }
    onClose();
  }

  async function handleDiscardRun() {
    if (!activeRunId || !isRealRun) {
      reset();
      onClose();
      return;
    }
    setDiscarding(true);
    setDiscardError(null);
    try {
      const updated = await assetWorkflowRunService.abandonRun(activeRunId);
      setActiveRun(updated);
      syncRunTimeState(updated);
      setValues(prefillValues ?? {});
      setIssues([]);
      setHistory([]);
      setCurrentStepId(stepsSorted[0]?.id ?? null);
      setResumingRun(false);
      setDiscardConfirmOpen(false);
      reset();
      onClose();
    } catch {
      setDiscardError("Failed to discard run progress. Please try again.");
    } finally {
      setDiscarding(false);
    }
  }

  function requestDiscardRun() {
    if (activeRunId && isRealRun && !activeRun?.isLocked) {
      setDiscardConfirmOpen(true);
      return;
    }
    void handleClose();
  }

  function handlePause() {
    clearTimeout(autosaveTimerRef.current);
    const runId = activeRunId;
    const realRun = isRealRun;
    const stepsJson = runId ? JSON.stringify(buildStepsData()) : null;
    const issuesJson = JSON.stringify(issues);
    const completedTitles = history
      .map((id) => stepsSorted.find((s) => s.id === id)?.title ?? "")
      .filter(Boolean);
    const partialFeatureValues = extractFeatureValues();

    onPause?.({ done: history.length, total: stepsSorted.length, completedTitles, partialFeatureValues });
    reset();
    onClose();

    if (!runId || !realRun || !stepsJson) return;

    void (async () => {
      try {
        if (autosaveInFlightRef.current) {
          try {
            await autosaveInFlightRef.current;
          } catch {
            // ignore
          }
        }
        await assetWorkflowRunService.trackTimeEntry(runId, "StopAll");
        await assetWorkflowRunService.saveProgress(runId, stepsJson, issuesJson, "Paused");
      } catch {
        // silent — offline queue handles persistence inside saveProgress
      }
    })();
  }

  function applyRunProgressFromRun(run: AssetWorkflowRun): void {
    setActiveRunId(run.id);
    setActiveRun(run);
    syncRunTimeState(run);

    const prevValues: Record<string, Record<string, string>> = {};
    let navRestored = false;
    if (run.stepResultsJson && run.stepResultsJson !== "[]") {
      try {
        const prev = JSON.parse(run.stepResultsJson) as StepCapture[];
        const navEntry = prev.find((sc) => sc.stepId === "__nav__");
        const dataEntries = prev.filter((sc) => sc.stepId !== "__nav__");

        for (const sc of dataEntries) prevValues[sc.stepId] = sc.values;
        setValues(prevValues);

        if (navEntry?.values?.currentStepId) {
          const savedStepId = navEntry.values.currentStepId;
          const savedHistory: string[] = JSON.parse(navEntry.values.historyJson ?? "[]");
          setCurrentStepId(savedStepId);
          setHistory(savedHistory);
          setResumingRun(true);
          navRestored = true;
        }
      } catch { /* ignore */ }
    }
    if (run.issuesJson && run.issuesJson !== "[]") {
      try { setIssues(JSON.parse(run.issuesJson) as RunIssue[]); } catch { /* ignore */ }
    }

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
  }

  async function reconcileRunWithServer(): Promise<void> {
    if (!projectAssetId || !workflowConfigId) return;
    markOfflinePerf("network_request_start", "runner-reconcile");
    try {
      if (activeRunId) {
        const localRun = await assetWorkflowRunService.getByIdLocalFirst(activeRunId);
        if (localRun?.isLocked) {
          transitionToLockedRunStage(localRun);
          return;
        }
        // Pending sync owns reconciliation — stale server reads must not wipe captured data.
        if (localRun && "dirty" in localRun && (localRun as { dirty?: boolean }).dirty) {
          return;
        }
      }

      const run = activeRunId
        ? await assetWorkflowRunService.getByIdFresh(activeRunId)
        : await assetWorkflowRunService.startRun(projectAssetId, workflowConfigId);

      if (!run) return;

      if (run.isLocked) {
        transitionToLockedRunStage(run);
        return;
      }

      applyRunProgressFromRun(run);

      const timeEntries = parseRunTimeEntries(run.timeTrackingJson ?? "[]");
      const hasOpenEntry = timeEntries.some((e) => !e.endedAtUtc);
      if (!hasOpenEntry && run.id) {
        try {
          const resumed = await assetWorkflowRunService.trackTimeEntry(run.id, "ResumeProductive", "Continued");
          if (resumed) syncRunTimeState(resumed);
        } catch { /* non-fatal */ }
      }
    } catch {
      // Keep local state — sync engine will reconcile later.
    } finally {
      markOfflinePerf("network_request_end", "runner-reconcile");
    }
  }

  async function startRun() {
    if (!isRealRun) {
      setCurrentStepId(stepsSorted[0]?.id ?? null);
      markOfflinePerf("interactive_ready", "runner-preview");
      setStage("running");
      return;
    }

    setStartingRun(true);
    setStartError(null);

    /** Resume productive time without blocking the first step paint. */
    function deferResumeProductiveTimeEntry(runId: string) {
      void (async () => {
        try {
          const resumed = await assetWorkflowRunService.trackTimeEntry(runId, "ResumeProductive", "Continued");
          if (resumed) syncRunTimeState(resumed);
        } catch { /* non-fatal — reconcileRunWithServer may retry */ }
      })();
    }

    let resumeTimeRunId: string | null = null;

    try {
      if (activeRunId && isMobileNativePlatform()) {
        const localRun = await assetWorkflowRunService.getByIdLocalFirst(activeRunId);
        if (localRun?.isLocked) {
          transitionToLockedRunStage(localRun);
          markOfflinePerf("interactive_ready", "runner-locked");
          return;
        }
        if (localRun && !localRun.isLocked) {
          applyRunProgressFromRun(localRun);

          const timeEntries = parseRunTimeEntries(localRun.timeTrackingJson ?? "[]");
          const hasOpenEntry = timeEntries.some((e) => !e.endedAtUtc);
          markOfflinePerf("interactive_ready", "runner-local");
          setStage("running");
          if (!hasOpenEntry && localRun.id) {
            deferResumeProductiveTimeEntry(localRun.id);
          }
          void reconcileRunWithServer();
          return;
        }
        if (shouldSkipRunMutation()) {
          setStartError("Could not load run. Open it once online to cache it for offline use.");
          return;
        }
      }

      const run = activeRunId
        ? await assetWorkflowRunService.getById(activeRunId)
        : await assetWorkflowRunService.startRun(projectAssetId!, workflowConfigId!);

      if (!run) {
        setStartError("Could not load run. Please try again.");
        return;
      }

      if (run.isLocked) {
        transitionToLockedRunStage(run);
        markOfflinePerf("interactive_ready", "runner-locked");
        return;
      }

      applyRunProgressFromRun(run);

      const timeEntries = parseRunTimeEntries(run.timeTrackingJson ?? "[]");
      const hasOpenEntry = timeEntries.some((e) => !e.endedAtUtc);
      if (!hasOpenEntry && run.id) {
        resumeTimeRunId = run.id;
      }

      markOfflinePerf("interactive_ready", "runner-network");
    } catch {
      setStartError("Could not start run. Check your connection and try again.");
      return;
    } finally {
      setStartingRun(false);
    }

    setStage("running");
    if (resumeTimeRunId) {
      deferResumeProductiveTimeEntry(resumeTimeRunId);
    }
  }

  function setInputValue(stepId: string, inputId: string, val: string) {
    if (activeRun && !runEditPerms.data) return;
    setValues((prev) => ({
      ...prev,
      [stepId]: { ...(prev[stepId] ?? {}), [inputId]: val },
    }));
  }

  function appendMediaUrls(stepId: string, inputId: string, dataUrls: string[]) {
    if (dataUrls.length === 0) return;
    if (activeRun && !runEditPerms.data) return;
    setValues((prev) => {
      const stepVals = prev[stepId] ?? {};
      let media: string[] = [];
      try { media = JSON.parse(stepVals[inputId] || "[]"); } catch { /* empty */ }
      return {
        ...prev,
        [stepId]: { ...stepVals, [inputId]: JSON.stringify([...media, ...dataUrls]) },
      };
    });
  }

  useEffect(() => {
    if (stage !== "running") return;
    runningContentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [currentStepId, stage]);

  function getInputValue(stepId: string, inputId: string): string {
    return values[stepId]?.[inputId] ?? "";
  }

  function goBack() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCurrentStepId(prev);
  }

  const splitMissingItems = splitMissingItemsByGate;

  function openValidationDialog(mode: ValidationDialogMode, items: MissingWorkflowItem[], pendingAction: PendingStepAction | null) {
    setValidationDialogMode(mode);
    setValidationDialogItems(items);
    setPendingStepAction(pendingAction);
    setValidationDialogOpen(true);
  }

  function closeValidationDialog() {
    setValidationDialogOpen(false);
    setValidationDialogItems([]);
    setPendingStepAction(null);
  }

  function getMissingItemMessage(item: MissingWorkflowItem): string {
    switch (item.kind) {
      case "video":
        return "Video missing";
      case "photo":
        return "Photo missing";
      case "capture":
        return "Required capture missing";
      default:
        return "Required field missing";
    }
  }

  function isMissingCaptureItem(item: MissingWorkflowItem) {
    return item.kind === "capture" || item.kind === "photo" || item.kind === "video";
  }

  function getMissingCaptureTargets(stepData: StepCapture[] = buildStepsData()): MissingCaptureTarget[] {
    return stepData
      .filter((sc) => sc.stepId !== "__nav__")
      .flatMap((sc) => {
        const step = stepsSorted.find((candidate) => candidate.id === sc.stepId);
        if (!step) return [];
        return getMissingWorkflowItems(step, sc.values)
          .filter(isMissingCaptureItem)
          .map((item) => ({ ...item, stepId: step.id, iterationIndex: sc.iterationIndex }));
      });
  }

  function jumpToWorkflowStep(stepId: string | null, iterationIndex?: number) {
    if (!stepId) return;
    const stepIndex = stepsSorted.findIndex((step) => step.id === stepId);
    setHistory(stepIndex > 0 ? stepsSorted.slice(0, stepIndex).map((step) => step.id) : []);
    setCurrentStepId(stepId);
    if (iterationIndex != null) {
      setRepeatIter((prev) => ({ ...prev, [stepId]: iterationIndex }));
    }
    setFlagOpen(false);
    setFlagSubmitted(false);
    setStage("running");
  }

  function proceedToNextStep() {
    if (!currentStep) return;

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
      void flushAutosave();
      setStage("summary");
    } else {
      const nextStepId = currentStep.nextStepId;
      const nextHistory = [...history, currentStep.id];
      setHistory(nextHistory);
      setCurrentStepId(nextStepId);
      setRepeatIter((prev) => ({ ...prev, [nextStepId]: 0 }));
      flushAutosave(nextStepId, nextHistory);
    }
  }

  function proceedWithDecision(targetId: string | null) {
    if (!currentStep) return;
    if (targetId) {
      const nextHistory = [...history, currentStep.id];
      setHistory(nextHistory);
      setCurrentStepId(targetId);
      flushAutosave(targetId, nextHistory);
    } else {
      scheduleAutosave();
      setStage("summary");
    }
  }

  function confirmValidationWarning() {
    const action = pendingStepAction;
    closeValidationDialog();
    if (!action) return;
    if (action.type === "next") {
      proceedToNextStep();
      return;
    }
    if (action.type === "decision") {
      proceedWithDecision(action.targetId);
      return;
    }
    jumpToWorkflowStep(action.stepId, action.iterationIndex);
  }

  function reviewValidationBlocking() {
    const action = pendingStepAction;
    closeValidationDialog();
    if (action?.type === "review") {
      jumpToWorkflowStep(action.stepId, action.iterationIndex);
    }
  }

  function handleNext() {
    if (!currentStep) return;
    setFlagOpen(false);
    setFlagSubmitted(false);
    if (isPreviewWalkthrough) {
      proceedToNextStep();
      return;
    }
    const missingItems = getStepMissingItems(currentStep);
    const { blocking, warning } = splitMissingItems(missingItems);
    if (blocking.length > 0) {
      openValidationDialog("blocking", blocking, null);
      return;
    }
    if (warning.length > 0) {
      openValidationDialog("warning", warning, { type: "next" });
      return;
    }
    proceedToNextStep();
  }

  function handleDecision(targetId: string | null) {
    if (!currentStep) return;
    setFlagOpen(false);
    setFlagSubmitted(false);
    if (isPreviewWalkthrough) {
      proceedWithDecision(targetId);
      return;
    }
    const missingItems = getStepMissingItems(currentStep);
    const { blocking, warning } = splitMissingItems(missingItems);
    if (blocking.length > 0) {
      openValidationDialog("blocking", blocking, null);
      return;
    }
    if (warning.length > 0) {
      openValidationDialog("warning", warning, { type: "decision", targetId });
      return;
    }
    proceedWithDecision(targetId);
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

    // Navigation marker â€" always saved so exact step + history can be restored on resume.
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
    // Component features are stored as JSON objects keyed by subProperty.id,
    // which is the shape AssetInstallationPage already reads.
    const componentAcc: Record<string, Record<string, string>> = {};

    const featureDef = (featureId: string): RunnerProductFeature | undefined =>
      (productFeatures ?? []).find((f) => f.id === featureId);

    const isComponentFeature = (featureId: string): boolean => {
      const f = featureDef(featureId);
      return !!f && f.valueType === "component" && (f.subProperties ?? []).length > 0;
    };

    // Capture fields keep the sub-property name in label, not the original
    // subProperty.id, so the join back to the component schema is by name.
    const subPropertyIdForLabel = (featureId: string, label?: string): string | undefined => {
      if (!label) return undefined;
      const wanted = label.trim().toLowerCase();
      return (featureDef(featureId)?.subProperties ?? [])
        .find((sp) => sp.name.trim().toLowerCase() === wanted)?.id;
    };

    const assign = (featureId: string, label: string | undefined, val: string) => {
      if (isComponentFeature(featureId)) {
        const spId = subPropertyIdForLabel(featureId, label);
        const key = spId ?? (label ?? "").trim();
        if (!key) return;
        (componentAcc[featureId] ??= {})[key] = val;
      } else {
        result[featureId] = val;
      }
    };

    for (const step of stepsSorted) {
      // Inputs tied to a feature.
      for (const inp of step.inputs ?? []) {
        if (inp.featureId) {
          const val = values[step.id]?.[inp.id];
          if (val !== undefined && val !== "") assign(inp.featureId, inp.label, val);
        }
      }
      // Data-collection values live in captureFields, not only in step.inputs.
      for (const cf of step.captureFields ?? []) {
        if (cf.featureId) {
          const val = values[step.id]?.[cf.id];
          if (val !== undefined && val !== "") assign(cf.featureId, cf.label, val);
        }
      }
    }

    for (const [featureId, sub] of Object.entries(componentAcc)) {
      if (Object.keys(sub).length > 0) result[featureId] = JSON.stringify(sub);
    }

    return result;
  }

  async function autosaveProgress(navStepId?: string, navHistory?: string[], status?: "InProgress" | "Paused") {
    if (!activeRunId) return;
    try {
      await assetWorkflowRunService.saveProgress(
        activeRunId,
        JSON.stringify(buildStepsData(navStepId, navHistory)),
        JSON.stringify(issues),
        status,
      );
    } catch {
      // silent â€" not critical
    }
  }

  function scheduleAutosave(navStepId?: string, navHistory?: string[], status?: "InProgress" | "Paused") {
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveInFlightRef.current = autosaveProgress(navStepId, navHistory, status).finally(() => {
        autosaveInFlightRef.current = null;
      });
    }, 400);
  }

  async function flushAutosave(navStepId?: string, navHistory?: string[], status?: "InProgress" | "Paused") {
    clearTimeout(autosaveTimerRef.current);
    if (autosaveInFlightRef.current) await autosaveInFlightRef.current;
    await autosaveProgress(navStepId, navHistory, status);
  }

  function transitionToLockedRunStage(run: AssetWorkflowRun) {
    setActiveRun(run);
    setActiveRunId(run.id);
    syncRunTimeState(run);
    applyRunProgressFromRun(run);
    setSaved(true);
    onComplete?.(extractFeatureValues());

    if (signoffReviewMode && run.signatureStatus === "PendingInstaller") {
      setStage("summary");
      return;
    }

    if (run.signatureStatus === "PendingInstaller") {
      setInstName(currentUserName ?? "");
      setInstConsent(false);
      setStage("installer-sign");
      return;
    }

    if (run.signatureStatus === "PendingCustomer") {
      setCustMode("options");
      setCustPadData(null);
      setCustName("");
      setCustTitle("");
      setCustEmail("");
      setCustNotes("");
      setLinkEmail("");
      setLinkName("");
      setLinkSent(false);
      setStage("customer-sign");
      return;
    }

    setStage("summary");
  }

  async function handleSave(finalBomActual?: BomActualItem[]) {
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
      const bomToSave = finalBomActual ?? bomActual;
      const bomJson = bomToSave.length > 0 ? JSON.stringify(bomToSave) : undefined;

      if (activeRun) {
        const pendingCompletionRun: AssetWorkflowRun = {
          ...activeRun,
          stepResultsJson: stepsJson,
          issuesJson,
          bomActualJson: bomJson,
        };
        const missingCaptureTargets = getMissingCaptureTargets();
        const missingCompletionItems = getRunMissingWorkflowItems(pendingCompletionRun);
        if (missingCompletionItems.length > 0) {
          openValidationDialog(
            "blocking",
            missingCompletionItems,
            missingCaptureTargets.length > 0
              ? { type: "review", stepId: missingCaptureTargets[0].stepId, iterationIndex: missingCaptureTargets[0].iterationIndex }
              : null,
          );
          return;
        }
      }

      if (activeRunId) {
        // Flush any queued time-tracking actions before locking — run rejects changes once locked.
        await flushTimeQueue();
        // Persist latest step captures, then lock without re-uploading the full blob (web F4).
        await flushAutosave();
        const lockedRun = await assetWorkflowRunService.completeRun(activeRunId, stepsJson, issuesJson, currentUserName, bomJson);
        transitionToLockedRunStage(lockedRun);

        // Flag runs with missing required photo/video only (optional media never counts).
        const { allRequired, missing } = getRunMissingMediaSteps(lockedRun);
        const existing = JSON.parse(localStorage.getItem("pm_missing_media_flags") ?? "[]");
        const deduped = existing.filter((e: { runId: string }) => e.runId !== activeRunId);

        if (missing.length > 0) {
          const totalExpected = allRequired.length;
          const totalCaptured = allRequired.filter((step) => step.captured > 0).length;
          const flag = {
            id: randomId(),
            runId: activeRunId,
            assetId: projectAssetId ?? "",
            assetTag: assetTag ?? "",
            jobNumber: jobNumber ?? "",
            workflowName: workflow.name,
            technicianUserId: currentUserId ?? "",
            technicianName: currentUserName ?? "",
            completedAt: new Date().toISOString(),
            missingSteps: missing.map(({ stepId, stepOrder, stepTitle, inputId, inputLabel, inputType, captured }) => ({
              stepId,
              stepOrder,
              stepTitle,
              inputId,
              inputLabel,
              inputType,
              captured,
            })),
            totalExpected,
            totalCaptured,
          };
          localStorage.setItem("pm_missing_media_flags", JSON.stringify([...deduped, flag]));
          window.dispatchEvent(new Event("missing-media-flags-changed"));
        } else if (deduped.length !== existing.length) {
          localStorage.setItem("pm_missing_media_flags", JSON.stringify(deduped));
          window.dispatchEvent(new Event("missing-media-flags-changed"));
        }
      }
      // Note: if no activeRunId (preview mode), skip signature stages
      if (!activeRunId) {
        setSaved(true);
        onComplete?.(extractFeatureValues());
        setTimeout(() => handleClose(), 1200);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string; blockingCount?: number } } };
      if (axiosErr?.response?.status === 422) {
        const msg = axiosErr.response?.data?.message ?? "Cannot complete - unresolved blocking issues must be resolved first.";
        setBlockingError(msg);
      } else if (axiosErr?.response?.status === 400 && activeRunId) {
        const latestRun = await assetWorkflowRunService.getById(activeRunId);
        if (latestRun?.isLocked && (latestRun.signatureStatus === "PendingInstaller" || latestRun.signatureStatus === "PendingCustomer")) {
          setSaveError(null);
          transitionToLockedRunStage(latestRun);
        } else {
          setSaveError("Save failed. Check your connection and try again.");
        }
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
        consentConfirmed: instConsent,
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
    } catch { /* non-critical â€" close anyway */ }
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
    if (inp.type === "dropdown") {
      const opts = inp.options ?? [];
      return (
        <FormControl size="small" fullWidth error={isReq}>
          <Select
            displayEmpty
            value={val || ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <MenuItem value="" disabled>Select…</MenuItem>
            {opts.map((opt) => (
              <MenuItem key={opt} value={opt}>{opt}</MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }
    if (inp.type === "wheel") {
      return <WheelPicker options={inp.options ?? []} value={val} onChange={onChange} error={isReq} />;
    }
    if (inp.type === "note") {
      return (
        <TextField size="small" fullWidth multiline rows={3} error={isReq}
          placeholder="Enter notes..." value={val} onChange={(e) => onChange(e.target.value)} />
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
        <WorkflowDateCapture
          value={val}
          onChange={onChange}
          label={inp.label}
          error={isReq}
          timeZoneId={resolvedTimeZone}
        />
      );
    }
    if (inp.type === "scan") {
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Scan barcode / QR (type manually in browser)" {...nativeTooltipTouchProps()}>
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
            <Stack key={sf.id} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }} sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ minWidth: { sm: 140 }, flexShrink: 0, color: "text.secondary" }}>
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
      const acceptType = isVideo ? "video/*" : "image/*";
      const captureLabel = isVideo ? "Add video" : "Add photo";
      return (
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Button
            size="small"
            variant="outlined"
            component="label"
            startIcon={isVideo ? <VideocamOutlined /> : <PhotoCameraOutlined />}
          >
            {captureLabel}
            {/*
              Fix: previously had capture="environment", which on iOS Safari/WKWebView
              skips the photo/video picker entirely and jumps straight to the camera —
              no way to select an existing photo or video from the library. Removing
              the capture attribute restores iOS's native choice sheet ("Take Photo or
              Video" / "Photo Library"), matching the working pattern already used in
              MediaCapture.tsx elsewhere in this app.
            */}
            <input
              type="file"
              accept={acceptType}
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length === 0) return;
                void (async () => {
                  setMediaError(null);
                  const nextMedia: string[] = [];
                  const errors: string[] = [];
                  for (const file of files) {
                    try {
                      const prepared = await prepareWorkflowMediaFile(file);
                      const dataUrl = await fileToDataUrl(prepared);
                      nextMedia.push(dataUrl);
                    } catch (err) {
                      errors.push(err instanceof Error ? err.message : "Could not add media.");
                    }
                  }
                  if (nextMedia.length > 0) {
                    onChange(JSON.stringify([...media, ...nextMedia]));
                  }
                  if (errors.length > 0) {
                    setMediaError(errors[0]);
                  }
                })();
                e.target.value = "";
              }}
            />
          </Button>
          <QRUploadButton
            docType="workflow-evidence"
            linkedTo={inp.label}
            label="Upload from Phone"
            onUploaded={() => { /* handled by onUploadedAllWithData */ }}
            onUploadedAllWithData={(dataUrls) => appendMediaUrls(sid, inp.id, dataUrls)}
          />
          </Stack>
          {isVideo && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
              Max video size {formatBytesLabel(WORKFLOW_VIDEO_MAX_BYTES)}. Library clips are often larger — record a short clip, or compress/crop before adding.
            </Typography>
          )}
          {mediaError && (
            <Alert severity="warning" onClose={() => setMediaError(null)} sx={{ mt: 1, fontSize: 12 }}>
              {mediaError}
            </Alert>
          )}
          {media.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
              {media.map((src, idx) => (
                <Box key={idx} sx={{ position: "relative" }}>
                  {isVideo
                    ? (
                      // Avoid binding huge base64 data URLs into a <video> element —
                      // that alone can OOM the native WebView after a library pick.
                      <Box
                        sx={{
                          width: 160,
                          height: 90,
                          borderRadius: 1,
                          border: "1px solid rgba(255,255,255,0.12)",
                          bgcolor: "grey.900",
                          color: "grey.400",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 0.25,
                        }}
                      >
                        <PlayCircleOutlineOutlined sx={{ fontSize: 28 }} />
                        <Typography variant="caption" sx={{ fontSize: 10 }}>Video attached</Typography>
                      </Box>
                    )
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
    if (inp.type === "user-select") {
      return (
        <FormControl size="small" fullWidth error={isReq}>
          <InputLabel>{inp.label || "Select team member"}</InputLabel>
          <Select
            value={val}
            label={inp.label || "Select team member"}
            onChange={(e) => onChange(e.target.value)}
          >
            {userSelectOptions.length === 0 ? (
              <MenuItem disabled value="">No team members assigned</MenuItem>
            ) : (
              userSelectOptions.map((name) => (
                <MenuItem key={name} value={name}>{name}</MenuItem>
              ))
            )}
          </Select>
        </FormControl>
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
          <Tooltip title="Scan barcode / QR (or type manually)" {...nativeTooltipTouchProps()}>
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
        <WorkflowDateCapture
          value={val}
          onChange={onChange}
          label={field.label}
          hint={field.hint}
          fieldKey={field.key}
          error={isReq}
          timeZoneId={resolvedTimeZone}
        />
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

    // Feature-linked repeatable step â€" derived from inputs or capture fields with featureId
    const derivedFeatureLink = getFeatureLinkContext(currentStep);
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
        {isMobileNativePlatform() && activeRunId && (
          <Box
            sx={{ pt: 0.75, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25 }}
            onTouchStart={(e) => handleSheetTouchStart(e.touches[0]?.clientY ?? 0)}
            onTouchMove={(e) => handleSheetTouchMove(e.touches[0]?.clientY ?? 0)}
            onTouchEnd={handleSheetTouchEnd}
          >
            <Box sx={{ width: 36, height: 4, borderRadius: 99, bgcolor: "action.disabled" }} />
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.62rem" }}>
              Swipe down to return to dashboard
            </Typography>
          </Box>
        )}
        <DialogTitle>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Typography variant="subtitle1" fontWeight={600}>
              Step {currentIndex + 1} of {stepsSorted.length}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="flex-start" flexWrap="wrap" useFlexGap>
              {issues.length > 0 && (
                <Tooltip title="Right-click for details" {...nativeTooltipTouchProps()}>
                  <Chip
                    size="small"
                    label={`${issues.length} issue${issues.length === 1 ? "" : "s"}${blockingCount > 0 ? ` (${blockingCount} blocking)` : ""}`}
                    color={blockingCount > 0 ? "error" : "warning"}
                    onContextMenu={(e) => { e.preventDefault(); setIssueMenuAnchor(e.currentTarget); }}
                    sx={{ cursor: "context-menu" }}
                  />
                </Tooltip>
              )}
              <DiagnosticClockBar
                variant="compact"
                siteOnly
                projectTimeZoneId={resolvedTimeZone}
                projectLabel="Site"
              />
              <Menu
                anchorEl={issueMenuAnchor}
                open={Boolean(issueMenuAnchor)}
                onClose={() => setIssueMenuAnchor(null)}
                PaperProps={{ sx: { minWidth: 280, maxWidth: 360 } }}
              >
                <Typography variant="caption" fontWeight={700} sx={{ px: 2, py: 0.75, display: "block", textTransform: "uppercase", letterSpacing: 0.8, color: "text.secondary" }}>
                  Issues - click to jump to step
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
                        {issue.description.length > 60 ? issue.description.slice(0, 60) + "..." : issue.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Menu>
            </Stack>
          </Stack>
          {renderAssetIdentifier(assetTag)}
          <LinearProgress variant="determinate" value={progress} sx={{ mt: 1, borderRadius: 1 }} />
{isRealRun && activeRunId && (
            <Stack spacing={1} sx={{ mt: 1.25 }}>
              {/* Time tracking bar â€" colour-coded, always visible */}
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
                    label="Syncing..."
                  />
                ) : !isOnline ? (
                  <Chip
                    size="small"
                    color="warning"
                    variant="filled"
                    icon={<CloudOffOutlined sx={{ fontSize: "0.85rem !important" }} />}
                    label={pendingCount > 0 ? `Offline - ${pendingCount} queued` : "Offline"}
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
              {/* Controls row â€" single toggle button */}
              <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap>
                {runEditPerms.time && (
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  sx={{ opacity: 0.65, fontSize: "0.72rem" }}
                  onClick={() => setTimeEditorOpen(true)}
                >
                  Edit Times
                </Button>
                )}
                {/* Single toggle: downtime â†" productive */}
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
                      placeholder="Waiting for parts / access / permit..."
                      InputLabelProps={{ shrink: true }}
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
        <DialogContent ref={runningContentRef} sx={runnerDialogContentSx}>
          <Stack spacing={2.5} sx={runnerBodyStackSx}>

            {/* Feature-linked repeatable step â€" qty confirmation panel */}
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

            {/* Legacy repeatable step â€" count picker */}
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

            {/* Repeatable step â€" iteration header */}
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

            {/* Step content â€" hidden until count is confirmed for repeatable steps */}
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
                      <Tooltip key={m.id} title={m.name} {...nativeTooltipTouchProps()}>
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
                            <Typography variant="caption" color="text.secondary">ðŸŽ¥</Typography>
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

                {/* Capture fields â€" structured data for the as-built document */}
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

              </>
            )}
          </Stack>
        </DialogContent>

        <Dialog open={flagOpen} onClose={closeFlagDialog} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ pb: 1 }}>
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" fontWeight={700} color="error">
                Flag issue on this step
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>High</strong> severity = <strong>blocking</strong> - workflow cannot be completed until resolved.{" "}
                <strong>Medium</strong> or <strong>Low</strong> = observation - noted but does not block completion.
              </Typography>
            </Stack>
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 1.5, borderColor: "primary.dark", bgcolor: "rgba(45,212,191,0.04)" }}>
                <Typography variant="caption" fontWeight={700} color="primary.light" display="block" sx={{ mb: 1, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Add an issue
                </Typography>
                <Stack spacing={1.25}>
                  <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                    <FormControl size="small" sx={{ minWidth: 240 }}>
                      <InputLabel shrink>Severity</InputLabel>
                      <Select
                        label="Severity"
                        value={flagSeverity}
                        onChange={(e) => setFlagSeverity(e.target.value as "low" | "medium" | "high")}
                      >
                        <MenuItem value="low">Low - observation, non-blocking</MenuItem>
                        <MenuItem value="medium">Medium - attention needed, non-blocking</MenuItem>
                        <MenuItem value="high">High - blocks completion</MenuItem>
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
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    rows={2}
                    label={flagIsScopeDeviation ? "Describe the scope variation" : "Describe issue"}
                    placeholder={flagIsScopeDeviation ? "e.g. Additional conduit run required due to obstructed original route..." : "Describe what you observed..."}
                    InputLabelProps={{ shrink: true }}
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
                        placeholder="e.g. GBP 250 materials"
                        InputLabelProps={{ shrink: true }}
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
                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      disabled={!flagDescription.trim()}
                      onClick={submitFlag}
                    >
                      Add issue
                    </Button>
                  </Box>
                  {flagSubmitted && (
                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                      Issue added — add another or close when done
                    </Typography>
                  )}
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ p: 1.5, borderColor: "warning.dark", bgcolor: "rgba(249,168,37,0.04)" }}>
                <Typography variant="caption" fontWeight={700} color="warning.light" display="block" sx={{ mb: 1, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Issues created on this step
                </Typography>
                {issues.filter((i) => i.stepId === currentStep?.id).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No issues flagged on this step yet.</Typography>
                ) : (
                  <Stack spacing={0.75}>
                    {issues.filter((i) => i.stepId === currentStep?.id).map((issue) => (
                      <Paper key={issue.id} variant="outlined" sx={{ p: 1, borderColor: issue.isBlocking ? "error.light" : "warning.light" }}>
                        {editingIssueId === issue.id ? (
                          <Stack spacing={0.75}>
                            <TextField size="small" fullWidth multiline rows={2} label="Description"
                              value={editIssueDesc} onChange={(e) => setEditIssueDesc(e.target.value)} />
                            <FormControl size="small" sx={{ maxWidth: 220 }}>
                              <InputLabel shrink>Severity</InputLabel>
                              <Select label="Severity" value={editIssueSeverity}
                                onChange={(e) => setEditIssueSeverity(e.target.value as "low" | "medium" | "high")}>
                                <MenuItem value="low">Low - observation only</MenuItem>
                                <MenuItem value="medium">Medium - attention needed</MenuItem>
                                <MenuItem value="high">High - blocks completion</MenuItem>
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
                                <Tooltip title="Add comments or close issue" {...nativeTooltipTouchProps()}>
                                  <IconButton size="small" onClick={() => setIssueDetailId(issue.id)} sx={{ p: 0.25 }}>
                                    <CommentOutlined sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Edit issue" {...nativeTooltipTouchProps()}><IconButton size="small" onClick={() => startEditIssue(issue)} sx={{ p: 0.25 }}><EditOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                                <Tooltip title="Delete issue" {...nativeTooltipTouchProps()}><IconButton size="small" color="error" onClick={() => deleteIssue(issue.id)} sx={{ p: 0.25 }}><DeleteOutlineOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                              </Stack>
                            </Stack>
                            <Typography variant="caption" sx={issue.resolved ? { textDecoration: "line-through", color: "text.disabled" } : undefined}>{issue.description}</Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                              {issue.createdBy ? `${issue.createdBy} - ` : ""}{formatInstant(issue.reportedAt, resolvedTimeZone, { withZone: false })}
                            </Typography>
                          </Stack>
                        )}
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ justifyContent: "space-between", gap: 1, px: 3, py: 1.5 }}>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={flagSessionIssueIds.length === 0}
              onClick={cancelFlagDialog}
            >
              Cancel & discard
            </Button>
            <Button size="small" variant="contained" color="inherit" onClick={closeFlagDialog}>
              Done
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={validationDialogOpen} onClose={closeValidationDialog} maxWidth="xs" fullWidth>
          <DialogTitle>
            {validationDialogMode === "blocking"
              ? validationDialogItems.every(isMissingCaptureItem) ? "Missing captures" : "Required fields missing"
              : "Capture missing"}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={1.25} sx={{ mt: 0.5 }}>
              <Alert severity={validationDialogMode === "blocking" ? "error" : "warning"} sx={{ fontSize: 12 }}>
                {validationDialogMode === "blocking"
                  ? validationDialogItems.every(isMissingCaptureItem)
                    ? "Missing workflow captures must be completed before the run can be locked."
                    : "You cannot proceed until all required fields on this step are completed."
                  : "Some captures are still missing on this step. You can still proceed if you want."}
              </Alert>
              <Stack spacing={0.5}>
                {validationDialogItems.map((item) => (
                  <Typography key={item.id} variant="body2">
                    {item.label}: {getMissingItemMessage(item)}
                  </Typography>
                ))}
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeValidationDialog}>
              {validationDialogMode === "blocking" ? "Back to step" : "Stay on step"}
            </Button>
            {validationDialogMode === "blocking" && pendingStepAction?.type === "review" && validationDialogItems.every(isMissingCaptureItem) && (
              <Button variant="contained" color="warning" onClick={reviewValidationBlocking}>
                Review Missing Photos
              </Button>
            )}
            {validationDialogMode === "warning" && (
              <Button variant="contained" onClick={confirmValidationWarning}>
                Proceed anyway
              </Button>
            )}
          </DialogActions>
        </Dialog>

        <DialogActions sx={nativeDialogActionsSx({ flexWrap: "wrap", gap: 0.75, justifyContent: "space-between" })}>
          {isPreviewWalkthrough ? (
            <>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Button onClick={goBack} disabled={history.length === 0} variant="outlined" size="small">
                  {"<- Back"}
                </Button>
              </Stack>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                <Button size="small" color="inherit" onClick={onClose}>
                  Close preview
                </Button>
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
                      ? `Next ${unitLabel} ->`
                      : isLast ? "Preview complete" : "Next step ->"}
                  </Button>
                ))}
              </Stack>
            </>
          ) : (
            <>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Button onClick={goBack} disabled={history.length === 0} variant="outlined" size="small">
                  {"<- Back"}
                </Button>
                {!flagOpen && (() => {
                  const stepIssueCount = issues.filter((i) => i.stepId === currentStep?.id).length;
                  return (
                    <Tooltip title="Flag an issue on this step" {...nativeTooltipTouchProps()}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<ReportProblemOutlined fontSize="small" />}
                        onClick={() => openFlagDialog()}
                      >
                        {stepIssueCount > 0 ? `Issues (${stepIssueCount}) +` : "Flag issue"}
                      </Button>
                    </Tooltip>
                  );
                })()}
              </Stack>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                <Tooltip title="Save progress and close - resume later from where you left off" {...nativeTooltipTouchProps()}>
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
                <Tooltip title="Discard all captured data, photos, and reset the time tracker" {...nativeTooltipTouchProps()}>
                  <Button size="small" color="inherit" onClick={requestDiscardRun}>
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
                      ? `Next ${unitLabel} ->`
                      : isLast ? "Complete" : "Next step ->"}
                  </Button>
                ))}
              </Stack>
            </>
          )}
        </DialogActions>
      </>
    );
  }

  const issueForDetail = issueDetailId ? issues.find((i) => i.id === issueDetailId) ?? null : null;

  const summaryStage = (() => {
    if (stage !== "summary") return null;
    const stepsData = buildStepsData();
    const summaryStepResultsJson = JSON.stringify(stepsData);
    const blockingIssues = issues.filter((i) => i.isBlocking && !i.resolved);
    const hasBlockingIssues = blockingIssues.length > 0;
    const qtyModificationCount = Object.keys(qtyModifications).length;
    const payloadEstimate = measurePayload({ stepResultsJson: summaryStepResultsJson });
    const showLargePayloadWarning = payloadEstimate.payloadBytes > API_LARGE_PAYLOAD_WARNING_BYTES;
    const missingCaptureTargets = getMissingCaptureTargets(stepsData);
    const missingCaptureCount = missingCaptureTargets.length;
    const hasMissingCaptures = missingCaptureCount > 0;
    const primaryBlockingIssue = blockingIssues[0] ?? null;
    return {
      stepsData,
      blockingIssues,
      hasBlockingIssues,
      qtyModificationCount,
      showLargePayloadWarning,
      payloadBytes: payloadEstimate.payloadBytes,
      missingCaptureTargets,
      missingCaptureCount,
      hasMissingCaptures,
      primaryBlockingIssue,
    };
  })();

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        sx={isMobileNativePlatform() ? nativeDialogSx() : undefined}
        PaperProps={{
          sx: {
            ...(isMobileNativePlatform()
              ? {
                  maxHeight: `calc(100vh - ${nativeBottomInset})`,
                  mb: nativeBottomInset,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                }
              : { maxHeight: "90vh" }),
            transform: sheetDragOffset > 0 ? `translateY(${sheetDragOffset}px)` : undefined,
            transition: sheetDragOffset > 0 ? "none" : "transform 0.18s ease-out",
          },
        }}
      >
        {stage === "setup" && (
          <WorkOrderRunnerSetupStage
            assetTag={assetTag}
            workflow={workflow}
            productName={productName}
            stepsCount={stepsSorted.length}
            prefillValues={prefillValues}
            resumingRun={resumingRun}
            issues={issues}
            startError={startError}
            startingRun={startingRun}
            onClose={handleClose}
            onStart={startRun}
          />
        )}
        {stage === "running"        && renderRunning()}
        {summaryStage && (
          <WorkOrderRunnerSummaryStage
            isPreviewWalkthrough={isPreviewWalkthrough}
            stepsCount={stepsSorted.length}
            assetTag={assetTag}
            stepsData={summaryStage.stepsData}
            stepsSorted={stepsSorted}
            issues={issues}
            blockingIssues={summaryStage.blockingIssues}
            hasBlockingIssues={summaryStage.hasBlockingIssues}
            primaryBlockingIssue={summaryStage.primaryBlockingIssue}
            qtyModifications={qtyModifications}
            qtyModificationCount={summaryStage.qtyModificationCount}
            showLargePayloadWarning={summaryStage.showLargePayloadWarning}
            payloadBytes={summaryStage.payloadBytes}
            missingCaptureTargets={summaryStage.missingCaptureTargets}
            missingCaptureCount={summaryStage.missingCaptureCount}
            hasMissingCaptures={summaryStage.hasMissingCaptures}
            isRealRun={isRealRun}
            productiveSecondsLive={productiveSecondsLive}
            downtimeSecondsLive={downtimeSecondsLive}
            timeTrackingJson={activeRun?.timeTrackingJson}
            timeZoneId={resolvedTimeZone}
            showSummaryIssues={showSummaryIssues}
            onToggleSummaryIssues={() => setShowSummaryIssues((open) => !open)}
            showSummaryQtyMods={showSummaryQtyMods}
            onToggleSummaryQtyMods={() => setShowSummaryQtyMods((open) => !open)}
            showSummaryCapturedData={showSummaryCapturedData}
            onToggleSummaryCapturedData={() => setShowSummaryCapturedData((open) => !open)}
            editingIssueId={editingIssueId}
            editIssueDesc={editIssueDesc}
            editIssueSeverity={editIssueSeverity}
            onEditIssueDescChange={setEditIssueDesc}
            onEditIssueSeverityChange={setEditIssueSeverity}
            onStartEditIssue={startEditIssue}
            onSaveEditIssue={saveEditIssue}
            onCancelEditIssue={() => setEditingIssueId(null)}
            onDeleteIssue={deleteIssue}
            onOpenIssueDetail={setIssueDetailId}
            blockingError={blockingError}
            saveError={saveError}
            saved={saved}
            activeRunId={activeRunId}
            signoffReviewMode={signoffReviewMode}
            signatureStatus={activeRun?.signatureStatus}
            runEditPerms={runEditPerms}
            saving={saving}
            discarding={discarding}
            onClose={onClose}
            onBackToRunning={() => setStage("running")}
            onDiscardRequest={requestDiscardRun}
            onOpenTimeEditor={() => setTimeEditorOpen(true)}
            onContinueToInstallerSign={() => {
              setInstName(currentUserName ?? "");
              setInstConsent(false);
              setStage("installer-sign");
            }}
            onResolveBlockingIssue={() => {
              setShowSummaryIssues(true);
              if (summaryStage.primaryBlockingIssue) {
                setIssueDetailId(summaryStage.primaryBlockingIssue.id);
              }
            }}
            onJumpToMissingCapture={() => jumpToWorkflowStep(
              summaryStage.missingCaptureTargets[0]?.stepId ?? null,
              summaryStage.missingCaptureTargets[0]?.iterationIndex,
            )}
            onSaveAndClose={async () => {
              setSaving(true);
              try {
                await flushAutosave(undefined, undefined, "InProgress");
                onClose();
              } catch {
                setSaveError("Failed to save progress.");
              } finally {
                setSaving(false);
              }
            }}
            onLockRun={() => {
              const allBomItems = workflow.bomItems ?? [];
              const inventoryItems = allBomItems.filter((i) => i.isInventory);
              const bomConsumableItems = allBomItems.filter((i) => !i.isInventory);
              const bomDescriptions = new Set(bomConsumableItems.map((i) => i.description.toLowerCase()));
              const extraConsumables = libConsumableFeatures.filter(
                (f) => !bomDescriptions.has(f.name.toLowerCase()),
              );
              const hasConsumables = bomConsumableItems.length > 0 || extraConsumables.length > 0;

              if (activeRunId) {
                const bomEntries: BomActualItem[] = allBomItems.map((item) => ({
                  bomItemId: item.id,
                  description: item.description,
                  isInventory: item.isInventory,
                  expectedQty: item.expectedQty,
                  actualQty: item.expectedQty,
                  unitOfMeasure: item.unitOfMeasure,
                  isNA: false,
                  unitCaptures: item.isInventory
                    ? Array.from({ length: item.expectedQty }, () =>
                        Object.fromEntries((item.captureFields ?? ["Serial No"]).map((f) => [f, ""])))
                    : undefined,
                }));
                const libEntries: BomActualItem[] = extraConsumables.map((f) => ({
                  bomItemId: `lib-${f.id}`,
                  description: f.name,
                  isInventory: false,
                  expectedQty: 1,
                  actualQty: 1,
                  unitOfMeasure: "ea",
                  isNA: false,
                }));
                setBomActual([...bomEntries, ...libEntries]);
                setUnlistedConsumables([]);
                if (inventoryItems.length > 0) {
                  setStage("bom");
                } else if (hasConsumables) {
                  setStage("consumables");
                } else {
                  handleSave();
                }
              } else {
                handleSave();
              }
            }}
            onPreviewClose={onClose}
            onPreviewBack={() => setStage("running")}
          />
        )}
        {stage === "bom" && (
          <WorkOrderRunnerBomStage
            assetTag={assetTag}
            workflow={workflow}
            libConsumableFeatures={libConsumableFeatures}
            bomActual={bomActual}
            setBomActual={setBomActual}
            saving={saving}
            onBack={() => setStage("summary")}
            onContinue={() => {
              const hasConsumables =
                (workflow.bomItems ?? []).some((i) => !i.isInventory) || libConsumableFeatures.length > 0;
              if (hasConsumables) setStage("consumables");
              else void handleSave();
            }}
          />
        )}
        {stage === "consumables" && (
          <WorkOrderRunnerConsumablesStage
            assetTag={assetTag}
            workflow={workflow}
            bomActual={bomActual}
            setBomActual={setBomActual}
            unlistedConsumables={unlistedConsumables}
            setUnlistedConsumables={setUnlistedConsumables}
            saving={saving}
            onBack={() => setStage((workflow.bomItems ?? []).some((i) => i.isInventory) ? "bom" : "summary")}
            onComplete={(merged) => { void handleSave(merged); }}
          />
        )}
        {stage === "installer-sign" && (
          <WorkOrderRunnerInstallerSignStage
            assetTag={assetTag}
            stepsCount={stepsSorted.length}
            instName={instName}
            onInstNameChange={setInstName}
            instOutcome={instOutcome}
            onInstOutcomeChange={setInstOutcome}
            instNotes={instNotes}
            onInstNotesChange={setInstNotes}
            instConsent={instConsent}
            onInstConsentChange={setInstConsent}
            instError={instError}
            instSaving={instSaving}
            instPadOnChange={instPadOnChange}
            onClose={handleClose}
            onSign={handleInstallerSign}
          />
        )}
        {stage === "customer-sign" && (
          <WorkOrderRunnerCustomerSignStage
            assetTag={assetTag}
            stepsCount={stepsSorted.length}
            custMode={custMode}
            onCustModeChange={setCustMode}
            custName={custName}
            onCustNameChange={setCustName}
            custTitle={custTitle}
            onCustTitleChange={setCustTitle}
            custEmail={custEmail}
            onCustEmailChange={setCustEmail}
            custOutcome={custOutcome}
            onCustOutcomeChange={setCustOutcome}
            custNotes={custNotes}
            onCustNotesChange={setCustNotes}
            custPadOnChange={custPadOnChange}
            linkSent={linkSent}
            linkEmail={linkEmail}
            onLinkEmailChange={setLinkEmail}
            linkName={linkName}
            onLinkNameChange={setLinkName}
            linkHours={linkHours}
            onLinkHoursChange={setLinkHours}
            linkMsg={linkMsg}
            onLinkMsgChange={setLinkMsg}
            custError={custError}
            onClearCustError={() => setCustError(null)}
            custSaving={custSaving}
            linkSending={linkSending}
            onClose={handleClose}
            onWaiveSignature={handleWaiveCustomerSignature}
            onSignNow={handleCustomerSignNow}
            onSendLink={handleSendLink}
          />
        )}
        {/* â"€â"€ Persistent offline / sync bar â"€â"€ */}
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
                ? `Syncing ${pendingCount} queued action${pendingCount !== 1 ? "s" : ""}...`
                : !isOnline
                  ? `Offline${pendingCount > 0 ? ` - ${pendingCount} action${pendingCount !== 1 ? "s" : ""} queued` : ""}`
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
          timeZoneId={resolvedTimeZone}
          onClose={() => setIssueDetailId(null)}
          onSave={(updated) => handleIssueDetailSave(updated as RunIssue)}
        />
      )}
      {activeRun && (
        <TimeEntriesEditorDialog
          open={timeEditorOpen}
          run={activeRun}
          projectId={projectIdProp}
          timeZoneId={resolvedTimeZone}
          readOnly={!runEditPerms.time}
          onClose={() => setTimeEditorOpen(false)}
          onSaved={(updated) => {
            setActiveRun(updated);
            syncRunTimeState(updated);
          }}
        />
      )}

      {/* Discard run confirmation */}
      <Dialog open={discardConfirmOpen} onClose={() => !discarding && setDiscardConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Discard workflow run?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            {discardError && <Alert severity="error">{discardError}</Alert>}
            <Typography variant="body2">
              This will permanently delete all captured field data, photos, flagged issues, and time tracker entries for this run. You cannot undo this action.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use <strong>Pause</strong> instead if you want to save progress and resume later.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardConfirmOpen(false)} disabled={discarding}>Keep progress</Button>
          <Button color="error" variant="contained" onClick={() => void handleDiscardRun()} disabled={discarding}>
            {discarding ? <CircularProgress size={18} /> : "Discard run"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modify qty dialog â€" for feature-linked repeatable steps */}
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
              placeholder="e.g. Only 3 cameras were delivered on site..."
              InputLabelProps={{ shrink: true }}
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
