import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, Grid,
  IconButton, InputLabel, LinearProgress, MenuItem, Paper, Select, Snackbar, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import {
  AssessmentOutlined, AssignmentLateOutlined, CheckCircleOutlineOutlined, CheckCircleOutlined, CloseOutlined,
  EditOutlined, ErrorOutlineOutlined, ExpandLessOutlined, ExpandMoreOutlined,
  FactCheckOutlined, FolderOutlined, OpenInNewOutlined, PendingActionsOutlined, PersonOutlined,
  PhotoCameraOutlined, PlayArrowOutlined, PrintOutlined, ReportOutlined, SwitchAccountOutlined, TrendingDownOutlined, TrendingFlatOutlined, TrendingUpOutlined,
  WarningAmberOutlined, WorkOutlineOutlined,
} from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shouldSkipBlockingFetch } from "../../services/connectivityMonitor";
import { useRepoSubscription } from "../../hooks/useRepoSubscription";
import { useProjectTimeZone } from "../../hooks/useProjectTimeZone";
import { Link, useNavigate } from "react-router-dom";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProjects, setProjects, updateProjectStatus } from "../../store/projectSlice";
import { fetchProducts } from "../../store/productsSlice";
import { fetchUsers } from "../../store/usersSlice";
import { officesService } from "../../services/officesService";
import {
  assetWorkflowRunService,
  isAssetSignatureStatusFinalized,
  isPendingCustomerSignature,
  isPendingInstallerSignature,
  type OpenIssueRecord,
  type PendingSignatureRecord,
} from "../../services/assetWorkflowRunService";
import { IssueRepository } from "../../repositories/IssueRepository";
import {
  projectAssetService,
  type DashboardWorkspace,
  type DashboardWorkspaceAssetItem,
  type OpenAssetItem,
  type ProjectAssetSummaryItem,
  type TechnicianWorkloadSummaryItem,
} from "../../services/projectAssetService";
import { dashboardService, type EvidenceCompleteness, type WorkflowHealth } from "../../services/dashboardService";
import { inspectionImportService } from "../../services/inspectionImportService";
import api from "../../services/api";
import { assetDocumentLinkService } from "../../services/assetDocumentLinkService";
import { generateTechnicianReport, type TechnicianReportData } from "../../utils/generateTechnicianReport";
import {
  dashboardWorkspaceHasRows,
  mergeDashboardWorkspace,
  mergeDashboardWorkspaceItems,
  dedupeDashboardWorkspace,
} from "../../utils/dashboardWorkspaceMerge";
import {
  shouldFetchProjectAssetSummary,
  shouldFetchTechnicianWorkload,
} from "../../utils/dashboardFetchScope";
import { countMissingWorkflowItems, runHasCompletedAllSteps } from "../../utils/workflowCompleteness";
import { formatInstant } from "../../utils/datetime";
import { randomId } from "../../utils/randomId";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import { workflowConfigService } from "../../services/workflowConfigService";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import { WorkflowAssignmentRepository } from "../../repositories/WorkflowAssignmentRepository";
import { workflowTypeService } from "../../services/workflowTypeService";
import PhotoUploadDialog, { type MissingMediaFlag as PhotoMissingMediaFlag, type PhotoUpdateNotification } from "./PhotoUploadDialog";
import WorkOrderRunner from "../workInstructions/WorkOrderRunner";
import AssetDocumentsDialog from "../installations/AssetDocumentsDialog";
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";
import type { WorkflowAssignment, WorkflowType } from "../../types/workflowType";
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import type { Workflow } from "../../types/workflow";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { AssetIssue, ProjectAsset } from "../../types/projectAsset";
import { brandSettingsService } from "../../services/brandSettingsService";
import { featureService } from "../../services/featureService";
import type { Feature as LibFeature } from "../../types/feature";
import { generateWorkflowReport, resolveImageToDataUrl } from "../../utils/generateWorkflowReport";
import { resolveReportTimeZone } from "../../utils/datetime";
import { isMobileNativePlatform } from "../../utils/platform";
import { markWorkflowOpenTap } from "../../utils/workflowOpenPerf";
import {
  loadWorkflowOpenPayload,
  refreshWorkflowOpenDataInBackground,
  OFFLINE_CONFIG_MISSING_MESSAGE,
  isOfflineConfigMissingContext,
  retryOfflineDownload,
} from "../../services/workflowOpenService";
import { getWorkflowDisplayState, myJobsCardChipFromDisplayState, type WorkflowDisplayState } from "../../utils/workflowDisplayState";
import { mediaStore } from "../../services/mediaStore";
import { buildProjectRequestKey, type ProjectRepositoryUpdateDetail } from "../../repositories/ProjectRepository";
import { get as dcGet, put as dcPut, DASHBOARD_CACHE_KEYS } from "../../services/dashboardCache";
import { entityGetAsset } from "../../services/localDB";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function isPausedAsset(status?: string | null) {
  return (status ?? "").toLowerCase() === "paused";
}

function isInProgressAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "inprogress" || value === "issue" || value === "hasissue";
}

function isNotStartedAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase();
  return value === "notstarted" || value === "not started";
}

function isIssueAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "issue" || value === "hasissue";
}

function isPendingAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "pending";
}

function isClosedAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "closed";
}

function isWaitingForSignature(signatureStatus?: string | null) {
  const value = (signatureStatus ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "pendingcustomer" || value === "pendinginstaller";
}

function pendingSignatureStageLabel(signatureStatus?: string | null) {
  const value = (signatureStatus ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "pendinginstaller") return "Installer sign-off";
  if (value === "pendingcustomer") return "Customer sign-off";
  return "Sign-off";
}

function pendingSignatureStageText(signatureStatus?: string | null) {
  const value = (signatureStatus ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "pendinginstaller") return "Awaiting installer sign-off";
  if (value === "pendingcustomer") return "Awaiting customer sign-off";
  return "Awaiting sign-off";
}

function isActiveAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "notstarted" || value === "inprogress" || value === "onhold" 
    || value === "issue" || value === "pending";
}

function isOpenInspectionStatus(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "notstarted" || value === "inprogress" || value === "paused" || value === "onhold";
}

// Phase 3a: unified status chip for the Dashboard lists, aligned with the shared
// display-state vocabulary (getWorkflowDisplayState / the Assets page card), so
// the Dashboard and Assets page agree on status labels and colors.
//
// The Dashboard lists work off lightweight summary fields (runStatus/status/
// evidenceStatus/signatureStatus) and do NOT load full runs, so this derives
// from those fields rather than the full shared function. Vocabulary matches the
// shared model:
//   - raw "Issue"  -> label "In Progress", color "error" (Option A: the label
//     matches the Assets page R2 rule, but the chip stays RED so a blocking
//     issue is still visible on the Dashboard even without the widget row).
//   - "Pending"    -> "Pending sign"
//   - "Paused"     -> "Paused by user"
//
// UPGRADE SEAM (Option 1, future): when the Dashboard loads full runs per listed
// asset, replace this with getWorkflowDisplayState(asset, runs, opts).status and
// render its feature.widgets alongside — the label/color vocabulary already
// matches, so only the data source changes.
function dashboardStatusChip(asset: { runStatus?: string | null; status?: string | null; signatureStatus?: string | null; evidenceStatus?: string | null; hasOpenIssues?: boolean }): {
  label: string;
  color: "default" | "primary" | "success" | "error" | "warning" | "info";
} {
  const hasIssue = isIssueAsset(asset.status) || isIssueAsset(asset.runStatus);
  if (asset.hasOpenIssues === true) return { label: "In Progress", color: "error" };
  if ((asset.evidenceStatus ?? "").toLowerCase() === "missingdata") return { label: "Missing", color: "error" };
  if (hasIssue) return { label: "In Progress", color: asset.hasOpenIssues === false ? "primary" : "error" };
  if (isPausedAsset(asset.runStatus)) return { label: "Paused by user", color: "warning" };
  if (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)) return { label: "In Progress", color: "primary" };
  if (isNotStartedAsset(asset.status)) return { label: "Not Started", color: "default" };
  if (isPendingAsset(asset.status)) return { label: "Pending sign", color: "info" };
  return { label: asset.runStatus || asset.status || "Unknown", color: "default" };
}

// Resting-face widgets for the "My Jobs" cards. Mirrors the Assets page
// getWorkflowDisplayState().feature.widgets vocabulary, but derived from the
// Dashboard summary fields (see Option B note in getMyJobsCardAction).
type MyJobsCardWidget = {
  kind: "missing-photo" | "issue";
  /** exact count for missing-photo; 0 for the generic issue marker */
  count: number;
  color: "warning" | "error";
};

type MyJobsCardAction = {
  actionKind: "default" | "missing-media" | "resolve-blocking" | "signature";
  chipLabel: string;
  chipColor: "default" | "primary" | "success" | "error" | "warning" | "info";
  buttonLabel: string;
  buttonColor: "inherit" | "primary" | "success" | "warning" | "error" | "info";
  helperText: string;
  widgets: MyJobsCardWidget[];
};

function myJobsAssetIdsKey(assets: Array<{ id: string }>): string {
  return assets.map((a) => a.id).sort().join(",");
}

function assetLikelyHasWorkflow(
  asset: { totalSteps?: number; workflowSummary?: { hasWorkflow?: boolean } },
  cachedAsset?: ProjectAsset | null,
): boolean {
  if ((asset.totalSteps ?? 0) > 0) return true;
  if (asset.workflowSummary?.hasWorkflow) return true;
  if (cachedAsset?.productConfigId || cachedAsset?.workflowTemplateId) return true;
  if (cachedAsset?.workflowSummary?.hasWorkflow) return true;
  return false;
}

type NativeMyJobsCardContext = {
  asset: ProjectAsset;
  runs: AssetWorkflowRun[];
};

function myJobsCardWidgetsFromDisplayState(displayState: WorkflowDisplayState): MyJobsCardWidget[] {
  const widgets: MyJobsCardWidget[] = [];
  if (displayState.gates.missingMediaCount > 0) {
    widgets.push({
      kind: "missing-photo",
      count: displayState.gates.missingMediaCount,
      color: "warning",
    });
  }
  if (displayState.gates.openIssueCount > 0) {
    widgets.push({
      kind: "issue",
      count: displayState.gates.openIssueCount,
      color: "error",
    });
  }
  return widgets;
}

function myJobsCardHelperTextFromDisplayState(displayState: WorkflowDisplayState): string {
  const actionKind = displayState.action?.kind ?? "none";
  if (actionKind === "add-missing-photos") {
    const count = displayState.gates.missingMediaCount;
    return count > 0
      ? `${count} missing photo${count === 1 ? "" : "s"}`
      : "Required workflow captures are still missing";
  }
  if (actionKind === "resolve-blocking") {
    const count = displayState.gates.blockingIssueCount;
    return count > 0
      ? `${count} blocking issue${count === 1 ? "" : "s"}`
      : "Resolve the blocking issue before continuing";
  }
  if (actionKind === "installer-sign") return "Awaiting installer sign-off";
  if (actionKind === "customer-sign") return "Awaiting customer sign-off";
  if (actionKind === "resume") return "Paused by user";
  if (actionKind === "continue") {
    return displayState.gates.openIssueCount > 0 ? "In progress - issue flagged" : "Running";
  }
  if (actionKind === "start") return "Ready to start";
  if (actionKind === "run-details") return "Field work complete";
  if (actionKind === "upload-json") return "Import an inspection definition";
  if (actionKind === "no-workflow") return "Assign a workflow to this asset first";
  return displayState.status.label;
}

function compactNativeActionLabel(label: string): string {
  if (label === "Add Missing Photos") return "Add Photos";
  if (label === "Resolve Blocking Issue") return "Resolve Issue";
  if (label.startsWith("Resolve ") && label.includes("Blocking Issues")) return "Resolve Issues";
  return label;
}

function myJobsCardActionFromDisplayState(displayState: WorkflowDisplayState, compact = false): MyJobsCardAction {
  const actionKind = displayState.action?.kind ?? "run-details";
  const widgets = myJobsCardWidgetsFromDisplayState(displayState);
  const chip = myJobsCardChipFromDisplayState(displayState);
  const hasMissingMedia = actionKind === "add-missing-photos";

  let resolvedActionKind: MyJobsCardAction["actionKind"] = "default";
  if (actionKind === "add-missing-photos") resolvedActionKind = "missing-media";
  else if (actionKind === "resolve-blocking") resolvedActionKind = "resolve-blocking";
  else if (actionKind === "installer-sign" || actionKind === "customer-sign") resolvedActionKind = "signature";

  return {
    actionKind: resolvedActionKind,
    chipLabel: chip.label,
    chipColor: chip.color,
    buttonLabel: compact
      ? compactNativeActionLabel(displayState.action?.label ?? "Run Details")
      : (displayState.action?.label ?? "Run Details"),
    buttonColor:
      actionKind === "add-missing-photos" || actionKind === "installer-sign" || actionKind === "customer-sign"
        ? "warning"
        : actionKind === "resolve-blocking"
          ? "error"
          : actionKind === "resume" || actionKind === "continue"
            ? "primary"
            : "inherit",
    helperText: myJobsCardHelperTextFromDisplayState(displayState),
    widgets,
  };
}

function formatStepCompletionPercent(completedSteps: number, totalSteps: number) {
  if (totalSteps <= 0) return null;
  const percent = Math.round((Math.max(0, completedSteps) / totalSteps) * 100);
  return `${Math.min(100, percent)}% complete`;
}

function formatMyJobsStepCompletionLabel(completedSteps: number, totalSteps: number) {
  if (totalSteps <= 0) return null;
  const percent = Math.round((Math.max(0, completedSteps) / totalSteps) * 100);
  return `${Math.min(100, percent)}% completed`;
}

function workflowModeLabel(workflowMode?: string | null) {
  if (workflowMode === "INSPECTION_ONLY") return "Inspection";
  if (workflowMode === "MIXED") return "Mixed";
  return "Installation";
}

function workflowModeChipColor(workflowMode?: string | null): "success" | "info" | "warning" {
  if (workflowMode === "INSPECTION_ONLY") return "info";
  if (workflowMode === "MIXED") return "warning";
  return "success";
}

function historyChipColor(status?: string | null): "default" | "success" | "warning" | "error" | "info" {
  const value = (status ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "closed") return "info";
  if (value === "fieldworkcomplete" || value === "completed" || value === "finished") return "success";
  if (value === "deleted") return "error";
  if (value === "cancelled") return "warning";
  return "default";
}

function GaugeCircle({ value, size = 80, color = "primary.main" }: { value: number; size?: number; color?: string }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={7} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="currentColor"
          strokeWidth={7}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ color: color === "primary.main" ? "#2dd4bf" : color }}
        />
      </svg>
      <Typography variant="caption" fontWeight={700}
        sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 70 ? "1rem" : "0.75rem" }}>
        {value}%
      </Typography>
    </Box>
  );
}

// Derives the workflowTypeId a config implies, since a config's own type is
// redundant to ask the user for separately (mirrors AssetInstallationPage).
function resolveConfigWorkflowTypeId(config: WorkflowConfig, types: WorkflowType[]): string {
  if (config.workflowTypeId) return config.workflowTypeId;
  const normalized = config.configType?.trim().toLowerCase();
  if (!normalized) return "";
  return types.find((t) => t.name.trim().toLowerCase() === normalized)?.id ?? "";
}

const WINDOW_OPTIONS = [30, 60, 90, 180];

const ALL_DASHBOARDS_VALUE = "__all__";
const DASHBOARD_WORKSPACE_SESSION_PREFIX = "dashboard:web:workspace:";
const DASHBOARD_ATTENTION_SESSION_PREFIX = "dashboard:web:attention:";
const DASHBOARD_ASSIGNMENT_RECOVERY_KEY = "dashboard:pending-assignment-recovery";
const DASHBOARD_RUN_STATE_RECOVERY_KEY = "dashboard:pending-run-state-recovery";
const DASHBOARD_PROJECT_REQUEST_KEY = buildProjectRequestKey();

type PmDashboardTab = "pm-projects" | "my-inspections" | "my-installs";

type DashboardTabSignal = {
  count: number;
  tone: "primary" | "warning" | "error" | "info" | "success";
};
type DashboardProjectScope = "mine" | "all";

type InspectionRunSignal = {
  id: string;
  projectId: string;
  assignedUserId?: string;
  status: string;
};

type AdminInstallFilter = "all" | "in-progress" | "unassigned";

type WorkloadProjectBreakdown = { projectId: string; jobNumber: string; notStarted: number; inProgress: number; paused: number; total: number };
type ScopedWorkloadItem = TechnicianWorkloadSummaryItem & {
  projectBreakdown: WorkloadProjectBreakdown[];
};

function isDashboardVisibleProjectStatus(status?: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return normalized !== "cancelled"
    && normalized !== "closed"
    && normalized !== "archived";
}

const Dashboard = () => {
  const navigate   = useNavigate();
  const { user, isAuthenticated }   = useAuth();
  const can        = usePermissions();
  const isAdmin      = user.role === "Admin";
  const isManager    = user.role === "Admin" || user.role === "Project Manager";
  const isSupervisor = user.role === "Supervisor";
  const isEngineer   = user.role === "Engineer" || user.role === "QA Inspector";
  const isViewer     = user.role === "Viewer" || user.role === "Client";
  const canActAsFieldTechnician = !!can.installationAssets?.runWorkflow && !isViewer;
  const isNativePlatform = isMobileNativePlatform();
  const showNativeManagerHome = isManager && isNativePlatform;
  /** Gates the heaviest dashboard query to the roles that actually render WorkloadPanel. */
  const needsTechnicianWorkload = shouldFetchTechnicianWorkload(user.role);
  /** Gates the active-summary aggregate to the roles that render project completion cards. */
  const needsProjectAssetSummary = shouldFetchProjectAssetSummary(user.role);
  // Every role (installers included) gets the light workspace first paint; the
  // card-flicker this used to cause is handled by the stabilize/merge logic below.
  // Native is unaffected by the session cache either way - it reads its own cache via dcGet.
  const shouldUseDashboardWorkspaceSessionCache = !isNativePlatform;

  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const dispatch      = useAppDispatch();
  const projects      = useAppSelector((s) => s.projects.items);
  const products      = useAppSelector((s) => s.products.items);
  const users         = useAppSelector((s) => s.users.items);
  // Used only to mirror useShellCatalogBootstrap's "fetch once if empty" guard below.
  const projectsCatalogLoading = useAppSelector((s) => s.projects.loading);
  const productsCatalogLoading = useAppSelector((s) => s.products.loading);
  const usersCatalogLoading    = useAppSelector((s) => s.users.loading);

  const [globalOffices,      setGlobalOffices]      = useState<Office[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [openIssues,         setOpenIssues]         = useState<OpenIssueRecord[]>([]);
  const [pendingSigs,        setPendingSigs]        = useState<PendingSignatureRecord[]>([]);
  const [attentionLoading,   setAttentionLoading]   = useState(false);
  const [openAssets,         setOpenAssets]         = useState<OpenAssetItem[]>([]);
  const [projectAssetSummary, setProjectAssetSummary] = useState<ProjectAssetSummaryItem[]>([]);
  const [workload,           setWorkload]           = useState<TechnicianWorkloadSummaryItem[]>([]);
  const [workloadLoading,    setWorkloadLoading]    = useState(false);
  const [reportingTechId,    setReportingTechId]    = useState<string | null>(null);
  const [expandedWorkloadId, setExpandedWorkloadId] = useState<string | null>(null);
  const [workloadReportTarget, setWorkloadReportTarget] = useState<ScopedWorkloadItem | null>(null);
  const [workloadReportAllOpen, setWorkloadReportAllOpen] = useState(false);

  // Phase 4 - evidence
  const [evidenceData,    setEvidenceData]    = useState<EvidenceCompleteness | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState(false);
  const [evidenceWindow,  setEvidenceWindow]  = useState(90);

  // Phase 5 - workflow health
  const [healthData,    setHealthData]    = useState<WorkflowHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState(false);
  const [healthWindow,  setHealthWindow]  = useState(90);

  // Incremented by run-state events to trigger analytics re-fetch
  const [analyticsRefreshTick, setAnalyticsRefreshTick] = useState(0);
  const analyticsSectionRef = useRef<HTMLDivElement | null>(null);
  const analyticsObserverRef = useRef<IntersectionObserver | null>(null);
  /**
   * Web: the analytics APIs only fire once EvidenceHealthGrid nears the viewport, so a
   * PM sitting on My Inspections / My Installs never pays for them. Native starts
   * enabled because ManagerMobileHome's default tab ("projects") renders the grid
   * immediately, and native skips the observer.
   */
  const [analyticsLoadEnabled, setAnalyticsLoadEnabled] = useState(isNativePlatform);
  /** True while EvidenceHealthGrid is actually rendered (i.e. the analytics tab is active). */
  const [analyticsSectionMounted, setAnalyticsSectionMounted] = useState(false);
  const analyticsSectionCallbackRef = useCallback((node: HTMLDivElement | null) => {
    analyticsSectionRef.current = node;
    analyticsObserverRef.current?.disconnect();
    analyticsObserverRef.current = null;
    setAnalyticsSectionMounted(!!node);
    if (!node || isNativePlatform || !isManager) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setAnalyticsLoadEnabled(true); },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    analyticsObserverRef.current = observer;
  }, [isManager, isNativePlatform]);

  // For Engineer: draft workflow configs
  const [draftConfigs, setDraftConfigs] = useState<{id:string; name:string; updatedAt?:string}[]>([]);

  // PM: auto-assign flags from installers self-assigning
  type AutoAssignFlag = { id: string; assetId: string; assetTag: string; jobNumber: string; assignedBy: string; assignedAt: string };
  const [autoAssignFlags, setAutoAssignFlags] = useState<AutoAssignFlag[]>(() =>
    JSON.parse(localStorage.getItem("pm_auto_assign_flags") ?? "[]")
  );
  const [mobileManagerTab, setMobileManagerTab] = useState<"projects" | "inspections" | "installs">("projects");

  // Missing media flags - runs completed without photos/videos.
  type MissingMediaFlag = PhotoMissingMediaFlag;
  type PhotoReminder = { id: string; runId: string; assetTag: string; jobNumber: string; workflowName: string; sentAt: string; sentByName: string };

  const [missingMediaFlags, setMissingMediaFlags] = useState<MissingMediaFlag[]>(() => {
    const raw: MissingMediaFlag[] = JSON.parse(localStorage.getItem("pm_missing_media_flags") ?? "[]");
    // Normalize old-format flags that predate missingSteps field
    return raw.map((f) => ({ ...f, missingSteps: f.missingSteps ?? [], totalExpected: f.totalExpected ?? 0, totalCaptured: f.totalCaptured ?? 0 }));
  });
  const [photoUpdateNotifications, setPhotoUpdateNotifications] = useState<PhotoUpdateNotification[]>(() =>
    JSON.parse(localStorage.getItem("pm_photo_update_notifications") ?? "[]")
  );
  const [photoReminders, setPhotoReminders] = useState<PhotoReminder[]>(() =>
    JSON.parse(localStorage.getItem("installer_photo_reminders") ?? "[]")
  );
  const [photoUploadTarget, setPhotoUploadTarget] = useState<MissingMediaFlag | null>(null);
  const [closingDashboardProjectId, setClosingDashboardProjectId] = useState<string | null>(null);
  const [photoUploadMode, setPhotoUploadMode] = useState<"installer" | "pm">("installer");
  const [reminderSentId, setReminderSentId] = useState<string | null>(null);
  const [issueDetailTarget, setIssueDetailTarget] = useState<{
    issue: AssetIssue | RunIssue;
    assetId: string;
    runId?: string;
    source: "asset" | "run";
  } | null>(null);
  const [resolvingDashboardIssueId, setResolvingDashboardIssueId] = useState<string | null>(null);
  // Per-asset, not a shared boolean: with one flag every "View" button in Job
  // History span and disabled at once, so pressing one row looked like the app
  // had fired all of them. Mirrors the existing runnerLoading pattern.
  const [historyDialogLoading, setHistoryDialogLoading] = useState<string | null>(null);
  const nativeDashboardRefreshTimerRef = useRef<number | null>(null);
  const dashboardRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const dashboardRefreshQueuedRef = useRef(false);
  const attentionInFlightRef = useRef<Promise<void> | null>(null);
  const attentionQueuedRef = useRef(false);

  // Quick action dialog for "My Jobs Today" assets (state declared after myInstallAssets is defined)
  const [inspectionRunsDue, setInspectionRunsDue] = useState(0);
  const [inspectionImportsWaiting, setInspectionImportsWaiting] = useState(0);
  const [inspectionImportsFailed, setInspectionImportsFailed] = useState(0);
  const [adminInstallFilter, setAdminInstallFilter] = useState<AdminInstallFilter>("all");
  const [adminInstallProjectsOpen, setAdminInstallProjectsOpen] = useState(false);
  const [adminInstallPmFilter, setAdminInstallPmFilter] = useState("");
  const [adminInstallProjectFilter, setAdminInstallProjectFilter] = useState("");
  // Always open on the Projects tab for managers; others open on their first relevant tab.
  // Note: useAuth starts with role="Viewer" and updates async from secure storage, so
  // isManager is false on the very first render. We use a one-shot ref to correct the
  // tab to "pm-projects" once the real role resolves, without overriding later user navigation.
  const [pmDashboardTab, setPmDashboardTab] = useState<PmDashboardTab>(
    isManager ? "pm-projects" : "my-installs"
  );
  const tabRoleCorrected = useRef(false);
  const fieldTabCorrected = useRef(false);
  const dashboardProjectScopeCorrected = useRef(false);
  // If the role's viewScope is "own", always lock to "mine" — no dropdown shown.
  const canViewAllProjects = (can.projects?.viewScope ?? "own") === "all";
  // Admin defaults to "all" (oversight view); every other role defaults to "mine".
  const [dashboardProjectScope, setDashboardProjectScope] = useState<DashboardProjectScope>(
    isAdmin ? "all" : "mine"
  );
  const [dashboardWorkspace, setDashboardWorkspace] = useState<DashboardWorkspace>({
    currentInstalls: [],
    currentInspections: [],
    installHistory: [],
    inspectionHistory: [],
  });
  const dashboardWorkspaceRef = useRef<DashboardWorkspace>({
    currentInstalls: [],
    currentInspections: [],
    installHistory: [],
    inspectionHistory: [],
  });
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [dashboardBootPhase, setDashboardBootPhase] = useState<"workspace" | "full">("workspace");
  const unlockDeferredDashboardBoot = useCallback(() => {
    setDashboardBootPhase((current) => current === "full" ? current : "full");
  }, []);

  useEffect(() => {
    dashboardWorkspaceRef.current = dashboardWorkspace;
  }, [dashboardWorkspace]);

  // Admin: view another user's dashboard
  // Derived from the Redux users catalog rather than a second GET /users. The
  // "View as" picker needs exactly the fields the catalog already carries, so
  // fetching again just to drop the current user doubled the request on every
  // manager's dashboard boot.
  const dashboardUsers = useMemo(
    () => (isManager
      ? users
          .filter((u) => u.id !== user.id)
          .map((u) => ({ id: u.id, fullName: u.fullName, role: u.role, office: u.office ?? "" }))
      : []),
    [isManager, user.id, users],
  );
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>(isAdmin ? ALL_DASHBOARDS_VALUE : user.id);
  const dashboardWorkspaceScopeId = isManager && selectedDashboardId !== ALL_DASHBOARDS_VALUE ? selectedDashboardId : undefined;
  // Offline local reads have no JWT — scope to the logged-in user unless a manager
  // is explicitly viewing all dashboards (org-wide cache is intentional there).
  const effectiveDashboardWorkspaceUserId =
    isManager && selectedDashboardId === ALL_DASHBOARDS_VALUE
      ? undefined
      : (dashboardWorkspaceScopeId ?? user.id);
  const dashboardWorkspaceSessionKey = useMemo(
    () => `${DASHBOARD_WORKSPACE_SESSION_PREFIX}${user.id || "anonymous"}:${dashboardWorkspaceScopeId ?? "self"}`,
    [dashboardWorkspaceScopeId, user.id],
  );
  const readCachedDashboardWorkspace = useCallback((): DashboardWorkspace | null => {
    if (isNativePlatform) {
      return dcGet<DashboardWorkspace>(DASHBOARD_CACHE_KEYS.dashboardWorkspace);
    }
    if (!shouldUseDashboardWorkspaceSessionCache) return null;
    if (!user.id) return null;
    try {
      const raw = window.sessionStorage.getItem(dashboardWorkspaceSessionKey);
      return raw ? (JSON.parse(raw) as DashboardWorkspace) : null;
    } catch {
      return null;
    }
  }, [dashboardWorkspaceSessionKey, isNativePlatform, shouldUseDashboardWorkspaceSessionCache, user.id]);
  const writeCachedDashboardWorkspace = useCallback((data: DashboardWorkspace) => {
    if (isNativePlatform) {
      dcPut(DASHBOARD_CACHE_KEYS.dashboardWorkspace, data);
      return;
    }
    if (!shouldUseDashboardWorkspaceSessionCache) return;
    if (!user.id) return;
    try {
      window.sessionStorage.setItem(dashboardWorkspaceSessionKey, JSON.stringify(data));
    } catch {
      // Ignore storage unavailability/quota errors.
    }
  }, [dashboardWorkspaceSessionKey, isNativePlatform, shouldUseDashboardWorkspaceSessionCache, user.id]);
  const applyDashboardWorkspace = useCallback((
    data: DashboardWorkspace,
    options?: { persist?: boolean; stabilize?: boolean },
  ) => {
    const previous = dashboardWorkspaceRef.current;
    const next = mergeDashboardWorkspace(previous, data, {
      stabilize: options?.stabilize ?? true,
    });
    dashboardWorkspaceRef.current = next;
    setDashboardWorkspace(next);
    if (options?.persist === false) return;
    // Never persist a workspace regression to empty when we already had rows.
    if (dashboardWorkspaceHasRows(previous) && !dashboardWorkspaceHasRows(next)) return;
    writeCachedDashboardWorkspace(next);
  }, [writeCachedDashboardWorkspace]);

  const seedNativeDashboardSummariesFromLocal = useCallback(() => {
    if (!isNativePlatform) return;

    void projectAssetService.technicianWorkloadSummaryLocal()
      .then((data) => {
        setWorkload((prev) => (data.length > 0 || prev.length === 0 ? data : prev));
        dcPut(DASHBOARD_CACHE_KEYS.workload, data);
        setWorkloadLoading(false);
      })
      .catch(() => {});

    void projectAssetService.listOpenLocal()
      .then((data) => {
        setOpenAssets((prev) => (data.length > 0 || prev.length === 0 ? data : prev));
        dcPut(DASHBOARD_CACHE_KEYS.openAssets, data);
      })
      .catch(() => {});

    void projectAssetService.activeSummaryLocal()
      .then((data) => {
        setProjectAssetSummary((prev) => (data.length > 0 || prev.length === 0 ? data : prev));
        dcPut(DASHBOARD_CACHE_KEYS.projectAssetSummary, data);
      })
      .catch(() => {});
  }, [isNativePlatform]);

  const seedNativeDashboardWorkspaceFromLocal = useCallback(() => {
    if (!isNativePlatform) return;

    void projectAssetService.dashboardWorkspaceLocal(effectiveDashboardWorkspaceUserId)
      .then((data) => {
        if (!dashboardWorkspaceHasRows(data)) return;
        applyDashboardWorkspace(data, { persist: false, stabilize: true });
        setCacheHydrated(true);
        setWorkspaceLoading(false);
      })
      .catch(() => {});
  }, [applyDashboardWorkspace, dashboardWorkspaceHasRows, effectiveDashboardWorkspaceUserId, isNativePlatform]);

  const countryForOffice = useMemo(() => createCountryResolver(globalOffices), [globalOffices]);
  const officeIdsForRegion = useMemo(() => {
    if (activeOffice === "All") return null;
    return new Set(globalOffices.filter((o) => o.country === activeOffice).map((o) => o.id));
  }, [activeOffice, globalOffices]);

  // officesService serves cache first and refreshes in the background; re-read
  // when that lands or the office filter stays on pre-refresh values.
  useRepoSubscription(["repo:offices:updated"], () => {
    void officesService.getAll().then((offices) => {
      setGlobalOffices(offices);
      setAvailableCountries(Array.from(new Set(offices.map((o) => o.country).filter(Boolean))).sort());
    }).catch(() => {});
  });

  useEffect(() => {
    officesService.getAll().then((offices) => {
      setGlobalOffices(offices);
      const countries = Array.from(new Set(offices.map((o) => o.country).filter(Boolean))).sort();
      setAvailableCountries(countries);
      if (isNativePlatform) {
        dcPut(DASHBOARD_CACHE_KEYS.globalOffices, offices);
        dcPut(DASHBOARD_CACHE_KEYS.availableCountries, countries);
      }
    }).catch(() => {
      setGlobalOffices([]);
      setAvailableCountries([]);
    });
  }, []);

  const attentionRequestSeqRef = useRef(0);

  const loadAttention = useCallback((): Promise<void> => {
    if (attentionInFlightRef.current) {
      attentionQueuedRef.current = true;
      return attentionInFlightRef.current;
    }

    const requestSeq = ++attentionRequestSeqRef.current;
    const promise = (async () => {
      setAttentionLoading(true);
      const attentionUserId = isManager ? undefined : user.id;
      const applyAttention = (iss: OpenIssueRecord[], sigs: PendingSignatureRecord[]) => {
        if (requestSeq !== attentionRequestSeqRef.current) return;
        setOpenIssues(iss);
        setPendingSigs(sigs);
      };
      const finishAttention = () => {
        if (requestSeq !== attentionRequestSeqRef.current) return;
        setAttentionLoading(false);
      };

      if (isNativePlatform) {
        try {
          const [localIssues, localSigs] = await Promise.all([
            assetWorkflowRunService.listOpenIssues(attentionUserId),
            assetWorkflowRunService.listPendingSignaturesLocal(attentionUserId),
          ]);
          applyAttention(localIssues, localSigs);
        } catch {
          // Keep the current attention widgets if local cache probing fails.
        }
        if (shouldSkipBlockingFetch()) {
          finishAttention();
          return;
        }
        try {
          const [iss, sigs] = await Promise.all([
            assetWorkflowRunService.listOpenIssues(attentionUserId),
            assetWorkflowRunService.listPendingSignatures(attentionUserId),
          ]);
          applyAttention(iss, sigs);
        } catch {
          // Keep local attention widgets on timeout or server errors.
        } finally {
          finishAttention();
        }
        return;
      }

      try {
        const [iss, sigs] = await Promise.all([
          assetWorkflowRunService.listOpenIssues(attentionUserId),
          assetWorkflowRunService.listPendingSignatures(attentionUserId),
        ]);
        applyAttention(iss, sigs);
        if (!isNativePlatform && user.id) {
          try {
            sessionStorage.setItem(
              `${DASHBOARD_ATTENTION_SESSION_PREFIX}${user.id}`,
              JSON.stringify({ issues: iss, sigs }),
            );
          } catch {
            // Ignore storage quota errors.
          }
        }
      } catch {
        // Keep session-cached attention widgets on timeout or server errors.
      } finally {
        finishAttention();
      }
    })();

    attentionInFlightRef.current = promise.finally(() => {
      attentionInFlightRef.current = null;
      if (attentionQueuedRef.current) {
        attentionQueuedRef.current = false;
        void loadAttention();
      }
    });

    return attentionInFlightRef.current;
  }, [isManager, isNativePlatform, user.id]);

  // Silent attention refresh on repo:issues:updated — must NOT call loadAttention()
  // (that re-triggers IssueRepository background fetch → repo:issues:updated loop).
  // Web has no IndexedDB sig snapshot; use the pending-signatures API directly there.
  const refreshAttentionFromIssueCache = useCallback(async () => {
    const attentionUserId = isManager ? undefined : user.id;
    try {
      const [issues, sigs] = await Promise.all([
        isNativePlatform
          ? IssueRepository.getLocalSnapshot()
          : assetWorkflowRunService.listOpenIssues(attentionUserId),
        isNativePlatform
          ? assetWorkflowRunService.listPendingSignaturesLocal(attentionUserId)
          : assetWorkflowRunService.listPendingSignatures(attentionUserId),
      ]);
      setOpenIssues(issues);
      setPendingSigs(sigs);
    } catch {
      // Keep current widgets if the local snapshot read fails.
    }
  }, [isManager, isNativePlatform, user.id]);

  // ── Native cache hydration: show last-known data instantly on mount ──
  useEffect(() => {
    if (!isNativePlatform) return;
    const cOpenIssues = dcGet<OpenIssueRecord[]>(DASHBOARD_CACHE_KEYS.openIssues);
    const cPendingSigs = dcGet<PendingSignatureRecord[]>(DASHBOARD_CACHE_KEYS.pendingSigs);
    const cOpenAssets = dcGet<OpenAssetItem[]>(DASHBOARD_CACHE_KEYS.openAssets);
    const cSummary = dcGet<ProjectAssetSummaryItem[]>(DASHBOARD_CACHE_KEYS.projectAssetSummary);
    const cWorkload = dcGet<TechnicianWorkloadSummaryItem[]>(DASHBOARD_CACHE_KEYS.workload);
    const cWorkspace = dcGet<DashboardWorkspace>(DASHBOARD_CACHE_KEYS.dashboardWorkspace);
    const cOffices = dcGet<Office[]>(DASHBOARD_CACHE_KEYS.globalOffices);
    const cCountries = dcGet<string[]>(DASHBOARD_CACHE_KEYS.availableCountries);
    if (cOpenIssues) setOpenIssues(cOpenIssues);
    if (cPendingSigs) setPendingSigs(cPendingSigs);
    if (cOpenAssets) setOpenAssets(cOpenAssets);
    if (cSummary) setProjectAssetSummary(cSummary);
    if (cWorkload) setWorkload(cWorkload);
    if (cWorkspace && dashboardWorkspaceHasRows(cWorkspace)) applyDashboardWorkspace(cWorkspace, { persist: false, stabilize: true });
    if (cOffices) setGlobalOffices(cOffices);
    if (cCountries) setAvailableCountries(cCountries);
    // Mark cache as hydrated so loading spinners don't override cached data
    if (cOpenIssues || cPendingSigs || cOpenAssets || cSummary || cWorkload || cWorkspace || cOffices || cCountries) {
      setCacheHydrated(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isNativePlatform || !isAuthenticated || !user.id) return;
    const cached = readCachedDashboardWorkspace();
    if (!cached || !dashboardWorkspaceHasRows(cached)) return;
    applyDashboardWorkspace(cached, { persist: false, stabilize: true });
    setCacheHydrated(true);
  }, [applyDashboardWorkspace, isAuthenticated, isNativePlatform, readCachedDashboardWorkspace, user.id]);

  useEffect(() => {
    if (isNativePlatform || !user.id) return;
    try {
      const raw = sessionStorage.getItem(`${DASHBOARD_ATTENTION_SESSION_PREFIX}${user.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { issues?: OpenIssueRecord[]; sigs?: PendingSignatureRecord[] };
      if (parsed.issues) setOpenIssues(parsed.issues);
      if (parsed.sigs) setPendingSigs(parsed.sigs);
    } catch {
      // Ignore corrupt session cache.
    }
  }, [isNativePlatform, user.id]);

  // Web: the observer above loads analytics early when the grid is scrolled near, but the
  // grid sits well below the fold, so on its own it would never fire for a user who does
  // not scroll and the panels would stay empty. Back it with an idle fallback that only
  // runs while the grid is mounted — so a PM on My Inspections / My Installs, where the
  // grid is not rendered, still never triggers the two 90-day aggregations.
  useEffect(() => {
    if (isNativePlatform || !isManager) return;
    if (!analyticsSectionMounted || analyticsLoadEnabled) return;

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const enable = () => setAnalyticsLoadEnabled(true);

    if (typeof requestIdleCallback !== "undefined") {
      idleId = requestIdleCallback(enable, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(enable, 1500);
    }

    return () => {
      if (idleId !== undefined && typeof cancelIdleCallback !== "undefined") cancelIdleCallback(idleId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [analyticsLoadEnabled, analyticsSectionMounted, isManager, isNativePlatform]);

  useEffect(() => () => {
    analyticsObserverRef.current?.disconnect();
    analyticsObserverRef.current = null;
  }, []);

  useEffect(() => {
    if (!isAuthenticated || dashboardBootPhase !== "full") return;
    // AppShell's useShellCatalogBootstrap already warms these three catalogs after auth.
    // Dispatching unconditionally here raced it and double-fetched every catalog on a
    // cold dashboard load (measured: 4x /users for Admin). Mirror the shell's guard so
    // whichever runs first wins and the other is a no-op.
    if (!projects.length && !projectsCatalogLoading) dispatch(fetchProjects());
    if (!products.length && !productsCatalogLoading) dispatch(fetchProducts());
    if (!users.length && !usersCatalogLoading) dispatch(fetchUsers());

    // Must run BEFORE the platform branches below: the web branch returns a cleanup
    // function, which previously made a trailing `if (isEngineer)` block unreachable on
    // web and silently left the Draft Workflows panel empty there. Gated to the tab that
    // renders that panel; the web service call is SWR-cached so switching tabs is cheap.
    if (isEngineer && pmDashboardTab === "my-installs") {
      workflowConfigService.getAll().then((configs) => {
        setDraftConfigs(configs.filter((c: { status?: string }) => c.status === "Draft" || c.status === "draft"));
      }).catch(() => {});
    }

    if (isNativePlatform) {
      seedNativeDashboardSummariesFromLocal();
      setWorkloadLoading(false);
      loadAttention();
      if (!shouldSkipBlockingFetch()) {
        if (needsTechnicianWorkload) {
          void projectAssetService.technicianWorkloadSummary()
            .then((w) => { setWorkload(w); dcPut(DASHBOARD_CACHE_KEYS.workload, w); })
            .catch(() => {});
        }
        void projectAssetService.listOpen()
          .then((a) => { setOpenAssets(a); dcPut(DASHBOARD_CACHE_KEYS.openAssets, a); })
          .catch(() => {});
        if (needsProjectAssetSummary) {
          void projectAssetService.activeSummary()
            .then((s) => { setProjectAssetSummary(s); dcPut(DASHBOARD_CACHE_KEYS.projectAssetSummary, s); })
            .catch(() => setProjectAssetSummary([]));
        }
      }
    } else {
      // Web cold-start: stagger heavy SQLite reads so attention/workload/open-assets
      // do not stampede the API on first paint (session cache still paints immediately).
      void loadAttention().catch(() => {});
      // Only roles that render WorkloadPanel pay for the workload query — it is the
      // heaviest dashboard endpoint (all active assets + all their runs, blobs included).
      const workloadTimer = needsTechnicianWorkload
        ? window.setTimeout(() => {
            setWorkloadLoading(true);
            projectAssetService.technicianWorkloadSummary()
              .then((w) => { setWorkload(w); })
              .catch(() => {})
              .finally(() => setWorkloadLoading(false));
          }, 400)
        : undefined;
      const summaryTimer = window.setTimeout(() => {
        projectAssetService.listOpen().then(setOpenAssets).catch(() => {});
        // active-summary is a GROUP BY over every ProjectAsset row and only feeds the
        // manager project-completion cards.
        if (needsProjectAssetSummary) {
          projectAssetService.activeSummary().then(setProjectAssetSummary).catch(() => setProjectAssetSummary([]));
        }
      }, 800);
      return () => {
        if (workloadTimer !== undefined) window.clearTimeout(workloadTimer);
        window.clearTimeout(summaryTimer);
      };
    }
  }, [
    products.length,
    productsCatalogLoading,
    projects.length,
    projectsCatalogLoading,
    users.length,
    usersCatalogLoading,
    dashboardBootPhase,
    dispatch,
    isAuthenticated,
    isEngineer,
    isNativePlatform,
    loadAttention,
    needsProjectAssetSummary,
    needsTechnicianWorkload,
    pmDashboardTab,
    seedNativeDashboardSummariesFromLocal,
  ]);

  // useAuth resolves role one tick after mount (Viewer placeholder). If dashboard
  // boot reached "full" while isManager was still false, the first loadAttention
  // call scoped to user.id (installer filter) and a late response could stick at 0
  // for PM/Admin. Re-fetch once manager scope becomes true.
  const prevManagerAttentionScopeRef = useRef(isManager);
  useEffect(() => {
    if (dashboardBootPhase !== "full") {
      prevManagerAttentionScopeRef.current = isManager;
      return;
    }
    if (!prevManagerAttentionScopeRef.current && isManager) {
      void loadAttention();
    }
    prevManagerAttentionScopeRef.current = isManager;
  }, [dashboardBootPhase, isManager, loadAttention]);

  // ── Native cache: persist state to cache whenever it changes ──
  useEffect(() => {
    if (!isNativePlatform) return;
    dcPut(DASHBOARD_CACHE_KEYS.openIssues, openIssues);
    dcPut(DASHBOARD_CACHE_KEYS.pendingSigs, pendingSigs);
  }, [isNativePlatform, openIssues, pendingSigs]);

  // When the background project refresh completes, apply the authoritative list directly to
  // Redux state — avoids a second API round-trip while still evicting any ghost projects.
  useEffect(() => {
    const handleUpdated = (e: Event) => {
      const detail = (e as CustomEvent<ProjectRepositoryUpdateDetail>).detail;
      if (!detail || detail.requestKey !== DASHBOARD_PROJECT_REQUEST_KEY) return;
      const { items } = detail;
      dispatch(setProjects({ items, total: items.length }));
    };
    window.addEventListener("repo:projects:updated", handleUpdated);
    return () => window.removeEventListener("repo:projects:updated", handleUpdated);
  }, [dispatch]);
  useEffect(() => {
    // Wait until auth has resolved so the dashboard does not write an empty
    // installer workspace during the cold-start Viewer bootstrap window.
    if (!isAuthenticated) return;

    if (isViewer) {
      setDashboardWorkspace({
        currentInstalls: [],
        currentInspections: [],
        installHistory: [],
        inspectionHistory: [],
      });
      unlockDeferredDashboardBoot();
      return;
    }

    let cancelled = false;
    setWorkspaceLoading(true);
    seedNativeDashboardWorkspaceFromLocal();

    const fetchWorkspaceWithRetry = async (
      options?: { light?: boolean; attempts?: number },
    ): Promise<DashboardWorkspace> => {
      // FIX 3a (offline): when the device is genuinely offline there is nothing
      // to retry - the request can only time out. Fail immediately so the caller
      // falls straight through to cached/local data instead of burning the API
      // timeout (and, on web, three of them) before showing anything.
      if (shouldSkipBlockingFetch()) throw new Error("dashboard-workspace-offline");

      const maxAttempts = options?.attempts ?? 3;
      let lastErr: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          return await projectAssetService.dashboardWorkspace(effectiveDashboardWorkspaceUserId, options);
        } catch (err) {
          lastErr = err;
          if (cancelled) throw err;
          // FIX 3b: don't sleep after the FINAL attempt. The old loop always
          // slept, so a fully failed boot wasted an extra 1800ms doing nothing.
          if (attempt === maxAttempts - 1) break;
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
      }
      throw lastErr;
    };

    const restoreCachedWorkspace = () => {
      const cached = readCachedDashboardWorkspace();
      if (!cached || !dashboardWorkspaceHasRows(cached)) return;
      if (dashboardWorkspaceHasRows(dashboardWorkspaceRef.current)) return;
      applyDashboardWorkspace(cached, { persist: false, stabilize: true });
      setCacheHydrated(true);
    };

    (async () => {
      // Paint the cached workspace BEFORE awaiting the network. This call had
      // drifted into the catch block (1cbaf56), making the cache a failure-only
      // fallback: on a slow-but-successful fetch nothing rendered until the
      // request returned. Restoring it here brings back stale-while-revalidate.
      // No-ops when there is no cache or rows are already present, so it can
      // never clobber fresher data; offline is unchanged.
      restoreCachedWorkspace();

      try {
        // FIX 3c: first paint gets ONE fast attempt. If it fails we fall back to
        // cache immediately (below) rather than making the user wait out the full
        // retry budget; the follow-up fetch further down still retries properly
        // and reconciles in the background.
        const initialData = await fetchWorkspaceWithRetry({ light: true, attempts: 1 });
        if (cancelled) return;
        applyDashboardWorkspace(initialData, { stabilize: true });
      } catch {
        if (cancelled) return;
        restoreCachedWorkspace();
      } finally {
        if (!cancelled) {
          setWorkspaceLoading(false);
          unlockDeferredDashboardBoot();
        }
      }

      if (cancelled) return;
      if (isNativePlatform) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        if (cancelled) return;
      }

      try {
        const fullData = await fetchWorkspaceWithRetry();
        if (cancelled) return;
        applyDashboardWorkspace(fullData);
      } catch {
        // Keep the lighter or cached workspace on screen if the full refresh fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyDashboardWorkspace,
    dashboardWorkspaceHasRows,
    effectiveDashboardWorkspaceUserId,
    isAuthenticated,
    isNativePlatform,
    isViewer,
    readCachedDashboardWorkspace,
    seedNativeDashboardWorkspaceFromLocal,
    unlockDeferredDashboardBoot,
  ]);

  const refreshLiveDashboardDataNow = useCallback((): Promise<void> => {
    if (dashboardRefreshInFlightRef.current) {
      dashboardRefreshQueuedRef.current = true;
      return dashboardRefreshInFlightRef.current;
    }

    const promise = (async () => {
      if (isNativePlatform) {
        seedNativeDashboardSummariesFromLocal();
        // Skip local workspace seed while a network refresh is in flight — it races
        // with the server response and caused MY INSTALLS to flicker 2 ↔ 3.
      }
      setWorkspaceLoading(true);
      try {
        await Promise.all([
          projectAssetService.listOpen().then(setOpenAssets),
          projectAssetService.activeSummary().then(setProjectAssetSummary).catch(() => setProjectAssetSummary([])),
          projectAssetService
            .dashboardWorkspace(effectiveDashboardWorkspaceUserId)
            .then((data) => { applyDashboardWorkspace(data); })
            .catch(() => { /* keep last-good workspace on a failed manual refresh - never blank it */ }),
          loadAttention(),
        ]);
        setAnalyticsRefreshTick((t) => t + 1);
      } finally {
        setWorkspaceLoading(false);
      }
    })();

    dashboardRefreshInFlightRef.current = promise.finally(() => {
      dashboardRefreshInFlightRef.current = null;
      if (dashboardRefreshQueuedRef.current) {
        dashboardRefreshQueuedRef.current = false;
        void refreshLiveDashboardDataNow();
      }
    });

    return dashboardRefreshInFlightRef.current;
  }, [
    applyDashboardWorkspace,
    effectiveDashboardWorkspaceUserId,
    isNativePlatform,
    loadAttention,
    seedNativeDashboardSummariesFromLocal,
  ]);

  const refreshLiveDashboardData = useCallback(() => {
    if (!isNativePlatform) {
      refreshLiveDashboardDataNow();
      return;
    }
    if (nativeDashboardRefreshTimerRef.current !== null) {
      window.clearTimeout(nativeDashboardRefreshTimerRef.current);
    }
    nativeDashboardRefreshTimerRef.current = window.setTimeout(() => {
      nativeDashboardRefreshTimerRef.current = null;
      refreshLiveDashboardDataNow();
    }, 650);
  }, [isNativePlatform, refreshLiveDashboardDataNow]);

  useEffect(() => () => {
    if (nativeDashboardRefreshTimerRef.current !== null) {
      window.clearTimeout(nativeDashboardRefreshTimerRef.current);
    }
  }, []);

  // PM: listen for new auto-assign flags written by AssetInstallationPage
  useEffect(() => {
    if (!isManager) return;
    const reload = () => setAutoAssignFlags(JSON.parse(localStorage.getItem("pm_auto_assign_flags") ?? "[]"));
    window.addEventListener("pm-auto-assign-flags-changed", reload);
    return () => window.removeEventListener("pm-auto-assign-flags-changed", reload);
  }, [isManager]);

  // Listen for missing-media flags (all users see their own; PM sees all)
  useEffect(() => {
    const reload = () => {
      const raw: MissingMediaFlag[] = JSON.parse(localStorage.getItem("pm_missing_media_flags") ?? "[]");
      setMissingMediaFlags(raw.map((f) => ({ ...f, missingSteps: f.missingSteps ?? [], totalExpected: f.totalExpected ?? 0, totalCaptured: f.totalCaptured ?? 0 })));
    };
    window.addEventListener("missing-media-flags-changed", reload);
    return () => window.removeEventListener("missing-media-flags-changed", reload);
  }, []);

  // Listen for photo update notifications after installers upload missing media.
  useEffect(() => {
    const reload = () => setPhotoUpdateNotifications(JSON.parse(localStorage.getItem("pm_photo_update_notifications") ?? "[]"));
    window.addEventListener("photo-update-notifications-changed", reload);
    return () => window.removeEventListener("photo-update-notifications-changed", reload);
  }, []);

  // Listen for photo reminders sent by PMs to installers.
  useEffect(() => {
    const reload = () => setPhotoReminders(JSON.parse(localStorage.getItem("installer_photo_reminders") ?? "[]"));
    window.addEventListener("installer-photo-reminders-changed", reload);
    return () => window.removeEventListener("installer-photo-reminders-changed", reload);
  }, []);

  // Notification-driven refresh: assignment events -> workload + workspace + open assets
  useEffect(() => {
    if (dashboardBootPhase !== "full") return;
    const refresh = () => {
      if (needsTechnicianWorkload) {
        setWorkloadLoading(true);
        projectAssetService.technicianWorkloadSummary().then(setWorkload).finally(() => setWorkloadLoading(false));
      }
      refreshLiveDashboardData();
    };
    window.addEventListener("notifications:assignments-changed", refresh);
    return () => window.removeEventListener("notifications:assignments-changed", refresh);
  }, [dashboardBootPhase, needsTechnicianWorkload, refreshLiveDashboardData]);

  // Notification-driven refresh: run state events -> workspace + open assets + attention items + analytics
  useEffect(() => {
    if (dashboardBootPhase !== "full") return;
    window.addEventListener("notifications:run-state-changed", refreshLiveDashboardData);
    window.addEventListener("notifications:refresh", refreshLiveDashboardData);
    // Also listen for asset-level changes dispatched by AssetRepository (and
    // forwarded by offline issue mutations) so the workspace + attention
    // counts refresh live when assets change offline - not only when the
    // notifications:* events happen to be fired alongside.
    window.addEventListener("repo:assets:updated", refreshLiveDashboardData);
    window.addEventListener("repo:issues:updated", refreshAttentionFromIssueCache);
    // Assignment and run caches refresh in the background on native and emit
    // these when they land. Without listening, the dashboard kept rendering the
    // pre-refresh snapshot while other screens (the Assets page listens to
    // repo:assignments:updated) recovered correctly — so the dashboard alone
    // stayed wrong until a manual reload.
    window.addEventListener("repo:assignments:updated", refreshLiveDashboardData);
    window.addEventListener("repo:runs:updated", refreshLiveDashboardData);
    const onFlushComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ syncedAny?: boolean; pendingRemaining?: number }>).detail;
      if (detail?.syncedAny && detail.pendingRemaining === 0) {
        refreshLiveDashboardData();
      }
    };
    window.addEventListener("sync-engine:flush-complete", onFlushComplete);
    return () => {
      window.removeEventListener("notifications:run-state-changed", refreshLiveDashboardData);
      window.removeEventListener("notifications:refresh", refreshLiveDashboardData);
      window.removeEventListener("repo:assets:updated", refreshLiveDashboardData);
      window.removeEventListener("repo:issues:updated", refreshAttentionFromIssueCache);
      window.removeEventListener("repo:assignments:updated", refreshLiveDashboardData);
      window.removeEventListener("repo:runs:updated", refreshLiveDashboardData);
      window.removeEventListener("sync-engine:flush-complete", onFlushComplete);
    };
  }, [dashboardBootPhase, refreshAttentionFromIssueCache, refreshLiveDashboardData]);

  useEffect(() => {
    if (dashboardBootPhase !== "full") return;
    try {
      const shouldReplayAssignmentRefresh = window.sessionStorage.getItem(DASHBOARD_ASSIGNMENT_RECOVERY_KEY) === "1";
      const shouldReplayRunStateRefresh = window.sessionStorage.getItem(DASHBOARD_RUN_STATE_RECOVERY_KEY) === "1";
      if (!shouldReplayAssignmentRefresh && !shouldReplayRunStateRefresh) return;
      window.sessionStorage.removeItem(DASHBOARD_ASSIGNMENT_RECOVERY_KEY);
      window.sessionStorage.removeItem(DASHBOARD_RUN_STATE_RECOVERY_KEY);
      if (shouldReplayAssignmentRefresh) {
        window.dispatchEvent(new Event("notifications:assignments-changed"));
      }
      if (shouldReplayRunStateRefresh) {
        window.dispatchEvent(new Event("notifications:run-state-changed"));
      }
    } catch {
      // Ignore storage/privacy-mode failures.
    }
  }, [dashboardBootPhase]);

  useEffect(() => {
    if (dashboardBootPhase !== "full") return;
    const handleServerAssetUpdate = () => {
      refreshLiveDashboardData();
    };
    window.addEventListener("sse:assets:updated", handleServerAssetUpdate);
    return () => window.removeEventListener("sse:assets:updated", handleServerAssetUpdate);
  }, [dashboardBootPhase, refreshLiveDashboardData]);

  // Phase 4 - evidence completeness (deferred on web until analyticsLoadEnabled)
  useEffect(() => {
    if (!isManager || dashboardBootPhase !== "full" || !analyticsLoadEnabled) return;
    // analyticsRefreshTick is bumped by run-state, asset and SSE events, which refetched
    // both 90-day aggregations even while the user sat on a tab that never renders the
    // grid. Spend the query only when the panel is actually on screen.
    if (!analyticsSectionMounted) return;
    let cancelled = false;
    setEvidenceLoading(true);
    setEvidenceError(false);
    void (async () => {
      try {
        const data = await dashboardService.evidenceCompleteness(evidenceWindow);
        if (cancelled) return;
        setEvidenceData(data);
        setEvidenceError(false);
      } catch {
        if (cancelled) return;
        setEvidenceData(null);
        setEvidenceError(true);
      } finally {
        if (!cancelled) setEvidenceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analyticsLoadEnabled, analyticsRefreshTick, analyticsSectionMounted, dashboardBootPhase, evidenceWindow, isManager]);

  // Phase 5 - workflow health (deferred on web until analyticsLoadEnabled)
  useEffect(() => {
    if (!isManager || dashboardBootPhase !== "full" || !analyticsLoadEnabled) return;
    if (!analyticsSectionMounted) return;
    let cancelled = false;
    setHealthLoading(true);
    setHealthError(false);
    void (async () => {
      try {
        const data = await dashboardService.workflowHealth(healthWindow);
        if (cancelled) return;
        setHealthData(data);
        setHealthError(false);
      } catch {
        if (cancelled) return;
        setHealthData(null);
        setHealthError(true);
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analyticsLoadEnabled, analyticsRefreshTick, analyticsSectionMounted, dashboardBootPhase, healthWindow, isManager]);
  // Derived data
  const filteredProjects = useMemo(() => {
    if (activeOffice === "All" || !officeIdsForRegion) return projects;
    return projects.filter((p) => {
      if (p.officeId) return officeIdsForRegion.has(p.officeId);
      const c = countryForOffice(p.office);
      return c === activeOffice || p.office === activeOffice;
    });
  }, [activeOffice, projects, officeIdsForRegion, countryForOffice]);

  const activeDashboardProjects = useMemo(
    () => filteredProjects.filter((project) => !project.isDeleted && isDashboardVisibleProjectStatus(project.status)),
    [filteredProjects]
  );

  const projectAssetsPath = useCallback((project: { id: string; productIds?: string[] | null }) => {
    const params = new URLSearchParams({ project: project.id });
    if ((project.productIds ?? []).length === 1 && project.productIds?.[0]) {
      params.set("product", project.productIds[0]);
    }
    return `/installations/assets?${params.toString()}`;
  }, []);
  // Admin: dashboard scope derived from user picker
  const viewedDashboardUserId = selectedDashboardId === ALL_DASHBOARDS_VALUE ? null : selectedDashboardId;
  const viewingOwnDashboard = !viewedDashboardUserId || viewedDashboardUserId === user.id;
  const showAdminOverviewStrip = isAdmin && !viewedDashboardUserId;
  const viewedDashboardUser = useMemo(
    () => dashboardUsers.find((u) => u.id === viewedDashboardUserId) ?? null,
    [dashboardUsers, viewedDashboardUserId],
  );

  // Phase 1 - personal workspace
  const myAssets   = useMemo(
    () => [...dashboardWorkspace.currentInstalls, ...dashboardWorkspace.currentInspections],
    [dashboardWorkspace],
  );
  const myBlocking = useMemo(() => openIssues.filter((i) => i.isBlocking && myAssets.some((a) => a.id === i.assetId)), [openIssues, myAssets]);
  const myPaused   = useMemo(() => myAssets.filter((a) => isPausedAsset(a.runStatus)), [myAssets]);
  const myActive   = useMemo(() => myAssets.filter((a) => !isPausedAsset(a.runStatus) && (isInProgressAsset(a.runStatus) || isInProgressAsset(a.status))), [myAssets]);
  const myQueued   = useMemo(() => myAssets.filter((a) => !isPausedAsset(a.runStatus) && !isInProgressAsset(a.runStatus) && !isInProgressAsset(a.status) && isNotStartedAsset(a.status)), [myAssets]);
  const myPending  = useMemo(() => myAssets.filter((a) => !isPausedAsset(a.runStatus) && !isInProgressAsset(a.runStatus) && !isInProgressAsset(a.status) && isPendingAsset(a.status)), [myAssets]);

  const scopedProjectIdsForUser = useMemo(() => {
    if (!viewedDashboardUserId) return new Set(activeDashboardProjects.map((project) => project.id));

    const viewedName = (viewedDashboardUser?.fullName ?? user.fullName ?? "").trim().toLowerCase();
    const assignedAssetProjectIds = new Set(
      openAssets
        .filter((asset) => asset.assignedUserId === viewedDashboardUserId)
        .map((asset) => asset.projectId)
    );

    return new Set(
      activeDashboardProjects
        .filter((project) => {
          const managerMatch = viewedName
            ? String(project.projectManager ?? "").trim().toLowerCase() === viewedName
            : false;
          const teamMatch = (project.teamMemberIds ?? []).includes(viewedDashboardUserId);
          const assetMatch = assignedAssetProjectIds.has(project.id);
          return managerMatch || teamMatch || assetMatch;
        })
        .map((project) => project.id)
    );
  }, [activeDashboardProjects, openAssets, viewedDashboardUser?.fullName, viewedDashboardUserId, user.fullName]);

  const scopedProjects = useMemo(() => {
    if (!viewedDashboardUserId) return activeDashboardProjects;
    return activeDashboardProjects.filter((project) => scopedProjectIdsForUser.has(project.id));
  }, [activeDashboardProjects, scopedProjectIdsForUser, viewedDashboardUserId]);

  const dashboardProjectOwnerName = useMemo(
    () => (viewedDashboardUser?.fullName ?? user.fullName ?? "").trim().toLowerCase(),
    [viewedDashboardUser?.fullName, user.fullName]
  );

  const dashboardProjects = useMemo(() => {
    const baseProjects = viewedDashboardUserId ? scopedProjects : activeDashboardProjects;
    // Show all projects when: scope is "all", role can view all, or not a manager role
    if (!isManager || (!canViewAllProjects) || dashboardProjectScope === "all") return baseProjects;
    return baseProjects.filter((project) =>
      String(project.projectManager ?? "").trim().toLowerCase() === dashboardProjectOwnerName
    );
  }, [activeDashboardProjects, canViewAllProjects, dashboardProjectOwnerName, dashboardProjectScope, isManager, scopedProjects, viewedDashboardUserId]);

  const visibleProjectIds = useMemo(
    () => new Set(dashboardProjects.map((project) => project.id)),
    [dashboardProjects],
  );
  const visibleOpenAssets = useMemo(
    () => openAssets.filter((asset) => visibleProjectIds.has(asset.projectId)),
    [openAssets, visibleProjectIds],
  );

  // Technician workload should come from the dedicated summary source of truth.
  // Project assets are only used here to enrich the expand/report breakdown.
  const scopedWorkload = useMemo(() => {
    const breakdownByUser = new Map<string, Map<string, WorkloadProjectBreakdown>>();
    for (const asset of openAssets) {
      if (!asset.assignedUserId) continue;
      if (!breakdownByUser.has(asset.assignedUserId)) {
        breakdownByUser.set(asset.assignedUserId, new Map());
      }
      const byProject = breakdownByUser.get(asset.assignedUserId)!;
      if (!byProject.has(asset.projectId)) {
        byProject.set(asset.projectId, {
          projectId: asset.projectId,
          jobNumber: asset.jobNumber ?? "",
          notStarted: 0,
          inProgress: 0,
          paused: 0,
          total: 0,
        });
      }
      const pb = byProject.get(asset.projectId)!;
      pb.total++;
      if (isPausedAsset(asset.runStatus)) {
        pb.paused++;
      } else if (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status) || isIssueAsset(asset.status)) {
        pb.inProgress++;
      } else {
        pb.notStarted++;
      }
    }

    return workload
      .filter((item) => !viewedDashboardUserId || item.userId === viewedDashboardUserId)
      .map((item) => ({
        ...item,
        projectBreakdown: [...(breakdownByUser.get(item.userId)?.values() ?? [])],
      }))
      .filter((w) => w.totalAssigned > 0)
      .sort((a, b) => b.totalAssigned - a.totalAssigned);
  }, [openAssets, viewedDashboardUserId, workload]);
  const unassignedAssets = useMemo(
    () => visibleOpenAssets.filter((asset) => !asset.assignedUserId && asset.status !== "Complete" && asset.status !== "Completed"),
    [visibleOpenAssets]
  );
  const notStartedAssets = useMemo(
    () => visibleOpenAssets.filter((asset) => isNotStartedAsset(asset.status)),
    [visibleOpenAssets]
  );
  const visibleOpenIssues = useMemo(
    () => openIssues.filter((issue) => visibleProjectIds.has(issue.projectId)),
    [openIssues, visibleProjectIds],
  );
  const visiblePendingSigs = useMemo(
    () => pendingSigs.filter((sig) => visibleProjectIds.has(sig.projectId)),
    [pendingSigs, visibleProjectIds],
  );
  const projectCount = dashboardProjects.length;
  const blockingIssues = visibleOpenIssues.filter((i) => i.isBlocking);
  const highIssues = visibleOpenIssues.filter((i) => !i.isBlocking && i.severity === "high");
  const overdueProjects = dashboardProjects.filter((p) => {
    if (!p.finishDate) return false;
    if (String(p.status ?? "") === "Completed") return false;
    return new Date(p.finishDate) < new Date();
  });
  const attentionCount = blockingIssues.length + visiblePendingSigs.length + overdueProjects.length + highIssues.length;
  const pendingApprovals = useMemo(
    () => dashboardProjects.filter((project) => project.status === "Pending Approval"),
    [dashboardProjects]
  );

  const managedProjects = useMemo(() => {
    if (viewedDashboardUserId) {
      return scopedProjects.filter((project) =>
        String(project.projectManager ?? "").trim().toLowerCase() === dashboardProjectOwnerName
      );
    }
    // An Admin (anyone with all-projects visibility) is not normally named as
    // the Project Manager on anything, so filtering by their own name returned
    // an empty set - which is why the native manager home showed no projects at
    // all for Admins. Give them the full active list; PMs still see only what
    // they manage.
    if (canViewAllProjects) return activeDashboardProjects;
    return activeDashboardProjects.filter((project) =>
      String(project.projectManager ?? "").trim().toLowerCase() === String(user.fullName ?? "").trim().toLowerCase()
    );
  }, [activeDashboardProjects, canViewAllProjects, dashboardProjectOwnerName, scopedProjects, user.fullName, viewedDashboardUserId]);
  const managedProjectIds = useMemo(() => new Set(managedProjects.map((project) => project.id)), [managedProjects]);
  const managedOpenAssets = useMemo(
    () => openAssets.filter((asset) => managedProjectIds.has(asset.projectId)),
    [openAssets, managedProjectIds]
  );
  const managedOverdueProjects = useMemo(
    () => managedProjects.filter((project) => {
      if (!project.finishDate) return false;
      return new Date(project.finishDate) < new Date();
    }),
    [managedProjects],
  );
  const managedInspectionProjects = useMemo(
    () => managedProjects.filter((project) => project.workflowMode === "INSPECTION_ONLY" || project.workflowMode === "MIXED"),
    [managedProjects],
  );

  const projectSummaryById = useMemo(
    () => new Map(projectAssetSummary.map((summary) => [summary.projectId, summary])),
    [projectAssetSummary]
  );

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );

  const productNameById = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products]
  );

  const getProjectCompletionMetrics = useCallback((project: { id: string; assetCount?: number | null }) => {
    const summary = projectSummaryById.get(project.id);
    const projectAssets = openAssets.filter((asset) => asset.projectId === project.id);
    const issueCount = projectAssets.filter((asset) => String(asset.status ?? "").toLowerCase() === "issue").length;
    const noWorkflowCount = projectAssets.filter((asset) => !asset.hasWorkflow && String(asset.status ?? "").toLowerCase() !== "complete").length;
    const totalAssets = summary?.total ?? project.assetCount ?? projectAssets.length;
    const notStarted = summary?.notStarted ?? projectAssets.filter((asset) => isNotStartedAsset(asset.status)).length;
    const inProgress = summary?.inProgress ?? projectAssets.filter((asset) => isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)).length;
    const complete = summary?.complete ?? Math.max(0, totalAssets - notStarted - inProgress - issueCount);
    const completionPct = totalAssets > 0 ? Math.round((complete / totalAssets) * 100) : 0;
    return { projectAssets, issueCount, noWorkflowCount, totalAssets, notStarted, inProgress, complete, completionPct };
  }, [openAssets, projectSummaryById]);

  const isReadyToCloseProject = useCallback((project: { status?: string | null; completedAtUtc?: string | null }, completionPct: number) => {
    return String(project.status ?? "") === "Completed" && completionPct >= 100;
  }, []);

  const closeProjectFromDashboard = useCallback(async (projectId: string) => {
    setClosingDashboardProjectId(projectId);
    try {
      await dispatch(updateProjectStatus({ id: projectId, payload: { status: "Closed" } })).unwrap();
      await dispatch(fetchProjects({
        country: activeOffice !== "All" ? activeOffice : undefined,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to close this project right now.";
      window.alert(message);
    } finally {
      setClosingDashboardProjectId(null);
    }
  }, [activeOffice, dispatch]);

  const projectPmLabel = useCallback(
    (projectId?: string | null) => {
      const project = projectId ? projectById.get(projectId) : undefined;
      return project?.projectManager?.trim() || "No PM assigned";
    },
    [projectById]
  );
  const projectAttentionLabel = useCallback(
    (projectId?: string | null, fallbackJobNumber?: string | null, fallbackCustomer?: string | null) => {
      const project = projectId ? projectById.get(projectId) : undefined;
      const jobNumber = project?.jobNumber || fallbackJobNumber || "No job number";
      const customer = project?.customerName || fallbackCustomer || "No customer";
      const pmName = project?.projectManager?.trim() || "No PM assigned";
      return `${jobNumber} - ${customer} - ${pmName}`;
    },
    [projectById]
  );

  const buildAssetRepairPath = useCallback((params: {
    projectId: string;
    assetId: string;
    action: "issue" | "signature" | "photos" | "history";
    runId?: string;
    issueId?: string;
    issueSource?: "run" | "asset";
  }) => {
    const query = new URLSearchParams({
      project: params.projectId,
      asset: params.assetId,
      action: params.action,
    });
    if (params.runId) query.set("run", params.runId);
    if (params.issueId) query.set("issue", params.issueId);
    if (params.issueSource) query.set("issueSource", params.issueSource);
    return `/installations/assets?${query.toString()}`;
  }, []);

  const refreshDashboardAfterIssueUpdate = useCallback(async () => {
    await refreshLiveDashboardDataNow();
    return dashboardWorkspaceRef.current;
  }, [refreshLiveDashboardDataNow]);

  const openHistoryReport = useCallback(async (assetItem: DashboardWorkspaceAssetItem) => {
    setHistoryDialogLoading(assetItem.id);
    try {
      const [asset, runs] = await Promise.all([
        projectAssetService.getById(assetItem.id),
        assetWorkflowRunService.listByAsset(assetItem.id),
      ]);
      if (!asset || runs.length === 0) {
        navigate("/installations/assets");
        return;
      }

      const sortedRuns = runs
        .slice()
        .sort((a, b) => {
          const bTime = new Date(b.completedAt ?? b.updatedAt ?? b.startedAt).getTime();
          const aTime = new Date(a.completedAt ?? a.updatedAt ?? a.startedAt).getTime();
          return bTime - aTime;
        });
      const latestRun = sortedRuns[0];
      let configName = `Run #${latestRun.runNumber ?? 1}`;
      try {
        const cfg = await workflowConfigService.getById(latestRun.workflowConfigId);
        if (cfg) {
          configName = cfg.displayName || cfg.name || configName;
        }
      } catch {
        // Fall back to run label if config lookup fails.
      }
      const [brandSettings, signatureEvents, productFeatures] = await Promise.all([
        brandSettingsService.get(),
        latestRun.isLocked ? import("../../services/signatureService").then(({ signatureService }) => signatureService.listEvents(latestRun.id)) : Promise.resolve([]),
        asset.productId
          ? featureService.getByProduct(asset.productId).catch(() => [] as LibFeature[])
          : Promise.resolve([] as LibFeature[]),
      ]);
      const bizLogoResolved = brandSettings.logoBase64
        ? await resolveImageToDataUrl(brandSettings.logoBase64)
        : null;
      const reportRun = isMobileNativePlatform()
        ? await mediaStore.resolveUploadPayload(latestRun)
        : latestRun;
      await generateWorkflowReport({
        run: reportRun,
        asset,
        workflowConfigName: configName,
        businessLogoBase64: bizLogoResolved,
        customerName: projects.find((project) => project.id === asset.projectId)?.customerName,
        jobNumber: projects.find((project) => project.id === asset.projectId)?.jobNumber,
        siteName: projects.find((project) => project.id === asset.projectId)?.siteName,
        siteLocation: asset.location ?? undefined,
        assignedTechnician: user.fullName ?? undefined,
        timeZoneId: resolveReportTimeZone(projects.find((project) => project.id === asset.projectId)),
        signatureEvents,
        productFeatures,
        outputMode: "open",
      });
    } finally {
      setHistoryDialogLoading((current) => (current === assetItem.id ? null : current));
    }
  }, [navigate, projects, user.fullName]);

  const openIssueRepair = useCallback(async (issue: OpenIssueRecord) => {
    setQuickActionOpen(false);

    if (issue.source === "asset") {
      const asset = await projectAssetService.getById(issue.assetId);
      if (asset) {
        let issues: AssetIssue[] = [];
        try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
        const matchedIssue = issues.find((item) => item.id === issue.issueId);
        if (matchedIssue) {
          setIssueDetailTarget({
            issue: matchedIssue,
            assetId: asset.id,
            source: "asset",
          });
          return;
        }
      }
    }

    if (issue.source === "run") {
      const run = await assetWorkflowRunService.getById(issue.runId);
      if (run) {
        let issues: RunIssue[] = [];
        try { issues = JSON.parse(run.issuesJson || "[]"); } catch {}
        const matchedIssue = issues.find((item) => item.id === issue.issueId);
        if (matchedIssue) {
          setIssueDetailTarget({
            issue: matchedIssue,
            assetId: issue.assetId,
            runId: run.id,
            source: "run",
          });
          return;
        }
      }
    }

    navigate(buildAssetRepairPath({
      projectId: issue.projectId,
      assetId: issue.assetId,
      action: "issue",
      runId: issue.runId,
      issueId: issue.issueId,
      issueSource: issue.source,
    }));
  }, [buildAssetRepairPath, navigate]);

  const handleDashboardIssueSave = useCallback(async (updatedIssue: AssetIssue | RunIssue) => {
    if (!issueDetailTarget) return;
    const shouldCloseDialog = Boolean(updatedIssue.resolved);
    if (shouldCloseDialog) {
      setResolvingDashboardIssueId(updatedIssue.id);
      setOpenIssues((prev) => prev.filter((issue) => issue.issueId !== updatedIssue.id));
    }

    try {
      if (issueDetailTarget.source === "asset") {
        const asset = await projectAssetService.getById(issueDetailTarget.assetId);
        if (!asset) return;
        let issues: AssetIssue[] = [];
        try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
        issues = issues.map((item) => item.id === updatedIssue.id ? updatedIssue as AssetIssue : item);
        const refreshedAsset = await projectAssetService.patchIssues(asset.id, JSON.stringify(issues));
        let refreshedIssues: AssetIssue[] = [];
        try { refreshedIssues = JSON.parse(refreshedAsset.issuesJson || "[]"); } catch {}
        const refreshedIssue = refreshedIssues.find((item) => item.id === updatedIssue.id);
        if (refreshedIssue && !shouldCloseDialog) {
          setIssueDetailTarget({
            issue: refreshedIssue,
            assetId: refreshedAsset.id,
            source: "asset",
          });
        }
      } else if (issueDetailTarget.runId) {
        const run = await assetWorkflowRunService.getById(issueDetailTarget.runId);
        if (!run) return;
        let issues: RunIssue[] = [];
        try { issues = JSON.parse(run.issuesJson || "[]"); } catch {}
        issues = issues.map((item) => item.id === updatedIssue.id ? updatedIssue as RunIssue : item);
        const refreshedRun = await assetWorkflowRunService.patchIssues(issueDetailTarget.runId, JSON.stringify(issues));
        let refreshedIssues: RunIssue[] = [];
        try { refreshedIssues = JSON.parse(refreshedRun.issuesJson || "[]"); } catch {}
        const refreshedIssue = refreshedIssues.find((item) => item.id === updatedIssue.id);
        if (refreshedIssue && !shouldCloseDialog) {
          setIssueDetailTarget({
            issue: refreshedIssue,
            assetId: issueDetailTarget.assetId,
            runId: refreshedRun.id,
            source: "run",
          });
        }
      }

      await refreshDashboardAfterIssueUpdate();
      if (shouldCloseDialog) {
        setIssueDetailTarget(null);
      }
    } finally {
      if (shouldCloseDialog) {
        setResolvingDashboardIssueId(null);
      }
    }
  }, [issueDetailTarget, refreshDashboardAfterIssueUpdate]);

  const openSignatureRepair = useCallback((sig: PendingSignatureRecord) => {
    navigate(buildAssetRepairPath({
      projectId: sig.projectId,
      assetId: sig.assetId,
      action: "signature",
      runId: sig.runId,
    }));
  }, [buildAssetRepairPath, navigate]);

  const openMissingMediaRepair = useCallback((flag: MissingMediaFlag) => {
    const projectId = openAssets.find((asset) => asset.id === flag.assetId)?.projectId;
    if (!projectId) {
      setPhotoUploadMode("pm");
      setPhotoUploadTarget(flag);
      return;
    }
    navigate(buildAssetRepairPath({
      projectId,
      assetId: flag.assetId,
      action: "photos",
      runId: flag.runId,
    }));
  }, [buildAssetRepairPath, navigate, openAssets]);

  // Tab bar is shown for all non-viewers.
  // Admins and PMs see all 3 tabs; others see My Inspections and/or My Installs
  // depending on which asset types they have assigned.
  const showTabBar       = !isViewer && !showNativeManagerHome;
  const showPmProjectsTab = isManager;

  const myInspectionAssets = useMemo(
    () => dashboardWorkspace.currentInspections,
    [dashboardWorkspace]
  );
  const myInspectionHistory = useMemo(
    () => dashboardWorkspace.inspectionHistory,
    [dashboardWorkspace]
  );

  // Install assets = assigned assets that are NOT in an inspection project
  const myInstallAssets = useMemo(
    () => dashboardWorkspace.currentInstalls,
    [dashboardWorkspace]
  );
  const myInstallHistory = useMemo(
    () => dashboardWorkspace.installHistory,
    [dashboardWorkspace]
  );
  const [nativeMyJobsCardContext, setNativeMyJobsCardContext] = useState<Record<string, NativeMyJobsCardContext>>({});
  const [dashboardAssignmentsMap, setDashboardAssignmentsMap] = useState<Record<string, WorkflowAssignment[]>>({});

  const myInstallAssetIdsKey = useMemo(() => myJobsAssetIdsKey(myInstallAssets), [myInstallAssets]);

  useEffect(() => {
    if (!isNativePlatform) {
      setNativeMyJobsCardContext({});
      return;
    }
    if (myInstallAssets.length === 0) {
      setNativeMyJobsCardContext({});
      return;
    }

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        myInstallAssets.map(async (asset) => {
          const [cachedAsset, runs] = await Promise.all([
            entityGetAsset(asset.id),
            assetWorkflowRunService.listLocalByAsset(asset.id),
          ]);
          const data = cachedAsset?.data as ProjectAsset | undefined;
          if (!data) return null;
          return [asset.id, { asset: data, runs }] as const;
        })
      );

      if (cancelled) return;
      setNativeMyJobsCardContext((prev) => {
        const fresh: Record<string, NativeMyJobsCardContext> = {};
        for (const entry of entries) {
          if (!entry) continue;
          fresh[entry[0]] = entry[1];
        }
        const merged: Record<string, NativeMyJobsCardContext> = {};
        for (const asset of myInstallAssets) {
          if (fresh[asset.id]) {
            merged[asset.id] = fresh[asset.id];
            continue;
          }
          if (prev[asset.id]) {
            merged[asset.id] = prev[asset.id];
          }
        }
        return merged;
      });
    })();

    return () => {
      cancelled = true;
    };
    // myInstallAssets is read for its current values only - myInstallAssetIdsKey (a
    // stable id-set string) is the intended re-run trigger. myInstallAssets itself is a
    // NEW array reference on every dashboardWorkspace fetch even when the id set is
    // unchanged; including it here caused this effect to refire in a tight loop (each
    // run's side effects fed back into another dashboardWorkspace update, which produced
    // another new reference, ad infinitum - the "constantly fetching" bug).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativePlatform, myInstallAssetIdsKey]);

  // Prime assignment cache for My Jobs cards so offline opens don't treat empty
  // IndexedDB as "no workflow assigned" when bootstrap hasn't filled this asset yet.
  useEffect(() => {
    if (!isNativePlatform || myInstallAssets.length === 0) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        myInstallAssets.map(async (asset) => {
          const local = await WorkflowAssignmentRepository.getLocalByAsset(asset.id).catch(() => []);
          return [asset.id, local] as const;
        }),
      );
      if (cancelled) return;
      setDashboardAssignmentsMap((prev) => {
        const next = { ...prev };
        for (const [assetId, local] of entries) {
          if (local.length > 0) next[assetId] = local;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
    // See the identical myInstallAssetIdsKey-vs-myInstallAssets note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativePlatform, myInstallAssetIdsKey]);

  // While online, refresh assignments for visible My Jobs assets in background.
  useEffect(() => {
    if (!isNativePlatform || myInstallAssets.length === 0 || shouldSkipBlockingFetch()) return;
    for (const asset of myInstallAssets) {
      void assetWorkflowAssignmentService.listByAsset(asset.id);
    }
    // This is the effect that was driving the request storm: listByAsset() dispatches
    // repo:assignments:updated on native, which triggers a dashboardWorkspace refresh,
    // which produced a new myInstallAssets reference, which (with myInstallAssets in
    // deps) re-ran this effect immediately - a self-sustaining ~1s loop. Depend only on
    // the id-set key, not the array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativePlatform, myInstallAssetIdsKey]);

  useEffect(() => {
    if (!isNativePlatform) return;
    const onAssignmentsUpdated = (event: Event) => {
      const assetId = (event as CustomEvent<{ assetId?: string }>).detail?.assetId;
      if (!assetId) return;
      void WorkflowAssignmentRepository.getLocalByAsset(assetId)
        .then((local) => {
          if (local.length === 0) return;
          setDashboardAssignmentsMap((prev) => ({ ...prev, [assetId]: local }));
        })
        .catch(() => {});
    };
    window.addEventListener("repo:assignments:updated", onAssignmentsUpdated);
    return () => window.removeEventListener("repo:assignments:updated", onAssignmentsUpdated);
  }, [isNativePlatform]);

  const renderHistoryCard = useCallback((asset: DashboardWorkspaceAssetItem) => (
    <Paper
      key={asset.id}
      elevation={0}
      onClick={() => { void openHistoryReport(asset); }}
      sx={{
        p: 1.25,
        border: "1px solid var(--stroke)",
        borderRadius: 1.5,
        cursor: "pointer",
        "&:hover": { borderColor: "success.main", background: "rgba(45,212,191,0.04)" },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" fontWeight={600} noWrap display="block">
            {asset.assetTag || asset.assetName || asset.id}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
            {asset.jobNumber}{" · "}{asset.completedAt ? `Completed ${fmtDate(asset.completedAt)}` : `Updated ${fmtDate(asset.latestActivityAt)}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center">
          {historyDialogLoading === asset.id && <CircularProgress size={12} />}
          <Chip label={asset.historyStatus} size="small" color={historyChipColor(asset.historyStatus)} variant="outlined"
            sx={{ height: 18, fontSize: "0.62rem" }} />
        </Stack>
      </Stack>
    </Paper>
  ), [historyDialogLoading, openHistoryReport]);

  // Quick action dialog for "My Jobs Today" assets
  type QuickActionAsset = typeof myInstallAssets[0];
  const [quickActionAsset, setQuickActionAsset] = useState<QuickActionAsset | null>(null);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [quickActionAssignments, setQuickActionAssignments] = useState<WorkflowAssignment[]>([]);
  const [quickActionRuns, setQuickActionRuns] = useState<AssetWorkflowRun[]>([]);
  const [quickActionLoading, setQuickActionLoading] = useState(false);
  const [autoAssignConfirm, setAutoAssignConfirm] = useState<{
    asset: QuickActionAsset;
    assignment?: WorkflowAssignment;
    reason: "unassigned" | "other";
    otherName?: string;
  } | null>(null);
  // WorkOrderRunner integration
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [runnerAsset, setRunnerAsset] = useState<QuickActionAsset | null>(null);
  const [runnerWorkflow, setRunnerWorkflow] = useState<Workflow | null>(null);
  const [runnerWorkflowConfigId, setRunnerWorkflowConfigId] = useState<string | undefined>();
  const [runnerExistingRunId, setRunnerExistingRunId] = useState<string | undefined>();
  const runnerProjectTimeZone = useProjectTimeZone(runnerAsset?.projectId);
  const runnerTeamMembers = useMemo(() => {
    const project = runnerAsset?.projectId ? projectById.get(runnerAsset.projectId) : undefined;
    if (!project?.teamMemberIds?.length) return [];
    return users
      .filter((item) => item.isActive && project.teamMemberIds?.includes(item.id))
      .map((item) => ({ id: item.id, fullName: item.fullName }));
  }, [projectById, runnerAsset?.projectId, users]);
  const [runnerLoading, setRunnerLoading] = useState<string | null>(null);
  // Surfaced when a take-over/self-assign fails to persist (see
  // confirmAutoAssignAndStartFromDashboard) — the run is deliberately NOT started in
  // that case, so the user must be told rather than left with a silently-missing job.
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  // Inspection import dialog
  const [importDialogAsset, setImportDialogAsset] = useState<{ id: string; assetTag?: string; assetName?: string; projectId: string } | null>(null);
  // Inspection import dialog open state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  // Documents dialog for quick action
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [docsDialogAsset, setDocsDialogAsset] = useState<QuickActionAsset | null>(null);
  const [docsCount, setDocsCount] = useState(0);
  const [docsLoading, setDocsLoading] = useState(false);

  // Assign workflow dialog (for assets without workflow assignment)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ workflowTypeId: "", workflowConfigId: "" });
  const [assignSaving, setAssignSaving] = useState(false);
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>([]);
  const [workflowConfigs, setWorkflowConfigs] = useState<WorkflowConfig[]>([]);
  // Product-based workflow for assets without explicit assignment
  const [productWorkflow, setProductWorkflow] = useState<{ configId: string; configName: string; workflowTypeId?: string } | null>(null);

  const buildFallbackMissingMediaFlag = useCallback((asset: QuickActionAsset, latestRun: AssetWorkflowRun | null) => {
    if (!latestRun || !runHasCompletedAllSteps(latestRun)) return null;
    const missingCount = countMissingWorkflowItems(latestRun);
    if (missingCount <= 0) return null;
    return {
      id: `run-missing-${latestRun.id}`,
      runId: latestRun.id,
      assetId: asset.id,
      assetTag: asset.assetTag || asset.assetName || asset.id,
      jobNumber: asset.jobNumber,
      workflowName: "Workflow",
      technicianUserId: asset.assignedUserId ?? "",
      technicianName: user.fullName ?? "",
      completedAt: latestRun.completedAt ?? latestRun.updatedAt ?? latestRun.startedAt,
      missingSteps: [],
      totalExpected: 0,
      totalCaptured: 0,
    };
  }, [user.fullName]);

  const resolveMissingMediaForAsset = useCallback((asset: QuickActionAsset, runs: AssetWorkflowRun[]) => {
    const sortedRuns = [...runs].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const latestRun = sortedRuns[0] ?? null;
    const latestRunFlag = latestRun
      ? missingMediaFlags.find((flag) => flag.runId === latestRun.id) ?? null
      : null;
    const fallbackMissingMedia = buildFallbackMissingMediaFlag(asset, latestRun);
    const assetLevelFlag = missingMediaFlags.find((flag) => flag.assetId === asset.id) ?? null;
    return latestRunFlag ?? fallbackMissingMedia ?? assetLevelFlag;
  }, [buildFallbackMissingMediaFlag, missingMediaFlags]);

  const quickActionAttention = useMemo(() => {
    if (!quickActionAsset) {
      return {
        blockingIssues: [] as OpenIssueRecord[],
        highObservations: [] as OpenIssueRecord[],
        pendingSignature: null as PendingSignatureRecord | null,
        missingMedia: null as MissingMediaFlag | null,
        activeRun: null as AssetWorkflowRun | null,
        latestRun: null as AssetWorkflowRun | null,
      };
    }

    const sortedRuns = [...quickActionRuns].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const latestRun = sortedRuns[0] ?? null;
    const assetIssues = openIssues.filter((issue) => issue.assetId === quickActionAsset.id);

    return {
      blockingIssues: assetIssues.filter((issue) => issue.isBlocking),
      highObservations: assetIssues.filter(
        (issue) =>
          !issue.isBlocking &&
          issue.issueType === "observation" &&
          issue.severity === "high"
      ),
      pendingSignature:
        pendingSigs.find(
          (sig) => sig.assetId === quickActionAsset.id
        ) ?? null,
      missingMedia: resolveMissingMediaForAsset(quickActionAsset, quickActionRuns),
      activeRun: sortedRuns.find((run) => !run.isLocked) ?? null,
      latestRun,
    };
  }, [openIssues, pendingSigs, quickActionAsset, quickActionRuns, resolveMissingMediaForAsset]);

  const getMyJobsCardAction = useCallback((asset: QuickActionAsset): MyJobsCardAction => {
    if (isNativePlatform) {
      const nativeContext = nativeMyJobsCardContext[asset.id];
      if (nativeContext) {
        const displayState = getWorkflowDisplayState(nativeContext.asset, nativeContext.runs, {
          paused: isPausedAsset(asset.runStatus),
          inspectionMode: asset.workflowMode === "INSPECTION_ONLY",
          hasRunnableWorkflowSource:
            nativeContext.runs.length > 0
            || !!nativeContext.asset.productConfigId
            || !!nativeContext.asset.workflowTemplateId
            || !!nativeContext.asset.workflowSummary?.hasWorkflow,
        });
        return myJobsCardActionFromDisplayState(displayState, true);
      }
    }

    const isActive = isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status);
    const isPaused = isPausedAsset(asset.runStatus);
    const pendingSignature = pendingSigs.find(
      (sig) => sig.assetId === asset.id && isPendingInstallerSignature(sig.signatureStatus),
    ) ?? null;
    const missingMediaFlag = missingMediaFlags.find((flag) => flag.assetId === asset.id) ?? null;
    const evidenceMissing = (asset.evidenceStatus ?? "").toLowerCase() === "missingdata";
    const hasMissingMediaFallback = asset.totalSteps > 0 && asset.completedSteps >= asset.totalSteps && asset.missingItems > 0;
    const missingCount = missingMediaFlag?.missingSteps?.length
      ?? (missingMediaFlag ? Math.max(0, missingMediaFlag.totalExpected - missingMediaFlag.totalCaptured) : 0)
      ?? 0;
    const effectiveMissingCount = missingCount > 0 ? missingCount : asset.missingItems;
    const hasMissingMedia = Boolean(missingMediaFlag) || hasMissingMediaFallback || evidenceMissing;

    const widgets: MyJobsCardWidget[] = [];
    if (hasMissingMedia) {
      widgets.push({ kind: "missing-photo", count: Math.max(0, effectiveMissingCount), color: "warning" });
    }
    if (asset.hasOpenIssues === true) {
      widgets.push({ kind: "issue", count: 0, color: "error" });
    }

    if (hasMissingMedia) {
      return {
        actionKind: "missing-media",
        chipLabel: "Missing captures",
        chipColor: "warning",
        buttonLabel: isNativePlatform ? "Add Photos" : "Add Missing Photos",
        buttonColor: "warning",
        helperText: effectiveMissingCount > 0
          ? `${effectiveMissingCount} missing photo${effectiveMissingCount === 1 ? "" : "s"}`
          : "Required workflow captures are still missing",
        widgets,
      };
    }

    if (pendingSignature) {
      return {
        actionKind: "default",
        chipLabel: "Pending sign",
        chipColor: "info",
        buttonLabel: pendingSignatureStageLabel(pendingSignature.signatureStatus),
        buttonColor: "warning",
        helperText: pendingSignatureStageText(pendingSignature.signatureStatus),
        widgets,
      };
    }

    if (isPaused) {
      return {
        actionKind: "default",
        chipLabel: "Paused by user",
        chipColor: "warning",
        buttonLabel: "Resume Run",
        buttonColor: "primary",
        helperText: "Paused by user",
        widgets,
      };
    }

    if (isActive) {
      const flagged = asset.hasOpenIssues === true;
      return {
        actionKind: "default",
        chipLabel: "In Progress",
        chipColor: flagged ? "error" : "primary",
        buttonLabel: "Continue Run",
        buttonColor: "primary",
        helperText: flagged ? "In progress - issue flagged" : "Running",
        widgets,
      };
    }

    if (isAssetSignatureStatusFinalized(asset.signatureStatus)) {
      return {
        actionKind: "default",
        chipLabel: "Complete",
        chipColor: "success",
        buttonLabel: "Run Details",
        buttonColor: "inherit",
        helperText: "Field work complete",
        widgets,
      };
    }

    return {
      actionKind: "default",
      chipLabel: isPendingAsset(asset.status) ? "Pending sign" : "Not Started",
      chipColor: isPendingAsset(asset.status) ? "info" : "default",
      buttonLabel: "Start Run",
      buttonColor: "inherit",
      helperText: isPendingAsset(asset.status) ? "Awaiting sign-off" : "Ready to start",
      widgets,
    };
  }, [isNativePlatform, missingMediaFlags, nativeMyJobsCardContext, pendingSigs]);

  type DashboardProductWorkflow = { configId: string; configName: string; workflowTypeId?: string } | null;

  async function resolveProductWorkflowForAsset(
    fullAsset: Awaited<ReturnType<typeof projectAssetService.getById>>,
    assignments: WorkflowAssignment[],
  ): Promise<DashboardProductWorkflow> {
    if (assignments.length > 0 || !fullAsset?.productConfigId) return null;
    try {
      let cfg = await workflowConfigService.getByIdLocalFirst(fullAsset.productConfigId);
      if (!cfg && !shouldSkipBlockingFetch()) {
        cfg = await workflowConfigService.getById(fullAsset.productConfigId);
      }
      if (!cfg) return null;
      return {
        configId: cfg.id,
        configName: cfg.name,
        workflowTypeId: cfg.workflowTypeId,
      };
    } catch {
      return null;
    }
  }

  async function loadQuickActionContext(asset: QuickActionAsset) {
    const [localAssignments, runs, cachedEntity] = await Promise.all([
      WorkflowAssignmentRepository.getLocalByAsset(asset.id).catch(() => []),
      assetWorkflowRunService.listByAsset(asset.id).catch(() => []),
      entityGetAsset(asset.id),
    ]);

    let assignments = localAssignments.length > 0
      ? localAssignments
      : (dashboardAssignmentsMap[asset.id] ?? []);

    if (assignments.length === 0 && !shouldSkipBlockingFetch()) {
      assignments = await assetWorkflowAssignmentService.listByAsset(asset.id);
    }

    const cachedAsset = (cachedEntity?.data as ProjectAsset | undefined)
      ?? nativeMyJobsCardContext[asset.id]?.asset
      ?? null;

    let fullAsset: ProjectAsset | null = cachedAsset;
    if (!fullAsset && !shouldSkipBlockingFetch()) {
      fullAsset = await projectAssetService.getById(asset.id).catch(() => null);
    }

    const resolvedProductWorkflow = await resolveProductWorkflowForAsset(fullAsset, assignments);
    return { assignments, runs, fullAsset, resolvedProductWorkflow };
  }

  useEffect(() => {
    if (!isNativePlatform || !quickActionOpen || !quickActionAsset) return;
    const asset = quickActionAsset;
    const onAssignmentsUpdated = (event: Event) => {
      const assetId = (event as CustomEvent<{ assetId?: string }>).detail?.assetId;
      if (assetId !== asset.id) return;
      void loadQuickActionContext(asset).then((ctx) => {
        setQuickActionAssignments(ctx.assignments);
        setQuickActionRuns(ctx.runs);
        setProductWorkflow(ctx.resolvedProductWorkflow);
      });
    };
    window.addEventListener("repo:assignments:updated", onAssignmentsUpdated);
    return () => window.removeEventListener("repo:assignments:updated", onAssignmentsUpdated);
  }, [isNativePlatform, quickActionAsset, quickActionOpen]);

  function getQuickActionAttentionForAsset(asset: QuickActionAsset, runs: AssetWorkflowRun[]) {
    const sortedRuns = [...runs].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const latestRun = sortedRuns[0] ?? null;
    const assetIssues = openIssues.filter((issue) => issue.assetId === asset.id);

    return {
      blockingIssues: assetIssues.filter((issue) => issue.isBlocking),
      highObservations: assetIssues.filter(
        (issue) =>
          !issue.isBlocking &&
          issue.issueType === "observation" &&
          issue.severity === "high"
      ),
      pendingSignature:
        pendingSigs.find(
          (sig) => sig.assetId === asset.id
        ) ?? null,
      missingMedia: resolveMissingMediaForAsset(asset, runs),
      activeRun: sortedRuns.find((run) => !run.isLocked) ?? null,
      latestRun,
    };
  }

  function canStartDirectlyFromDashboard(params: {
    asset: QuickActionAsset;
    assignments: WorkflowAssignment[];
    runs: AssetWorkflowRun[];
    productWorkflow: DashboardProductWorkflow;
  }) {
    const { asset, assignments, runs, productWorkflow } = params;
    const attention = getQuickActionAttentionForAsset(asset, runs);

    if (asset.assignedUserId !== user.id) return false;
    if (attention.blockingIssues.length > 0) return false;
    if (attention.highObservations.length > 0) return false;
    if (attention.missingMedia) return false;
    if (attention.pendingSignature) return false;
    if (attention.activeRun) return false;

    if (assignments.length === 1) return true;
    if (assignments.length > 1) return false;
    if (runs.length > 0) return false;

    return Boolean(productWorkflow);
  }

  // Quick action dialog handlers
  async function openQuickActionDialog(asset: QuickActionAsset) {
    setQuickActionAsset(asset);
    setQuickActionOpen(true);
    setQuickActionLoading(true);
    setDocsLoading(true);
    setProductWorkflow(null);
    try {
      const { assignments, runs, resolvedProductWorkflow } = await loadQuickActionContext(asset);
      const docs = await assetDocumentLinkService.listByAsset(asset.id).catch(() => []);
      setQuickActionAssignments(assignments);
      setQuickActionRuns(runs);
      setDocsCount(Array.isArray(docs) ? docs.length : 0);
      setProductWorkflow(resolvedProductWorkflow);
    } catch {
      setQuickActionAssignments([]);
      setQuickActionRuns([]);
      setDocsCount(0);
    } finally {
      setQuickActionLoading(false);
      setDocsLoading(false);
    }
  }

  function closeQuickActionDialog() {
    setQuickActionOpen(false);
    setQuickActionAsset(null);
    setQuickActionAssignments([]);
    setQuickActionRuns([]);
  }

  async function openMissingMediaFromDashboardAsset(asset: QuickActionAsset) {
    setRunnerLoading(asset.id);
    try {
      const runs = await assetWorkflowRunService.listByAsset(asset.id).catch(() => []);
      const missingMedia = resolveMissingMediaForAsset(asset, runs);
      if (!missingMedia) {
        await openQuickActionOrStart(asset);
        return;
      }
      setPhotoUploadMode("installer");
      setPhotoUploadTarget(missingMedia);
    } finally {
      setRunnerLoading((current) => (current === asset.id ? null : current));
    }
  }

  async function openQuickActionOrStart(asset: QuickActionAsset) {
    setQuickActionLoading(true);
    setRunnerLoading(asset.id);
    setDocsLoading(true);
    let docsLoadDeferred = false;
    try {
      const { assignments, runs, resolvedProductWorkflow } = await loadQuickActionContext(asset);

      // Reconcile resume-vs-start in background without blocking the tap path.
      assetWorkflowRunService.refreshByAssetInBackground(asset.id);

      const attention = getQuickActionAttentionForAsset(asset, runs);
      if (attention.activeRun && !attention.activeRun.isLocked) {
        const launched = await resumeActiveRunFromDashboard(asset, attention.activeRun);
        if (launched) return;
      }

      if (assignments.length === 1 && canStartDirectlyFromDashboard({
        asset,
        assignments,
        runs,
        productWorkflow: null,
      })) {
        await startWorkflowFromDashboard(asset, assignments[0], runs);
        return;
      }

      if (canStartDirectlyFromDashboard({
        asset,
        assignments,
        runs,
        productWorkflow: resolvedProductWorkflow,
      })) {
        if (assignments.length === 1) {
          await startWorkflowFromDashboard(asset, assignments[0], runs);
          return;
        }
        if (resolvedProductWorkflow) {
          await launchProductWorkflowFromDashboard(asset, resolvedProductWorkflow);
          return;
        }
      }

      setQuickActionAsset(asset);
      setQuickActionAssignments(assignments);
      setQuickActionRuns(runs);
      setDocsCount(0);
      setProductWorkflow(resolvedProductWorkflow);
      setQuickActionOpen(true);

      docsLoadDeferred = true;
      void assetDocumentLinkService.listByAsset(asset.id)
        .then((links) => setDocsCount(links.length))
        .catch(() => setDocsCount(0))
        .finally(() => setDocsLoading(false));
    } catch {
      setQuickActionAsset(asset);
      setQuickActionAssignments([]);
      setQuickActionRuns([]);
      setDocsCount(0);
      setProductWorkflow(null);
      setQuickActionOpen(true);
    } finally {
      setRunnerLoading((current) => (current === asset.id ? null : current));
      if (!docsLoadDeferred) setDocsLoading(false);
      setQuickActionLoading(false);
    }
  }

  async function openRunnerWithPayload(
    asset: QuickActionAsset,
    configId: string,
    source: string,
    options?: {
      runs?: AssetWorkflowRun[];
      existingRunId?: string;
      onOpened?: () => void;
    },
  ): Promise<boolean> {
    markWorkflowOpenTap(source, configId);
    setRunnerLoading(asset.id);
    try {
      const payload = await loadWorkflowOpenPayload(configId, { id: asset.id }, {
        runs: options?.runs,
        workflowConfigIdForRun: configId,
      });
      if (!payload) {
        if (isOfflineConfigMissingContext()) {
          alert(OFFLINE_CONFIG_MISSING_MESSAGE);
          retryOfflineDownload();
        } else {
          alert("Workflow config not found.");
        }
        return false;
      }
      if (payload.workflow.steps.length === 0) {
        alert("This workflow has no steps defined.");
        return false;
      }
      setRunnerExistingRunId(options?.existingRunId ?? payload.existingRunId);
      setRunnerAsset(asset);
      setRunnerWorkflow(payload.workflow);
      setRunnerWorkflowConfigId(configId);
      setRunnerOpen(true);
      refreshWorkflowOpenDataInBackground(asset.id, configId);
      options?.onOpened?.();
      return true;
    } catch {
      alert("Failed to load workflow.");
      return false;
    } finally {
      setRunnerLoading(null);
    }
  }

  async function launchProductWorkflowFromDashboard(asset: QuickActionAsset, workflowMeta: { configId: string; configName: string; workflowTypeId?: string }) {
    setRunnerExistingRunId(undefined);
    const opened = await openRunnerWithPayload(asset, workflowMeta.configId, "dashboard-product", {
      onOpened: closeQuickActionDialog,
    });
    if (!opened) return;
  }

  const quickActionPrimaryAction = useMemo(() => {
    if (!quickActionAsset) {
      return null as null | {
        label: string;
        color: "primary" | "success" | "warning" | "error" | "info";
        onClick: () => void;
      };
    }

    const assignmentForActiveRun =
      quickActionAttention.activeRun
        ? quickActionAssignments.find(
            (assignment) => assignment.workflowConfigId === quickActionAttention.activeRun?.workflowConfigId
          ) ?? null
        : null;
    const primaryAssignment = quickActionAssignments[0] ?? null;
    const hasMatchingActiveRun = primaryAssignment
      ? quickActionRuns.some((run) => !run.isLocked && run.workflowConfigId === primaryAssignment.workflowConfigId)
      : false;

    if (quickActionAttention.missingMedia) {
      return {
        label: isNativePlatform ? "Add Photos" : "Add Missing Photos",
        color: "warning" as const,
        onClick: () => {
          setPhotoUploadMode("installer");
          setPhotoUploadTarget(quickActionAttention.missingMedia);
          closeQuickActionDialog();
        },
      };
    }

    if (quickActionAttention.activeRun && assignmentForActiveRun) {
      return {
        label: "Resume Run",
        color: "primary" as const,
        onClick: () => checkAssignmentThenStartFromDashboard(quickActionAsset, assignmentForActiveRun),
      };
    }

    if (quickActionAttention.blockingIssues.length > 0) {
      return {
        label: isNativePlatform ? "Resolve Issue" : "Resolve Blocking Issue",
        color: "error" as const,
        onClick: () => {
          closeQuickActionDialog();
          openIssueRepair(quickActionAttention.blockingIssues[0]);
        },
      };
    }

    if (quickActionAttention.pendingSignature) {
      const pendingSignature = quickActionAttention.pendingSignature;
      return {
        label: pendingSignatureStageLabel(pendingSignature.signatureStatus),
        color: "warning" as const,
        onClick: () => {
          closeQuickActionDialog();
          openSignatureRepair(pendingSignature);
        },
      };
    }

    if (quickActionAttention.highObservations.length > 0) {
      return {
        label: "Review High Observation",
        color: "info" as const,
        onClick: () => {
          closeQuickActionDialog();
          openIssueRepair(quickActionAttention.highObservations[0]);
        },
      };
    }

    if (primaryAssignment) {
      return {
        label: hasMatchingActiveRun ? "Resume Run" : "Start Run",
        color: hasMatchingActiveRun ? ("primary" as const) : ("success" as const),
        onClick: () => checkAssignmentThenStartFromDashboard(quickActionAsset, primaryAssignment),
      };
    }

    if (productWorkflow) {
      return {
        label: "Start Run",
        color: "success" as const,
        onClick: () => launchProductWorkflowFromDashboard(quickActionAsset, productWorkflow),
      };
    }

    return null;
  }, [isNativePlatform, openIssueRepair, openSignatureRepair, productWorkflow, quickActionAsset, quickActionAssignments, quickActionAttention, quickActionRuns]);

  function checkAssignmentThenStartFromDashboard(asset: QuickActionAsset, assignment?: WorkflowAssignment) {
    if (!asset.assignedUserId) {
      setAutoAssignConfirm({ asset, assignment, reason: "unassigned" });
      return;
    }
    if (asset.assignedUserId !== user.id) {
      const otherName = "another user";
      setAutoAssignConfirm({ asset, assignment, reason: "other", otherName });
      return;
    }
    if (assignment) {
      void startWorkflowFromDashboard(asset, assignment);
    }
  }

  async function startWorkflowFromDashboard(asset: QuickActionAsset, assignment: WorkflowAssignment, runsOverride?: AssetWorkflowRun[]) {
    await openRunnerWithPayload(asset, assignment.workflowConfigId, "dashboard-start", {
      runs: runsOverride ?? quickActionRuns,
      onOpened: closeQuickActionDialog,
    });
  }

  /**
   * Resume a paused or in-progress run directly from the dashboard — no
   * Quick Action Dialog shown. Mirrors the web assets-page
   * `case "resume"` flow (`AssetInstallationPage.tsx:3010`). Works the same
   * online and offline: the run is read from local cache via
   * `assetWorkflowRunService.listByAsset`, the config via
   * `workflowConfigService.getById` (which has an offline short-circuit),
   * and the runner reads the run from local cache and writes back to it
   * via `offlineStore.saveRun`. Returns true if the runner was opened,
   * false if it fell through (caller should still open the dialog so the
   * user at least sees the options).
   */
  async function resumeActiveRunFromDashboard(asset: QuickActionAsset, run: AssetWorkflowRun): Promise<boolean> {
    return openRunnerWithPayload(asset, run.workflowConfigId, "dashboard-resume", {
      existingRunId: run.id,
      onOpened: closeQuickActionDialog,
    });
  }

  async function confirmAutoAssignAndStartFromDashboard() {
    if (!autoAssignConfirm) return;
    const { asset, assignment } = autoAssignConfirm;
    setAutoAssignConfirm(null);
    // Persist the take-over / auto-assign so the asset actually changes hands.
    //
    // Must use patchAssignment() (narrow, installer-permitted) rather than update()
    // (the broad PUT, which is Admin/PM-only and 403s for installers — the failure was
    // then swallowed here, so the asset never changed hands). assignedUserId is what
    // this very Dashboard's "My Jobs Today" query filters on
    // (.Where(a => a.AssignedUserId == effectiveUserId)), so a failed assignment means
    // the job never appears for the new owner and stays with the previous one.
    try {
      await projectAssetService.patchAssignment(asset.id, user.id);
      projectAssetService.listOpen().then(setOpenAssets).catch(() => {});
    } catch {
      // Do not start the run: an unpersisted assignment means the job would never show
      // up in the new owner's "My Jobs Today".
      setDashboardError("Could not assign this asset to you. The run was not started — please try again.");
      return;
    }
    if (assignment) {
      void startWorkflowFromDashboard(asset, assignment);
    }
  }

  function isInspectionWorkflowType(workflowTypeId?: string): boolean {
    if (!workflowTypeId) return false;
    const typeName = String(workflowTypeId).toLowerCase();
    return typeName.includes("inspection") || typeName === "insp";
  }

  // Load workflow configs scoped to this asset's product when the assign
  // dialog opens — mirrors AssetInstallationPage.openAssignDialog(). The
  // Workflow Type is no longer a user choice: the project already fixes it,
  // and it's derived from the chosen config (resolveConfigWorkflowTypeId).
  async function openAssignDialogFromDashboard() {
    if (!quickActionAsset) return;
    setAssignForm({ workflowTypeId: "", workflowConfigId: "" });
    setAssignDialogOpen(true);
    try {
      const fullAsset = await projectAssetService.getByIdLocalFirst(quickActionAsset.id);
      if (!fullAsset?.productId) {
        setWorkflowConfigs([]);
        return;
      }
      const [types, cfgs] = await Promise.all([
        workflowTypeService.list(),
        workflowConfigService.listByProduct(fullAsset.productId, "Published"),
      ]);
      setWorkflowTypes(types);
      setWorkflowConfigs(cfgs);
    } catch {
      setWorkflowConfigs([]);
    }
  }

  async function saveAssignmentFromDashboard() {
    if (!quickActionAsset || !assignForm.workflowConfigId) return;
    const cfg = workflowConfigs.find((c) => c.id === assignForm.workflowConfigId);
    const workflowTypeId = cfg ? resolveConfigWorkflowTypeId(cfg, workflowTypes) || (cfg.workflowTypeId ?? "") : "";
    if (!workflowTypeId) {
      alert("Could not determine the workflow type for this config. Reconnect and try again.");
      return;
    }
    setAssignSaving(true);
    try {
      await assetWorkflowAssignmentService.create(quickActionAsset.id, assignForm.workflowConfigId, workflowTypeId);
      // Reload assignments
      const [assignments, runs] = await Promise.all([
        assetWorkflowAssignmentService.listByAsset(quickActionAsset.id),
        assetWorkflowRunService.listByAsset(quickActionAsset.id),
      ]);
      setQuickActionAssignments(assignments);
      setQuickActionRuns(runs);
      setAssignDialogOpen(false);
      setAssignForm({ workflowTypeId: "", workflowConfigId: "" });
    } catch (err) {
      console.error("[Dashboard] Failed to save assignment", err);
      alert("Failed to assign workflow. Please try again.");
    } finally {
      setAssignSaving(false);
    }
  }

  const myInstallBlocking = useMemo(
    () => openIssues.filter((issue) => issue.isBlocking && myInstallAssets.some((asset) => asset.id === issue.assetId)),
    [openIssues, myInstallAssets]
  );
  const myInstallPendingSigs = useMemo(
    () => pendingSigs.filter((sig) =>
      isPendingInstallerSignature(sig.signatureStatus)
      && myInstallAssets.some((asset) => asset.id === sig.assetId)),
    [pendingSigs, myInstallAssets],
  );
  // High-severity observations on user's assigned assets (created by the current user)
  const myInstallHighObservations = useMemo(
    () => openIssues.filter((issue) =>
      !issue.isBlocking &&
      issue.severity === "high" &&
      issue.issueType === "observation" &&
      (issue.createdBy ?? "") === user.fullName &&
      myInstallAssets.some((asset) => asset.id === issue.assetId)
    ),
    [openIssues, myInstallAssets, user.fullName]
  );
  const myInstallAttentionCount = myInstallBlocking.length + myInstallPendingSigs.length + myInstallHighObservations.length;
  const myInstallMissingMediaCount = useMemo(
    () => missingMediaFlags.filter((flag) => flag.technicianUserId === user.id).length,
    [missingMediaFlags, user.id]
  );
  const myInspectionBlocking = useMemo(
    () => openIssues.filter((issue) => issue.isBlocking && myInspectionAssets.some((asset) => asset.id === issue.assetId)),
    [openIssues, myInspectionAssets]
  );
  const myInspectionPendingSigs = useMemo(
    () => pendingSigs.filter((sig) =>
      isPendingInstallerSignature(sig.signatureStatus)
      && myInspectionAssets.some((asset) => asset.id === sig.assetId)),
    [pendingSigs, myInspectionAssets],
  );
  const myInspectionMissingMediaCount = useMemo(
    () => missingMediaFlags.filter((flag) => myInspectionAssets.some((asset) => asset.id === flag.assetId)).length,
    [missingMediaFlags, myInspectionAssets]
  );
  // Fix: this was missing entirely — myInstallHighObservations had an Inspections
  // equivalent for blocking issues, pending signatures, and missing media, but
  // not for high-severity observations. Modeled directly on myInstallHighObservations.
  const myInspectionHighObservations = useMemo(
    () => openIssues.filter((issue) =>
      !issue.isBlocking &&
      issue.severity === "high" &&
      issue.issueType === "observation" &&
      (issue.createdBy ?? "") === user.fullName &&
      myInspectionAssets.some((asset) => asset.id === issue.assetId)
    ),
    [openIssues, myInspectionAssets, user.fullName]
  );
  const myInspectionAttentionCount = myInspectionBlocking.length + myInspectionPendingSigs.length + myInspectionHighObservations.length;

  const inspectionScopeProjects = useMemo(
    () => dashboardProjects.filter((project) => project.workflowMode === "INSPECTION_ONLY" || project.workflowMode === "MIXED"),
    [dashboardProjects]
  );
  const inspectionScopeProjectIds = useMemo(
    () => new Set(inspectionScopeProjects.map((project) => project.id)),
    [inspectionScopeProjects]
  );
  const inspectionScopeAssets = useMemo(
    () => visibleOpenAssets.filter((asset) => inspectionScopeProjectIds.has(asset.projectId)),
    [visibleOpenAssets, inspectionScopeProjectIds]
  );
  const installScopeAssets = useMemo(
    () => visibleOpenAssets.filter((asset) => !inspectionScopeProjectIds.has(asset.projectId)),
    [visibleOpenAssets, inspectionScopeProjectIds]
  );
  const installScopeProjectIds = useMemo(
    () => new Set(installScopeAssets.map((asset) => asset.projectId)),
    [installScopeAssets]
  );
  const installScopeProjects = useMemo(
    () => dashboardProjects.filter((project) => installScopeProjectIds.has(project.id)),
    [dashboardProjects, installScopeProjectIds]
  );
  const installProjectsWithOpenAssets = useMemo(
    () => installScopeProjects.filter((project) => installScopeAssets.some((asset) => asset.projectId === project.id)),
    [installScopeAssets, installScopeProjects]
  );
  const filteredAdminInstallAssets = useMemo(() => {
    switch (adminInstallFilter) {
      case "in-progress":
        return installScopeAssets.filter((asset) => isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status));
      case "unassigned":
        return installScopeAssets.filter((asset) => !asset.assignedUserId);
      default:
        return installScopeAssets;
    }
  }, [adminInstallFilter, installScopeAssets]);
  const filteredAdminInstallProjects = useMemo(() => {
    const pmFilter = adminInstallPmFilter.trim().toLowerCase();
    const jobFilter = adminInstallProjectFilter.trim().toLowerCase();
    return installProjectsWithOpenAssets.filter((project) => {
      const pmMatches = !pmFilter || String(project.projectManager ?? "").toLowerCase().includes(pmFilter);
      const jobMatches = !jobFilter || String(project.jobNumber ?? "").toLowerCase().includes(jobFilter);
      return pmMatches && jobMatches;
    });
  }, [adminInstallPmFilter, adminInstallProjectFilter, installProjectsWithOpenAssets]);
  const totalInstallAssetCount = installScopeAssets.length;
  const projectsMissingPm = useMemo(
    () => dashboardProjects.filter((project) => !project.projectManager?.trim()),
    [dashboardProjects]
  );

  // Show My Inspections tab for managers always; for others only if assigned to inspection assets
  const hasInspectionsTab = isManager || myInspectionAssets.length > 0 || myInspectionHistory.length > 0 || inspectionRunsDue > 0;
  const showInspectionInbox = inspectionRunsDue > 0 || inspectionImportsWaiting > 0 || inspectionImportsFailed > 0;
  const myInspectionPausedCount = useMemo(
    () => myInspectionAssets.filter((asset) => isPausedAsset(asset.runStatus)).length,
    [myInspectionAssets]
  );
  const myInspectionActiveCount = useMemo(
    () => myInspectionAssets.filter((asset) => !isPausedAsset(asset.runStatus) && (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status))).length,
    [myInspectionAssets]
  );
  const myInspectionPendingCount = useMemo(
    () => myInspectionAssets.filter((asset) => !isPausedAsset(asset.runStatus) && !isInProgressAsset(asset.runStatus) && !isInProgressAsset(asset.status) && isPendingAsset(asset.status)).length,
    [myInspectionAssets]
  );
  const myInspectionQueuedCount = useMemo(
    () => myInspectionAssets.filter((asset) => !isPausedAsset(asset.runStatus) && !isInProgressAsset(asset.runStatus) && !isInProgressAsset(asset.status) && isNotStartedAsset(asset.status)).length,
    [myInspectionAssets]
  );

  const projectTabSignal = useMemo<DashboardTabSignal>(() => ({
    count: projectCount,
    tone:
      projectCount === 0
        ? "success"
        : blockingIssues.length > 0 || missingMediaFlags.length > 0 || visiblePendingSigs.length > 0 || highIssues.length > 0
        ? "error"
        : visibleOpenAssets.some((asset) =>
            !isPausedAsset(asset.runStatus) &&
            !isInProgressAsset(asset.runStatus) &&
            !isInProgressAsset(asset.status) &&
            isNotStartedAsset(asset.status)
          ) || pendingApprovals.length > 0
          ? "warning"
          : "info",
  }), [
    blockingIssues.length,
    highIssues.length,
    missingMediaFlags.length,
    pendingApprovals.length,
    projectCount,
    visibleOpenAssets,
    visiblePendingSigs.length,
  ]);

  const inspectionTabSignal = useMemo<DashboardTabSignal>(() => ({
    count: myInspectionAssets.length,
    tone:
      myInspectionAssets.length === 0
        ? "success"
        : myInspectionBlocking.length > 0 || myInspectionPendingSigs.length > 0 || myInspectionMissingMediaCount > 0 || inspectionImportsFailed > 0
        ? "error"
        : inspectionRunsDue > 0 || inspectionImportsWaiting > 0 || myInspectionPausedCount > 0 || myInspectionPendingCount > 0 || myInspectionQueuedCount > 0
          ? "warning"
          : myInspectionActiveCount > 0
            ? "primary"
            : "info",
  }), [
    inspectionImportsFailed,
    inspectionImportsWaiting,
    inspectionRunsDue,
    myInspectionActiveCount,
    myInspectionAssets.length,
    myInspectionBlocking.length,
    myInspectionMissingMediaCount,
    myInspectionPausedCount,
    myInspectionPendingCount,
    myInspectionPendingSigs.length,
    myInspectionQueuedCount,
  ]);

  const installTabSignal = useMemo<DashboardTabSignal>(() => ({
    count: myInstallAssets.length,
    tone:
      myInstallAssets.length === 0
        ? "success"
        : myInstallBlocking.length > 0 || myInstallPendingSigs.length > 0 || myInstallHighObservations.length > 0 || myInstallMissingMediaCount > 0
        ? "error"
        : myPaused.length > 0 || myPending.length > 0 || myQueued.length > 0
          ? "warning"
          : myActive.length > 0
            ? "primary"
            : "info",
  }), [
    myActive.length,
    myInstallAssets.length,
    myInstallBlocking.length,
    myInstallHighObservations.length,
    myInstallMissingMediaCount,
    myInstallPendingSigs.length,
    myPaused.length,
    myPending.length,
    myQueued.length,
  ]);

  const renderDashboardTabLabel = useCallback((title: string, signal: DashboardTabSignal) => (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
      <Box
        component="span"
        sx={{
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </Box>
      <Chip
        label={signal.count}
        size="small"
        color={signal.tone}
        variant="filled"
        sx={{ height: 18, fontSize: "0.62rem", fontWeight: 700 }}
      />
    </Stack>
  ), []);

  const getDashboardTabSx = useCallback(() => {
    return {
      minHeight: 36,
      py: 0.5,
      px: 0.5,
      mr: 0.75,
      fontSize: "0.8rem",
      borderRadius: 1.25,
      minWidth: "fit-content",
      transition: "all 0.2s ease",
      "&.Mui-selected": {
        color: "primary.main",
      },
    };
  }, []);

  const handleDashboardTabChange = useCallback((nextTab: PmDashboardTab) => {
    fieldTabCorrected.current = true;
    setPmDashboardTab(nextTab);
  }, []);

  useEffect(() => {
    dashboardProjectScopeCorrected.current = false;
  }, [user.id]);

  // useAuth boots as Viewer first, so Admin can initialize to "mine" before
  // the real role lands. Correct that once on web without overriding later
  // manual scope changes.
  useEffect(() => {
    if (isNativePlatform || !isAuthenticated || !isAdmin || !canViewAllProjects) return;
    if (dashboardProjectScopeCorrected.current) return;
    if (dashboardProjectScope === "all") {
      dashboardProjectScopeCorrected.current = true;
      return;
    }
    setDashboardProjectScope("all");
    dashboardProjectScopeCorrected.current = true;
  }, [canViewAllProjects, dashboardProjectScope, isAdmin, isAuthenticated, isNativePlatform]);

  // Redirect to a valid tab when the current selection isn't available for this user.
  // Also corrects the initial tab for managers: useAuth starts with role="Viewer" so
  // the useState initializer picks "my-installs"; once the real role resolves we
  // correct once to "pm-projects" using a one-shot ref (doesn't override later clicks).
  useEffect(() => {
    if (isManager && showPmProjectsTab && !tabRoleCorrected.current && pmDashboardTab === "my-installs") {
      setPmDashboardTab("pm-projects");
      tabRoleCorrected.current = true;
      return;
    }
    if (!isManager
      && hasInspectionsTab
      && !fieldTabCorrected.current
      && pmDashboardTab === "my-installs"
      && installTabSignal.count === 0
      && inspectionTabSignal.count > 0) {
      setPmDashboardTab("my-inspections");
      fieldTabCorrected.current = true;
      return;
    }
    if (pmDashboardTab === "pm-projects" && !showPmProjectsTab) {
      setPmDashboardTab(hasInspectionsTab ? "my-inspections" : "my-installs");
    }
    if (pmDashboardTab === "my-inspections" && !hasInspectionsTab) {
      setPmDashboardTab("my-installs");
    }
  }, [hasInspectionsTab, inspectionTabSignal.count, installTabSignal.count, isManager, pmDashboardTab, showPmProjectsTab]);

  const overviewPausedCount = showAdminOverviewStrip
    ? visibleOpenAssets.filter((asset) => isPausedAsset(asset.runStatus)).length
    : myPaused.length;
  const overviewActiveCount = showAdminOverviewStrip
    ? visibleOpenAssets.filter((asset) => !isPausedAsset(asset.runStatus) && (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status))).length
    : myActive.length;
  const overviewQueuedCount = showAdminOverviewStrip
    ? visibleOpenAssets.filter((asset) => !isPausedAsset(asset.runStatus) && !isInProgressAsset(asset.runStatus) && !isInProgressAsset(asset.status) && isNotStartedAsset(asset.status)).length
    : myQueued.length;
  const overviewPendingCount = showAdminOverviewStrip
    ? visibleOpenAssets.filter((asset) => !isPausedAsset(asset.runStatus) && !isInProgressAsset(asset.runStatus) && !isInProgressAsset(asset.status) && isPendingAsset(asset.status)).length
    : myPending.length;
  const overviewBlockingCount = showAdminOverviewStrip
    ? blockingIssues.length
    : myBlocking.length;

  // Load inspection signals for PM/Admin and installers
  useEffect(() => {
    if (dashboardBootPhase !== "full") {
      setInspectionRunsDue(0);
      setInspectionImportsWaiting(0);
      setInspectionImportsFailed(0);
      return;
    }
    if (!isManager && !canActAsFieldTechnician) {
      setInspectionRunsDue(0);
      setInspectionImportsWaiting(0);
      setInspectionImportsFailed(0);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [runResponse, waitingImports, failedImports] = await Promise.all([
          api.get<InspectionRunSignal[]>("/asset-workflow-runs", {
            params: { workflowType: "Inspection" },
          }),
          isManager ? inspectionImportService.list({ status: "NEEDS_ASSIGNMENT" }) : Promise.resolve([]),
          isManager ? inspectionImportService.list({ status: "FAILED" }) : Promise.resolve([]),
        ]);

        if (cancelled) return;

        const scopedRuns = isManager
          ? runResponse.data.filter((run) => visibleProjectIds.has(run.projectId))
          : runResponse.data.filter((run) => run.assignedUserId === user.id);

        setInspectionRunsDue(scopedRuns.filter((run) => isOpenInspectionStatus(run.status)).length);

        if (isManager) {
          const canSeeImport = (projectId?: string) => {
            if (projectId) return visibleProjectIds.has(projectId);
            return user.role === "Admin";
          };

          setInspectionImportsWaiting(waitingImports.filter((item) => canSeeImport(item.projectId || undefined)).length);
          setInspectionImportsFailed(failedImports.filter((item) => canSeeImport(item.projectId || undefined)).length);
        } else {
          setInspectionImportsWaiting(0);
          setInspectionImportsFailed(0);
        }
      } catch {
        if (!cancelled) {
          setInspectionRunsDue(0);
          setInspectionImportsWaiting(0);
          setInspectionImportsFailed(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canActAsFieldTechnician, dashboardBootPhase, isManager, user.id, user.role, visibleProjectIds]);

  // Project status chart
  const statusGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of dashboardProjects) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [dashboardProjects]);

  const statusColor: Record<string, string> = {
    "In Progress": "primary", "Completed": "success", "Pending Approval": "warning",
    "Closed": "info", "Cancelled": "error", "Draft": "default", "Approved": "info", "On Hold": "warning",
  };

  const MyInspectionWorkspace = (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <AssessmentOutlined sx={{ color: "primary.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>{isAdmin ? "Inspections" : "My Inspections"}</Typography>
        {workspaceLoading && !cacheHydrated && <CircularProgress size={14} sx={{ ml: 1 }} />}
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        {isAdmin ? "Inspection activity across the current dashboard scope, grouped with PM ownership." : "Current inspection work plus your recent inspection history."}
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Assigned</Typography>
            <Typography variant="h5" fontWeight={700}>{myInspectionAssets.length}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Not Started</Typography>
            <Typography variant="h5" fontWeight={700}>{myInspectionAssets.filter((a) => isNotStartedAsset(a.status)).length}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary">In Progress</Typography>
            <Typography variant="h5" fontWeight={700}>{myInspectionAssets.filter((a) => isInProgressAsset(a.runStatus) || isInProgressAsset(a.status)).length}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary">History</Typography>
            <Typography variant="h5" fontWeight={700}>{myInspectionHistory.length}</Typography>
          </Paper>
        </Grid>
      </Grid>

      {myInspectionAssets.length === 0 && !workspaceLoading ? (
        <Typography variant="caption" color="text.disabled">No inspection assets currently assigned to you.</Typography>
      ) : (
        <Grid container spacing={1.5}>
          {myInspectionAssets.slice(0, 6).map((asset) => (
            <Grid item xs={12} sm={6} md={4} key={asset.id}>
              <Paper elevation={0}
                onClick={() => navigate("/installations/assets?workflowType=Inspection")}
                sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
                  transition: "all 0.15s", "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
                <Stack spacing={0.75}>
                  <Typography variant="caption" fontWeight={600} noWrap display="block">
                    {asset.assetTag || asset.assetName || asset.id}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
                    {asset.jobNumber}
                  </Typography>
                  <Chip label={dashboardStatusChip(asset).label} size="small" variant="outlined"
                    color={dashboardStatusChip(asset).color}
                    sx={{ alignSelf: "flex-start", height: 16, fontSize: "0.58rem" }} />
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
      {myInspectionAssets.length > 6 && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: "block" }}>
          +{myInspectionAssets.length - 6} more {"\\u2014"}{" "}
          <Box component="span" sx={{ cursor: "pointer", color: "primary.main" }}
            onClick={() => navigate("/installations/assets?workflowType=Inspection")}>
            view all
          </Box>
        </Typography>
      )}
      <Box sx={{ mt: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <CheckCircleOutlineOutlined sx={{ fontSize: 18, color: myInspectionHistory.length > 0 ? "success.main" : "text.disabled" }} />
          <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
            Inspection History
          </Typography>
          <Chip label={myInspectionHistory.length} size="small" color={myInspectionHistory.length > 0 ? "success" : "default"} variant="outlined"
            sx={{ height: 20, fontSize: "0.7rem" }} />
        </Stack>
        {myInspectionHistory.length === 0 ? (
          <Typography variant="caption" color="text.secondary">No inspection history yet</Typography>
        ) : (
          <Stack spacing={0.75}>
            {myInspectionHistory.slice(0, 5).map((asset) => (
              <Paper key={asset.id} elevation={0}
                onClick={() => navigate("/installations/assets?workflowType=Inspection")}
                sx={{ p: 1.25, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
                  "&:hover": { borderColor: "success.main", background: "rgba(45,212,191,0.04)" } }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" fontWeight={600} noWrap display="block">
                      {asset.assetTag || asset.assetName || asset.id}
                    </Typography>
          <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
            {asset.jobNumber}{" · "}{asset.historyStatus === "Closed"
              ? `Closed ${fmtDate(asset.latestActivityAt ?? asset.completedAt)}`
              : asset.completedAt
                ? `Field work complete ${fmtDate(asset.completedAt)}`
                : `Updated ${fmtDate(asset.latestActivityAt)}`}
          </Typography>
                  </Box>
                  <Chip label={asset.historyStatus} size="small" color={historyChipColor(asset.historyStatus)} variant="outlined"
                    sx={{ height: 18, fontSize: "0.62rem" }} />
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );

  async function handleGenerateTechReport(w: TechnicianWorkloadSummaryItem) {
    setReportingTechId(w.userId);
    try {
      const exportDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      const techAssets = openAssets.filter((a) => a.assignedUserId === w.userId);
      const assetIds = new Set(techAssets.map((a) => a.id));

      // Runs carry the time tracking and issue data the report is built from. Web batches
      // one scoped request per project; native goes per asset because that path reads the
      // offline run cache first and so still produces a report with no connection.
      let runs: AssetWorkflowRun[] = [];
      if (assetIds.size > 0) {
        if (isNativePlatform) {
          const perAsset = await Promise.all(
            techAssets.map((a) => assetWorkflowRunService.listByAsset(a.id).catch(() => [])),
          );
          runs = perAsset.flat();
        } else {
          const assetIdsByProject = new Map<string, string[]>();
          for (const a of techAssets) {
            if (!a.projectId) continue;
            const forProject = assetIdsByProject.get(a.projectId) ?? [];
            forProject.push(a.id);
            assetIdsByProject.set(a.projectId, forProject);
          }
          const perProject = await Promise.all(
            [...assetIdsByProject].map(([projectId, ids]) =>
              assetWorkflowRunService.loadRunDetailsForAssets(projectId, ids).catch(() => []),
            ),
          );
          runs = perProject.flat();
        }
      }
      // Scope defensively: a project-scoped fetch can return runs for assets that are no
      // longer assigned to this technician.
      runs = runs.filter((run) => assetIds.has(run.assetId));

      const jobNumbers = [...new Set(techAssets.map((a) => a.jobNumber).filter(Boolean))];
      const reportData: TechnicianReportData = {
        technicianName: w.fullName,
        reportPeriod: jobNumbers.length > 0
          ? `Current workload · ${jobNumbers.join(", ")}`
          : "Current workload",
        runs,
        assets: techAssets.map((a) => ({
          id: a.id,
          assetTag: a.assetTag,
          assetName: a.assetName,
          jobNumber: a.jobNumber,
          location: a.location,
          status: a.status,
          runStatus: a.runStatus,
          completedSteps: a.completedSteps,
          totalSteps: a.totalSteps,
        })),
        exportDate,
      };
      await generateTechnicianReport(reportData);
    } catch {
      setDashboardError("Could not build the workload report. Check your connection and try again.");
    } finally { setReportingTechId(null); }
  }
  // Reusable: individual clickable item row
  const ItemRow = ({
    label,
    sub,
    onClick,
    actionLabel,
    customerLinkSentAt,
    projectTimeZoneId,
  }: {
    label: string;
    sub?: string;
    onClick: () => void;
    actionLabel?: string;
    customerLinkSentAt?: string | null;
    projectTimeZoneId?: string | null;
  }) => (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      sx={{
        px: 1, py: 0.5, borderRadius: 1, cursor: "pointer",
        "&:hover": { background: "rgba(255,255,255,0.07)" },
        transition: "background 0.15s",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          - {label}
        </Typography>
        {sub && <Typography variant="caption" color="text.disabled" noWrap display="block" sx={{ pl: 1.5, fontSize: "0.65rem" }}>{sub}</Typography>}
      </Box>
      {actionLabel && (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          {customerLinkSentAt && (
            <Tooltip
              title={`Link sent ${formatInstant(customerLinkSentAt, projectTimeZoneId, { withZone: true })}`}
              arrow
            >
              <CheckCircleOutlined
                sx={{ fontSize: 16, color: "success.main" }}
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          )}
          <Chip
            label={actionLabel}
            size="small"
            color="info"
            variant="outlined"
            sx={{ height: 18, fontSize: "0.6rem" }}
          />
        </Stack>
      )}
    </Stack>
  );
  // Reusable JSX blocks

  // Fix: My Installs has its own scoped "Needs Attention" panel (blocking
  // issues, pending signatures, high observations — all filtered to the
  // current user's assigned install assets), but My Inspections never had
  // an equivalent. The underlying data (myInspectionBlocking,
  // myInspectionPendingSigs, myInspectionHighObservations,
  // myInspectionAttentionCount) was correctly computed and even drove the
  // small notification badge on the Inspections tab label, but no panel
  // ever rendered it — so blocking issues, pending signatures, and high
  // observations on inspection assets were never surfaced to the user.
  // Modeled directly on the Installer "Needs Attention" block.
  const MyInspectionAttentionSection = (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <WarningAmberOutlined sx={{ color: myInspectionAttentionCount > 0 ? "warning.main" : "success.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Needs Attention</Typography>
        <Box sx={{ display: "inline-flex", alignItems: "center", minWidth: 64, ml: 1 }}>
          {attentionLoading ? (
            <CircularProgress size={14} />
          ) : myInspectionAttentionCount === 0 ? (
            <Chip label="All clear" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
          ) : null}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="text" component={Link} to="/issues"
          endIcon={<OpenInNewOutlined sx={{ fontSize: 13 }} />} sx={{ fontSize: "0.72rem" }}>
          Issues Board
        </Button>
      </Stack>

      <Grid container spacing={2}>

        {/* My Blocking Issues (inspections) */}
        <Grid item xs={12} sm={6} md={4}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: myInspectionBlocking.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
            background:  myInspectionBlocking.length > 0
              ? "linear-gradient(180deg, rgba(64,15,17,0.78) 0%, rgba(33,13,14,0.56) 100%)"
              : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ErrorOutlineOutlined sx={{ fontSize: 18, color: myInspectionBlocking.length > 0 ? "error.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My Blocking Issues</Typography>
              {resolvingDashboardIssueId && (
                <Chip
                  label="Updating"
                  size="small"
                  color="error"
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.62rem", fontWeight: 700 }}
                />
              )}
            </Stack>
            <Typography variant="h5" fontWeight={700} color={myInspectionBlocking.length > 0 ? "error.main" : "text.secondary"}>
              {myInspectionBlocking.length}
            </Typography>
            {myInspectionBlocking.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {myInspectionBlocking.slice(0, 3).map((iss) => (
                  <ItemRow key={iss.issueId}
                    label={`${iss.jobNumber}: ${iss.assetTag}`}
                    sub={iss.description.slice(0, 40) + (iss.description.length > 40 ? "..." : "")}
                    actionLabel="Resolve now"
                    onClick={() => openIssueRepair(iss)} />
                ))}
                {myInspectionBlocking.length > 3 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{myInspectionBlocking.length - 3} more
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="success.main">
                {resolvingDashboardIssueId ? "Refreshing blocking issues..." : "No blocking issues"}
              </Typography>
            )}
          </Box>
        </Grid>

        {/* My Pending Signatures (inspections) */}
        <Grid item xs={12} sm={6} md={4}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: myInspectionPendingSigs.length > 0 ? "warning.main" : "rgba(255,255,255,0.08)",
            background:  myInspectionPendingSigs.length > 0 ? "rgba(230,119,0,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <PendingActionsOutlined sx={{ fontSize: 18, color: myInspectionPendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My Pending Signatures</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={myInspectionPendingSigs.length > 0 ? "warning.main" : "text.secondary"}>
              {myInspectionPendingSigs.length}
            </Typography>
            {myInspectionPendingSigs.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {myInspectionPendingSigs.slice(0, 3).map((s) => (
                  <ItemRow key={s.runId}
                    label={`${s.jobNumber}: ${s.assetTag}`}
                    sub={`${pendingSignatureStageText(s.signatureStatus)} · Field work complete ${fmtDate(s.completedAt)}`}
                    actionLabel={pendingSignatureStageLabel(s.signatureStatus)}
                    {...(isPendingCustomerSignature(s.signatureStatus) && s.customerLinkSentAt
                      ? { customerLinkSentAt: s.customerLinkSentAt, projectTimeZoneId: s.projectTimeZoneId }
                      : {})}
                    onClick={() => openSignatureRepair(s)} />
                ))}
                {myInspectionPendingSigs.length > 3 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{myInspectionPendingSigs.length - 3} more
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="success.main">All signatures collected</Typography>
            )}
          </Box>
        </Grid>

        {/* My High Observations (inspections) */}
        <Grid item xs={12} sm={6} md={4}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: myInspectionHighObservations.length > 0 ? "warning.dark" : "rgba(255,255,255,0.08)",
            background:  myInspectionHighObservations.length > 0 ? "rgba(249,168,37,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ReportOutlined sx={{ fontSize: 18, color: myInspectionHighObservations.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My High Observations</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={myInspectionHighObservations.length > 0 ? "warning.main" : "text.secondary"}>
              {myInspectionHighObservations.length}
            </Typography>
            {myInspectionHighObservations.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {myInspectionHighObservations.slice(0, 3).map((iss) => (
                  <ItemRow key={iss.issueId}
                    label={`${iss.jobNumber}: ${iss.assetTag}`}
                    sub={iss.description.slice(0, 40) + (iss.description.length > 40 ? "..." : "")}
                    actionLabel="Review"
                    onClick={() => openIssueRepair(iss)} />
                ))}
                {myInspectionHighObservations.length > 3 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{myInspectionHighObservations.length - 3} more
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="success.main">No high-severity observations</Typography>
            )}
          </Box>
        </Grid>

      </Grid>
    </Box>
  );

  const NeedsAttentionSection = (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <WarningAmberOutlined sx={{ color: attentionCount > 0 ? "warning.main" : "success.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Needs Attention</Typography>
        <Box sx={{ display: "inline-flex", alignItems: "center", minWidth: 64, ml: 1 }}>
          {attentionLoading ? (
            <CircularProgress size={14} />
          ) : attentionCount === 0 ? (
            <Chip label="All clear" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
          ) : null}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="text" component={Link} to="/issues"
          endIcon={<OpenInNewOutlined sx={{ fontSize: 13 }} />} sx={{ fontSize: "0.72rem" }}>
          Issues Board
        </Button>
      </Stack>

      <Grid container spacing={2}>

        {/* Blocking Issues */}
        <Grid item xs={6} sm={6} md={3}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: blockingIssues.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
            background:  blockingIssues.length > 0 ? "rgba(211,47,47,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ErrorOutlineOutlined sx={{ fontSize: 18, color: blockingIssues.length > 0 ? "error.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>Blocking Issues</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={blockingIssues.length > 0 ? "error.main" : "text.secondary"}>
              {blockingIssues.length}
            </Typography>
            {blockingIssues.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {blockingIssues.slice(0, 4).map((iss) => (
                  <ItemRow key={iss.issueId}
                    label={isAdmin
                      ? projectAttentionLabel(iss.projectId, iss.jobNumber, undefined)
                      : `${iss.jobNumber}: ${iss.assetTag}`}
                    sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "..." : "")}
                    actionLabel="Resolve"
                    onClick={() => openIssueRepair(iss)} />
                ))}
                {blockingIssues.length > 4 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{blockingIssues.length - 4} more
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="success.main">No blocking issues</Typography>
            )}
          </Box>
        </Grid>

        {/* Overdue Projects */}
        <Grid item xs={6} sm={6} md={3}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: overdueProjects.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
            background:  overdueProjects.length > 0 ? "rgba(211,47,47,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <AssignmentLateOutlined sx={{ fontSize: 18, color: overdueProjects.length > 0 ? "error.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>Overdue Projects</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={overdueProjects.length > 0 ? "error.main" : "text.secondary"}>
              {overdueProjects.length}
            </Typography>
            {overdueProjects.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {overdueProjects.slice(0, 4).map((p) => (
                  <ItemRow key={p.id}
                    label={isAdmin
                      ? projectAttentionLabel(p.id, p.jobNumber, p.customerName)
                      : `${p.jobNumber} - ${p.customerName || ""}`}
                    sub={`Due ${fmtDate(p.finishDate)}`}
                    onClick={() => navigate(`/projects/${p.id}`)} />
                ))}
                {overdueProjects.length > 4 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{overdueProjects.length - 4} more
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="success.main">No overdue projects</Typography>
            )}
          </Box>
        </Grid>

        {/* Pending Signatures */}
        <Grid item xs={6} sm={6} md={3}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: visiblePendingSigs.length > 0 ? "warning.main" : "rgba(255,255,255,0.08)",
            background:  visiblePendingSigs.length > 0 ? "rgba(230,119,0,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <PendingActionsOutlined sx={{ fontSize: 18, color: visiblePendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>Pending Signatures</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={visiblePendingSigs.length > 0 ? "warning.main" : "text.secondary"}>
              {visiblePendingSigs.length}
            </Typography>
            {visiblePendingSigs.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {visiblePendingSigs.slice(0, 4).map((s) => (
                        <ItemRow key={s.runId}
                          label={isAdmin
                            ? projectAttentionLabel(s.projectId, s.jobNumber, undefined)
                            : `${s.jobNumber}: ${s.assetTag}`}
                          sub={`${pendingSignatureStageText(s.signatureStatus)} · Field work complete ${fmtDate(s.completedAt)}`}
                          actionLabel={pendingSignatureStageLabel(s.signatureStatus)}
                          {...(isPendingCustomerSignature(s.signatureStatus) && s.customerLinkSentAt
                            ? { customerLinkSentAt: s.customerLinkSentAt, projectTimeZoneId: s.projectTimeZoneId }
                            : {})}
                          onClick={() => openSignatureRepair(s)} />
                ))}
                {visiblePendingSigs.length > 4 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{visiblePendingSigs.length - 4} more
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="success.main">All signatures collected</Typography>
            )}
          </Box>
        </Grid>

        {/* High Observations */}
        <Grid item xs={6} sm={6} md={3}>
          <Box sx={{
            p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: highIssues.length > 0 ? "warning.dark" : "rgba(255,255,255,0.08)",
            background:  highIssues.length > 0 ? "rgba(249,168,37,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ReportOutlined sx={{ fontSize: 18, color: highIssues.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>High Observations</Typography>
            </Stack>
            <Typography variant="h5" fontWeight={700} color={highIssues.length > 0 ? "warning.main" : "text.secondary"}>
              {highIssues.length}
            </Typography>
            {highIssues.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {highIssues.slice(0, 4).map((iss) => (
                  <ItemRow key={iss.issueId}
                    label={isAdmin
                      ? projectAttentionLabel(iss.projectId, iss.jobNumber, undefined)
                      : `${iss.jobNumber}: ${iss.assetTag}`}
                    sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "..." : "")}
                    actionLabel="Review"
                    onClick={() => openIssueRepair(iss)} />
                ))}
                {highIssues.length > 4 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{highIssues.length - 4} more
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="success.main">No high-severity observations</Typography>
            )}
          </Box>
        </Grid>

      </Grid>
    </Box>
  );

  const RegionalSnapshotSection = (
    <Box className="glass-card" sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ fontFamily: "Sora" }}>
        Regional snapshot ({activeOffice})
      </Typography>
      <Grid container spacing={2}>
        {(activeOffice === "All" ? availableCountries : [activeOffice]).map((region) => {
          const rp = projects.filter((p) => {
            const c = countryForOffice(p.office);
            return c === region || p.office === region;
          });
          const rIds = new Set(globalOffices.filter((o) => o.country === region).map((o) => o.id));
          const rAssets = openAssets.filter((a) => {
            if (a.officeId) return rIds.has(a.officeId);
            const c = countryForOffice(a.office);
            return c === region || a.office === region;
          }).length;
          return (
            <Grid key={region} item xs={12} md={4}>
              <Box onClick={() => { updateActiveOffice(region); navigate("/projects"); }}
                sx={{
                  p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)", cursor: "pointer", transition: "all 0.2s",
                  "&:hover": { background: "rgba(45,212,191,0.1)", borderColor: "rgba(45,212,191,0.3)" },
                }}>
                <Typography variant="subtitle1" sx={{ fontFamily: "Sora" }}>{region}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {rp.length} projects - {rp.filter(p => p.status === "In Progress").length} in progress
                </Typography>
                <Typography variant="body2" color="text.secondary">{rAssets} active installations</Typography>
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );

  const ProjectStatusGrid = (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <TrendingUpOutlined sx={{ fontSize: 18, color: "primary.main" }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", flex: 1 }}>
          {isAdmin ? "Projects" : "Project Status"}
        </Typography>
        <Chip
          label={dashboardProjects.length}
          size="small"
          color="info"
          variant="outlined"
          sx={{ height: 20, fontSize: "0.7rem" }}
        />
        {isAdmin && projectsMissingPm.length > 0 && (
          <Chip
            label={`${projectsMissingPm.length} missing PM`}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ height: 20, fontSize: "0.7rem" }}
          />
        )}
        {canViewAllProjects && (
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select
              value={dashboardProjectScope}
              onChange={(e) => setDashboardProjectScope(e.target.value as DashboardProjectScope)}
              sx={{ fontSize: "0.75rem", height: 26 }}
            >
              <MenuItem value="mine"><em>My Projects</em></MenuItem>
              <MenuItem value="all">All Projects</MenuItem>
            </Select>
          </FormControl>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        {viewedDashboardUserId
          ? `${dashboardProjectScope === "mine" ? "My" : "All"} open projects and projects ready to close for ${viewingOwnDashboard ? "you" : viewedDashboardUser?.fullName ?? "this user"}`
          : isAdmin
            ? `${dashboardProjectScope === "mine" ? "Your" : "All"} open projects and projects ready to close in the current dashboard scope.`
            : `${dashboardProjectScope === "mine" ? "Your" : "All"} open projects and projects ready to close in the current dashboard scope.`}
      </Typography>

      {dashboardProjects.length === 0 ? (
        <Typography variant="caption" color="text.disabled">No assigned projects in this scope.</Typography>
      ) : (
        <Stack spacing={1.25}>
          {dashboardProjects.map((project) => {
            const { issueCount, noWorkflowCount, totalAssets, notStarted, inProgress, complete, completionPct } = getProjectCompletionMetrics(project);
            const readyToClose = isReadyToCloseProject(project, completionPct);
            const productNames = (project.productIds ?? [])
              .map((id) => productNameById.get(id) ?? id)
              .filter(Boolean)
              .join(", ");

            return (
              <Box
                key={project.id}
                sx={{
                  px: 2,
                  py: 1.25,
                  borderRadius: 2,
                  border: readyToClose ? "1px solid rgba(59,130,246,0.45)" : "1px solid rgba(255,255,255,0.08)",
                  background: readyToClose ? "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(16,185,129,0.08))" : "rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": {
                    background: readyToClose ? "linear-gradient(135deg, rgba(59,130,246,0.16), rgba(16,185,129,0.1))" : "rgba(45,212,191,0.06)",
                    borderColor: readyToClose ? "rgba(59,130,246,0.6)" : "rgba(45,212,191,0.25)",
                  },
                }}
                onClick={() => navigate(projectAssetsPath(project))}
              >
                <Stack spacing={0.7}>
                  <Stack direction={{ xs: "column", xl: "row" }} spacing={0.9} alignItems={{ xl: "center" }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {project.jobNumber}
                      </Typography>
                      <Chip
                        label={project.status}
                        size="small"
                        color={(statusColor[project.status] ?? "default") as "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"}
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.68rem" }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={700}
                        sx={{ textTransform: "uppercase", letterSpacing: 0.4 }}
                      >
                        {totalAssets} assets
                      </Typography>
                      {readyToClose && (
                        <Chip
                          label="Ready to Close"
                          size="small"
                          color="info"
                          sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }}
                        />
                      )}
                    </Stack>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                      {notStarted > 0 && <Chip size="small" label={`${notStarted} Not Started`} sx={{ height: 20, fontSize: "0.68rem" }} />}
                      {inProgress > 0 && <Chip size="small" label={`${inProgress} In Progress`} color="primary" sx={{ height: 20, fontSize: "0.68rem" }} />}
                      {complete > 0 && <Chip size="small" label={`${complete} Complete`} color="success" sx={{ height: 20, fontSize: "0.68rem" }} />}
                      {issueCount > 0 && <Chip size="small" label={`${issueCount} Issue`} color="error" sx={{ height: 20, fontSize: "0.68rem" }} />}
                      {noWorkflowCount > 0 && <Chip size="small" label={`${noWorkflowCount} No Workflow`} color="warning" variant="outlined" sx={{ height: 20, fontSize: "0.68rem" }} />}
                    </Stack>
                    <Box sx={{ flex: 1, minWidth: { xs: 120, xl: 180 } }}>
                      <LinearProgress
                        variant="determinate"
                        value={completionPct}
                        color={issueCount > 0 ? "error" : "success"}
                        sx={{ height: 6, borderRadius: 1 }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56, textAlign: { xl: "right" }, flexShrink: 0 }}>
                      {completionPct}%
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {[project.customerName, project.siteName, productNames || "No products linked"].filter(Boolean).join(" - ")}
                  </Typography>
                  {readyToClose && (
                    <Typography variant="caption" color="info.main">
                      {project.completedAtUtc
                        ? `Completed ${new Date(project.completedAtUtc).toLocaleString()}${project.completedBy ? ` by ${project.completedBy}` : ""}`
                        : "This project is complete and waiting for PM/Admin closure."}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" color={project.projectManager?.trim() ? "text.secondary" : "warning.main"} noWrap>
                      PM: {project.projectManager?.trim() || "No PM assigned"}
                    </Typography>
                    <Stack direction="row" spacing={1} useFlexGap>
                      {readyToClose && isManager && (
                        <Button
                          size="small"
                          variant="contained"
                          disabled={closingDashboardProjectId === project.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void closeProjectFromDashboard(project.id);
                          }}
                          sx={{ fontSize: "0.72rem", minHeight: 26 }}
                        >
                          {closingDashboardProjectId === project.id ? "Closing..." : "Mark as Closed"}
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<OpenInNewOutlined sx={{ fontSize: 13 }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(projectAssetsPath(project));
                        }}
                        sx={{ fontSize: "0.72rem", minHeight: 26 }}
                      >
                        Go to Project Assets
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );

  const AdminInspectionWorkspace = (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <AssessmentOutlined sx={{ color: "primary.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Inspections</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Inspection projects and open inspection assets across the current dashboard scope.
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Projects</Typography>
            <Typography variant="h5" fontWeight={700}>{inspectionScopeProjects.length}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Open Assets</Typography>
            <Typography variant="h5" fontWeight={700}>{inspectionScopeAssets.length}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary">In Progress</Typography>
            <Typography variant="h5" fontWeight={700}>{inspectionScopeAssets.filter((asset) => isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)).length}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Imports Waiting</Typography>
            <Typography variant="h5" fontWeight={700}>{inspectionImportsWaiting}</Typography>
          </Paper>
        </Grid>
      </Grid>

      {inspectionScopeProjects.length === 0 ? (
        <Typography variant="caption" color="text.disabled">No inspection projects in this scope.</Typography>
      ) : (
        <Grid container spacing={1.5}>
          {inspectionScopeProjects.slice(0, 8).map((project) => {
            const projectAssets = inspectionScopeAssets.filter((asset) => asset.projectId === project.id);
            const activeAssets = projectAssets.filter((asset) => isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)).length;
            return (
              <Grid item xs={12} sm={6} md={4} key={project.id}>
                <Paper elevation={0}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
                    transition: "all 0.15s", "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
                  <Stack spacing={0.75}>
                    <Typography variant="caption" fontWeight={700} noWrap display="block">
                      {project.jobNumber}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {project.customerName || "No customer"} - {project.status}
                    </Typography>
                    <Typography variant="caption" color={project.projectManager?.trim() ? "text.secondary" : "warning.main"} noWrap display="block">
                      PM: {project.projectManager?.trim() || "No PM assigned"}
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      <Chip label={`${projectAssets.length} open assets`} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} />
                      {activeAssets > 0 && <Chip label={`${activeAssets} in progress`} size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} />}
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );

  const AdminInstallWorkspace = (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <WorkOutlineOutlined sx={{ color: "primary.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Installs</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Open installation assets across the current dashboard scope with PM ownership.
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Paper elevation={0}
            onClick={() => setAdminInstallProjectsOpen(true)}
            sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
              transition: "all 0.15s", "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
            <Typography variant="caption" color="text.secondary">Projects</Typography>
            <Typography variant="h5" fontWeight={700}>{installProjectsWithOpenAssets.length}</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              {totalInstallAssetCount} total assets
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper elevation={0}
            onClick={() => setAdminInstallFilter("all")}
            sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
              transition: "all 0.15s",
              borderColor: adminInstallFilter === "all" ? "primary.main" : "var(--stroke)",
              background: adminInstallFilter === "all" ? "rgba(45,212,191,0.08)" : undefined,
              "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
            <Typography variant="caption" color="text.secondary">Open Assets</Typography>
            <Typography variant="h5" fontWeight={700}>{totalInstallAssetCount}</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Showing all live installs
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper elevation={0}
            onClick={() => setAdminInstallFilter("in-progress")}
            sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
              transition: "all 0.15s",
              borderColor: adminInstallFilter === "in-progress" ? "primary.main" : "var(--stroke)",
              background: adminInstallFilter === "in-progress" ? "rgba(45,212,191,0.08)" : undefined,
              "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
            <Typography variant="caption" color="text.secondary">In Progress</Typography>
            <Typography variant="h5" fontWeight={700}>{installScopeAssets.filter((asset) => isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)).length}</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Click to filter the list
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper elevation={0}
            onClick={() => setAdminInstallFilter("unassigned")}
            sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
              transition: "all 0.15s",
              borderColor: adminInstallFilter === "unassigned" ? "warning.main" : "var(--stroke)",
              background: adminInstallFilter === "unassigned" ? "rgba(237,108,2,0.08)" : undefined,
              "&:hover": { borderColor: "warning.main", background: "rgba(237,108,2,0.04)" } }}>
            <Typography variant="caption" color="text.secondary">Unassigned</Typography>
            <Typography variant="h5" fontWeight={700}>{installScopeAssets.filter((asset) => !asset.assignedUserId).length}</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Click to filter the list
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          {adminInstallFilter === "all"
            ? "Showing all open install assets"
            : adminInstallFilter === "in-progress"
              ? "Showing in-progress install assets"
              : "Showing unassigned install assets"}
        </Typography>
        {adminInstallFilter !== "all" && (
          <Button size="small" variant="text" onClick={() => setAdminInstallFilter("all")} sx={{ minWidth: 0, px: 0.5 }}>
            Clear filter
          </Button>
        )}
      </Stack>

      {filteredAdminInstallAssets.length === 0 ? (
        <Typography variant="caption" color="text.disabled">No installation assets in this scope.</Typography>
      ) : (
        <Grid container spacing={1.5}>
          {filteredAdminInstallAssets.slice(0, 8).map((asset) => (
            <Grid item xs={12} sm={6} md={4} key={asset.id}>
              <Paper elevation={0}
                onClick={() => navigate("/installations/assets")}
                sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
                  transition: "all 0.15s", "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
                <Stack spacing={0.75}>
                  <Typography variant="caption" fontWeight={700} noWrap display="block">
                    {asset.assetTag || asset.assetName || asset.id}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap display="block">
                    {asset.jobNumber} - {dashboardStatusChip(asset).label}
                  </Typography>
                  <Typography variant="caption" color={projectPmLabel(asset.projectId) === "No PM assigned" ? "warning.main" : "text.secondary"} noWrap display="block">
                    PM: {projectPmLabel(asset.projectId)}
                  </Typography>
                  <Chip
                    label={asset.assignedUserId ? "Assigned" : "Unassigned"}
                    size="small"
                    color={asset.assignedUserId ? "default" : "warning"}
                    variant="outlined"
                    sx={{ alignSelf: "flex-start", height: 18, fontSize: "0.62rem" }}
                  />
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
      {filteredAdminInstallAssets.length > 8 && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: "block" }}>
          +{filteredAdminInstallAssets.length - 8} more assets - <Box component="span" sx={{ cursor: "pointer", color: "primary.main" }} onClick={() => navigate("/installations/assets")}>view all</Box>
        </Typography>
      )}

      <Dialog open={adminInstallProjectsOpen} onClose={() => setAdminInstallProjectsOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Install Projects</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Open install projects in the current dashboard scope. Filter by PM name or project number.
            </Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} md={6}>
                <TextField
                  size="small"
                  fullWidth
                  label="Filter by PM"
                  value={adminInstallPmFilter}
                  onChange={(e) => setAdminInstallPmFilter(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  size="small"
                  fullWidth
                  label="Filter by Project Number"
                  value={adminInstallProjectFilter}
                  onChange={(e) => setAdminInstallProjectFilter(e.target.value)}
                />
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={`${filteredAdminInstallProjects.length} open projects`} size="small" color="info" variant="outlined" />
              <Chip label={`${totalInstallAssetCount} total assets`} size="small" variant="outlined" />
              {(adminInstallPmFilter || adminInstallProjectFilter) && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    setAdminInstallPmFilter("");
                    setAdminInstallProjectFilter("");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Stack>
            {filteredAdminInstallProjects.length === 0 ? (
              <Typography variant="caption" color="text.disabled">No install projects match the current filters.</Typography>
            ) : (
              <Stack spacing={1}>
                {filteredAdminInstallProjects.map((project) => {
                  const projectAssets = installScopeAssets.filter((asset) => asset.projectId === project.id);
                  return (
                    <Paper key={project.id} elevation={0}
                      onClick={() => {
                        setAdminInstallProjectsOpen(false);
                        navigate(`/projects/${project.id}`);
                      }}
                      sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
                        transition: "all 0.15s", "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
                      <Stack spacing={0.75}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="subtitle2" fontWeight={700}>{project.jobNumber}</Typography>
                          <Chip label={project.status} size="small" variant="outlined" sx={{ height: 20, fontSize: "0.68rem" }} />
                          <Chip label={`${projectAssets.length} open assets`} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.68rem" }} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {project.customerName || "No customer"}
                        </Typography>
                        <Typography variant="caption" color={project.projectManager?.trim() ? "text.secondary" : "warning.main"} noWrap display="block">
                          PM: {project.projectManager?.trim() || "No PM assigned"}
                        </Typography>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );

  const EvidenceHealthGrid = (
    <Box ref={analyticsSectionCallbackRef}>
    <Grid container spacing={2}>

      {/* Phase 4: Evidence Completeness */}
      <Grid item xs={12} md={6}>
        <Box className="glass-card" sx={{ p: 2.5, height: "100%" }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <FactCheckOutlined sx={{ fontSize: 18, color: "primary.main" }} />
            <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", flex: 1 }}>Evidence Completeness</Typography>
            <Select size="small" value={evidenceWindow} onChange={(e) => setEvidenceWindow(Number(e.target.value))}
              sx={{ fontSize: "0.75rem", height: 28 }}>
              {WINDOW_OPTIONS.map((d) => <MenuItem key={d} value={d}>{d}d</MenuItem>)}
            </Select>
          </Stack>

          {evidenceLoading ? <LinearProgress /> : evidenceData ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={3} alignItems="center">
                <GaugeCircle value={evidenceData.overallScore} size={90} />
                <Stack spacing={1} sx={{ flex: 1 }}>
                  {[
                    { label: "Signed",         pct: evidenceData.signedPct,           n: evidenceData.signed },
                    { label: "Steps Complete", pct: evidenceData.allStepsCompletePct, n: evidenceData.allStepsComplete },
                    { label: "Has Media",      pct: evidenceData.hasMediaPct,         n: evidenceData.hasMedia },
                    { label: "No Open Issues", pct: evidenceData.noOpenIssuesPct,     n: evidenceData.noOpenIssues },
                  ].map(({ label, pct, n }) => (
                    <Stack key={label} direction="row" alignItems="center" spacing={1}>
                      <Typography variant="caption" sx={{ minWidth: 100 }}>{label}</Typography>
                      <Box sx={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <Box sx={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: pct >= 80 ? "#2e7d32" : pct >= 60 ? "#ed6c02" : "#d32f2f" }} />
                      </Box>
                      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 36, textAlign: "right" }}>{pct}%</Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ minWidth: 28 }}>({n})</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
              {evidenceData.byProject.filter(p => p.score < 70).length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Projects below 70%</Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {evidenceData.byProject.filter(p => p.score < 70).slice(0, 4).map((p) => (
                      <Stack key={p.projectId} direction="row" alignItems="center" spacing={1}
                        onClick={() => navigate(`/projects/${p.projectId}`)}
                        sx={{ cursor: "pointer", px: 1, py: 0.25, borderRadius: 1, "&:hover": { background: "rgba(255,255,255,0.05)" } }}>
                        <Typography variant="caption" sx={{ flex: 1 }} noWrap>{p.jobNumber}</Typography>
                        <Chip label={`${p.score}%`} size="small"
                          color={p.score < 50 ? "error" : "warning"} variant="outlined"
                          sx={{ height: 16, fontSize: "0.6rem" }} />
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}
              <Typography variant="caption" color="text.disabled">{evidenceData.totalRuns} completed runs in last {evidenceWindow} days</Typography>
            </Stack>
          ) : (
            <Typography variant="caption" color={evidenceError ? "error.main" : "text.disabled"}>
              {evidenceError
                ? "Couldn't load evidence completeness. Check your connection and retry."
                : "No data available for selected window."}
            </Typography>
          )}
        </Box>
      </Grid>

      {/* Phase 5: Workflow Health Score */}
      <Grid item xs={12} md={6}>
        <Box className="glass-card" sx={{ p: 2.5, height: "100%" }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <AssessmentOutlined sx={{ fontSize: 18, color: "primary.main" }} />
            <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", flex: 1 }}>Workflow Health</Typography>
            <Select size="small" value={healthWindow} onChange={(e) => setHealthWindow(Number(e.target.value))}
              sx={{ fontSize: "0.75rem", height: 28 }}>
              {WINDOW_OPTIONS.map((d) => <MenuItem key={d} value={d}>{d}d</MenuItem>)}
            </Select>
          </Stack>

          {healthLoading ? <LinearProgress /> : healthData ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={3} alignItems="center">
                <Box sx={{ position: "relative" }}>
                  <GaugeCircle value={healthData.overallScore} size={90}
                    color={healthData.overallScore >= 80 ? "#2e7d32" : healthData.overallScore >= 60 ? "#ed6c02" : "#d32f2f"} />
                  <Tooltip title={`vs previous ${healthWindow}d: ${healthData.scoreDelta > 0 ? "+" : ""}${healthData.scoreDelta}%`}>
                    <Box sx={{ position: "absolute", bottom: -4, right: -4 }}>
                      {healthData.scoreDelta > 0
                        ? <TrendingUpOutlined sx={{ fontSize: 16, color: "success.main" }} />
                        : healthData.scoreDelta < 0
                        ? <TrendingDownOutlined sx={{ fontSize: 16, color: "error.main" }} />
                        : <TrendingFlatOutlined sx={{ fontSize: 16, color: "text.disabled" }} />}
                    </Box>
                  </Tooltip>
                </Box>
                <Stack spacing={1} sx={{ flex: 1 }}>
                  {[
                    { label: "Completion",       pct: healthData.completionRate },
                    { label: "1st-Run Success",  pct: healthData.firstRunSuccessRate },
                    { label: "Step Pass Rate",   pct: healthData.stepPassRate },
                    { label: "Clean Closure",    pct: healthData.cleanClosureRate },
                  ].map(({ label, pct }) => (
                    <Stack key={label} direction="row" alignItems="center" spacing={1}>
                      <Typography variant="caption" sx={{ minWidth: 108 }}>{label}</Typography>
                      <Box sx={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <Box sx={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: pct >= 80 ? "#2e7d32" : pct >= 60 ? "#ed6c02" : "#d32f2f" }} />
                      </Box>
                      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 36, textAlign: "right" }}>{pct}%</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
              {healthData.byType.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>By workflow type</Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
                    {healthData.byType.map((t) => (
                      <Chip key={t.typeName}
                        label={`${t.typeName}: ${t.score}%`} size="small"
                        color={t.score >= 80 ? "success" : t.score >= 60 ? "warning" : "error"}
                        variant="outlined" sx={{ height: 20, fontSize: "0.68rem" }} />
                    ))}
                  </Stack>
                </Box>
              )}
              <Typography variant="caption" color="text.disabled">{healthData.totalRuns} runs in last {healthWindow} days - prev score {healthData.previousScore}%</Typography>
            </Stack>
          ) : (
            <Typography variant="caption" color={healthError ? "error.main" : "text.disabled"}>
              {healthError
                ? "Couldn't load workflow health. Check your connection and retry."
                : "No data available for selected window."}
            </Typography>
          )}
        </Box>
      </Grid>
    </Grid>
    </Box>
  );

  const WorkloadPanel = (
    <Box className="glass-card" sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Technician Workload</Typography>
          <Typography variant="caption" color="text.secondary">Click a card to expand · report icon for detail print/download</Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Tooltip title="Workflow run is currently active and in progress" arrow>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: "help" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "success.main" }} />
              <Typography variant="caption" color="text.secondary">Active</Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="Workflow run is currently paused" arrow>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: "help" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "warning.main" }} />
              <Typography variant="caption" color="text.secondary">Paused</Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="No workflow run has been started yet" arrow>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: "help" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">Queued</Typography>
            </Stack>
          </Tooltip>
          <Tooltip title="Asset is assigned and acknowledged but the workflow hasn't started" arrow>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: "help" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "info.main", opacity: 0.7 }} />
              <Typography variant="caption" color="text.secondary">Pending</Typography>
            </Stack>
          </Tooltip>
          {scopedWorkload.length > 0 && (
            <Tooltip title="Print / download full workload report">
              <IconButton size="small" onClick={() => setWorkloadReportAllOpen(true)} sx={{ color: "text.secondary" }}>
                <PrintOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
      {workloadLoading && !cacheHydrated ? <LinearProgress /> : scopedWorkload.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No open assets currently assigned to technicians in this scope.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {scopedWorkload.map((w) => {
            const isExpanded = expandedWorkloadId === w.userId;
            const inPct     = w.totalAssigned > 0 ? (w.inProgress / w.totalAssigned) * 100 : 0;
            const pausedPct = w.totalAssigned > 0 ? (w.paused   / w.totalAssigned) * 100 : 0;
            const notPct    = w.totalAssigned > 0 ? (w.notStarted / w.totalAssigned) * 100 : 0;
            const stepPct   = w.totalSteps > 0 ? Math.min(100, (w.completedSteps / w.totalSteps) * 100) : 0;
            const load      = w.totalAssigned >= 10 ? "error" : w.totalAssigned >= 5 ? "warning" : "success";
            const loadLabel = w.totalAssigned >= 10 ? "Heavy" : w.totalAssigned >= 5 ? "Moderate" : "Light";
            const barColor  = w.hasIssues ? "warning.main" : "primary.main";
            const startLabel = w.startedAt
              ? new Date(w.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : null;
            const techAssets = openAssets.filter((a) => a.assignedUserId === w.userId);
            return (
              <Paper key={w.userId} elevation={0}
                onClick={() => setExpandedWorkloadId(isExpanded ? null : w.userId)}
                sx={{
                  p: 1.5, border: "1px solid",
                  borderColor: isExpanded ? "primary.main" : w.hasIssues ? "warning.dark" : "var(--stroke)",
                  borderRadius: 1.5, cursor: "pointer", transition: "all 0.15s",
                  background: isExpanded ? "rgba(45,212,191,0.04)" : undefined,
                  "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
                }}>
                <Stack spacing={0.5}>
                  {/* ── Summary row ── */}
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{ flex: "0 0 160px", minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="body2" fontWeight={600} noWrap>{w.fullName}</Typography>
                        <Chip label={loadLabel} size="small" color={load} variant="outlined" sx={{ height: 16, fontSize: "0.6rem", flexShrink: 0 }} />
                        {w.hasIssues && <Chip label="Issues" size="small" color="warning" sx={{ height: 16, fontSize: "0.6rem", flexShrink: 0 }} />}
                      </Stack>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Tooltip title={
                        w.totalSteps > 0
                          ? `${w.completedSteps}/${w.totalSteps} steps · ${w.inProgress} active · ${w.paused} paused · ${w.notStarted} queued`
                          : `${w.inProgress} active · ${w.paused} paused · ${w.notStarted} queued`
                      } arrow>
                        <Box sx={{ position: "relative", height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "flex" }}>
                          {w.totalSteps > 0 ? (
                            <Box sx={{ width: `${stepPct}%`, bgcolor: barColor, transition: "width 0.4s" }} />
                          ) : (
                            <>
                              {inPct > 0 && <Box sx={{ width: `${inPct}%`, bgcolor: "success.main", transition: "width 0.4s" }} />}
                              {pausedPct > 0 && <Box sx={{ width: `${pausedPct}%`, bgcolor: "warning.main", transition: "width 0.4s" }} />}
                              {notPct > 0 && <Box sx={{ width: `${notPct}%`, bgcolor: "text.secondary", transition: "width 0.4s" }} />}
                            </>
                          )}
                        </Box>
                      </Tooltip>
                      {w.totalSteps > 0 && (
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                          {w.completedSteps}/{w.totalSteps} steps
                        </Typography>
                      )}
                    </Box>
                    <Chip label={w.totalAssigned} size="small" color={load} sx={{ fontWeight: 700, minWidth: 40 }} />
                    <Tooltip title="View detail / print / download report">
                      <span>
                        <IconButton size="small"
                          onClick={(e) => { e.stopPropagation(); setWorkloadReportTarget(w as ScopedWorkloadItem); }}
                          sx={{ color: "text.secondary", flexShrink: 0 }}>
                          <AssessmentOutlined sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <IconButton size="small" sx={{ color: "text.secondary", flexShrink: 0 }}
                      onClick={(e) => { e.stopPropagation(); setExpandedWorkloadId(isExpanded ? null : w.userId); }}>
                      {isExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
                    </IconButton>
                  </Stack>

                  {/* ── Status counts row ── */}
                  <Stack direction="row" spacing={0} alignItems="center" flexWrap="nowrap">
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {w.inProgress} active ·{" "}
                      <Tooltip title="Workflow run is currently paused" arrow>
                        <span style={{ cursor: "help", textDecoration: "underline dotted" }}>{w.paused} paused</span>
                      </Tooltip>
                      {" · "}
                      <Tooltip title="No workflow run has been started yet" arrow>
                        <span style={{ cursor: "help", textDecoration: "underline dotted" }}>{w.notStarted} queued</span>
                      </Tooltip>
                      {startLabel && <span style={{ opacity: 0.5 }}>{" · since "}{startLabel}</span>}
                    </Typography>
                  </Stack>

                  {/* ── Project chips ── */}
                  {w.projectBreakdown.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {w.projectBreakdown.map((pb) => (
                        <Tooltip key={pb.projectId} title={`${pb.inProgress} active · ${pb.paused} paused · ${pb.notStarted} queued`} arrow>
                          <Chip
                            label={`${pb.jobNumber}: ${pb.total}`}
                            size="small" variant="outlined"
                            color={pb.inProgress > 0 ? "primary" : pb.paused > 0 ? "warning" : "default"}
                            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${pb.projectId}`); }}
                            sx={{ height: 16, fontSize: "0.6rem", cursor: "pointer" }}
                          />
                        </Tooltip>
                      ))}
                    </Stack>
                  )}

                  {/* ── Expanded chevron detail ── */}
                  <Collapse in={isExpanded} unmountOnExit>
                    <Box sx={{ mt: 1, pt: 1, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      {w.projectBreakdown.map((pb) => {
                        const pbAssets = techAssets.filter((a) => a.projectId === pb.projectId);
                        const proj = projectById.get(pb.projectId);
                        return (
                          <Box key={pb.projectId} sx={{ mb: 1.5 }}>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                              <Typography variant="caption" fontWeight={700} color="primary.main">
                                {pb.jobNumber}
                              </Typography>
                              {proj?.customerName && (
                                <Typography variant="caption" color="text.secondary" noWrap>— {proj.customerName}</Typography>
                              )}
                              {proj?.projectManager && (
                                <Chip label={`PM: ${proj.projectManager}`} size="small" variant="outlined"
                                  sx={{ height: 16, fontSize: "0.58rem", ml: "auto" }} />
                              )}
                            </Stack>
                            <Stack spacing={0.4}>
                              {pbAssets.map((a) => {
                                const state = isPausedAsset(a.runStatus) ? "Paused"
                                  : isInProgressAsset(a.runStatus) || isInProgressAsset(a.status) ? "In Progress"
                                  : isNotStartedAsset(a.status) ? "Not Started" : a.status;
                                const stateColor = state === "In Progress" ? "primary" : state === "Paused" ? "warning" : "default";
                                return (
                                  <Stack key={a.id} direction="row" alignItems="center" spacing={1}
                                    sx={{ px: 1, py: 0.25, borderRadius: 1, background: "rgba(255,255,255,0.03)" }}>
                                    <Typography variant="caption" fontWeight={600} noWrap sx={{ flex: "0 0 100px", fontSize: "0.68rem" }}>
                                      {a.assetTag || a.assetName || a.id}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, fontSize: "0.65rem" }}>
                                      {a.assetName || a.assetModel || ""}
                                    </Typography>
                                    {a.totalSteps > 0 && (
                                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.62rem", flexShrink: 0 }}>
                                        {a.completedSteps}/{a.totalSteps} steps
                                      </Typography>
                                    )}
                                    <Chip label={state} size="small" color={stateColor as "primary"|"warning"|"default"} variant="outlined"
                                      sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }} />
                                  </Stack>
                                );
                              })}
                              {pbAssets.length === 0 && (
                                <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>No open assets</Typography>
                              )}
                            </Stack>
                          </Box>
                        );
                      })}
                    </Box>
                  </Collapse>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );

  const InspectionInboxSection = showInspectionInbox ? (
    <Box className="glass-card" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <AssignmentLateOutlined sx={{ fontSize: 18, color: "info.main" }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
          Inspection Inbox
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.25 }}>
        Open inspection runs and JSON imports across projects in your current dashboard scope.
      </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap">
        {inspectionRunsDue > 0 && (
          <Chip
            label={inspectionRunsDue + (inspectionRunsDue === 1 ? " run" : " runs") + " due / in progress"}
            size="small"
            color="info"
            variant="outlined"
            onClick={() => navigate("/installations/assets?workflowType=Inspection")}
            sx={{ cursor: "pointer" }}
          />
        )}
        {inspectionImportsWaiting > 0 && (
          <Chip
            label={inspectionImportsWaiting + (inspectionImportsWaiting === 1 ? " import" : " imports") + " need assignment"}
            size="small"
            color="warning"
            variant="outlined"
          />
        )}
        {inspectionImportsFailed > 0 && (
          <Chip
            label={inspectionImportsFailed + (inspectionImportsFailed === 1 ? " import" : " imports") + " failed"}
            size="small"
            color="error"
            variant="outlined"
          />
        )}
      </Stack>
    </Box>
  ) : null;

  const ManagerMobileHome = (
    <Stack spacing={2}>
      <Box className="glass-card" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h6" sx={{ fontFamily: "Sora", lineHeight: 1.1 }}>{user.fullName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {user.role} · {activeOffice === "All" ? "All offices" : activeOffice}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Paper className="glass-card" sx={{ flex: 1, minWidth: 0, p: 1 }}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: "0.62rem" }}>{canViewAllProjects ? "All Projects" : "My Projects"}</Typography>
              <Typography variant="h6" fontWeight={700}>{managedProjects.length}</Typography>
            </Paper>
            <Paper className="glass-card" sx={{ flex: 1, minWidth: 0, p: 1 }}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: "0.62rem" }}>Overdue</Typography>
              <Typography variant="h6" fontWeight={700} color={managedOverdueProjects.length > 0 ? "error.main" : "inherit"}>{managedOverdueProjects.length}</Typography>
            </Paper>
            <Paper className="glass-card" sx={{ flex: 1, minWidth: 0, p: 1 }}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: "0.62rem" }}>Inspections</Typography>
              <Typography variant="h6" fontWeight={700}>{managedInspectionProjects.length}</Typography>
            </Paper>
            <Paper className="glass-card" sx={{ flex: 1, minWidth: 0, p: 1 }}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: "0.62rem" }}>Open Installs</Typography>
              <Typography variant="h6" fontWeight={700}>{managedOpenAssets.length}</Typography>
            </Paper>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.5 }}>
            <Tooltip title="Workflow run is currently active" arrow>
              <Chip icon={<PlayArrowOutlined sx={{ fontSize: 13 }} />}
                label={`${overviewActiveCount} active`} size="small"
                color={overviewActiveCount > 0 ? "primary" : "default"} variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }} />
            </Tooltip>
            <Tooltip title="Workflow run is currently paused" arrow>
              <Chip label={`${overviewPausedCount} paused`} size="small"
                color={overviewPausedCount > 0 ? "warning" : "default"} variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }} />
            </Tooltip>
            <Tooltip title="Assigned, no workflow run started yet" arrow>
              <Chip label={`${overviewQueuedCount} queued`} size="small"
                color="default" variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }} />
            </Tooltip>
            {overviewPendingCount > 0 && (
              <Tooltip title="Asset acknowledged but workflow hasn't started" arrow>
                <Chip label={`${overviewPendingCount} pending`} size="small"
                  color="info" variant="outlined"
                  sx={{ height: 22, fontSize: "0.7rem" }} />
              </Tooltip>
            )}
          </Stack>
          {isAdmin && dashboardUsers.length > 0 && (
            <Box>
              {!viewingOwnDashboard && viewedDashboardUser && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, p: 0.75, borderRadius: 1, background: "rgba(2,136,209,0.1)", border: "1px solid rgba(2,136,209,0.3)" }}>
                  <SwitchAccountOutlined sx={{ fontSize: 14, color: "info.main", flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ flex: 1, color: "info.main", fontSize: "0.7rem" }}>
                    Viewing {viewedDashboardUser.fullName} ({viewedDashboardUser.role})
                  </Typography>
                  <IconButton size="small" onClick={() => setSelectedDashboardId(user.id)} sx={{ p: 0.25 }}>
                    <CloseOutlined sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              )}
              <FormControl size="small" fullWidth>
                <InputLabel shrink sx={{ fontSize: "0.75rem" }}>View as</InputLabel>
                <Select
                  label="View as"
                  value={selectedDashboardId === ALL_DASHBOARDS_VALUE ? user.id : selectedDashboardId}
                  onChange={(e) => setSelectedDashboardId(e.target.value)}
                  sx={{ fontSize: "0.75rem" }}
                >
                  <MenuItem value={user.id}><em>My Dashboard</em></MenuItem>
                  {dashboardUsers.map((u) => (
                    <MenuItem key={u.id} value={u.id} sx={{ fontSize: "0.8rem" }}>{u.fullName} ({u.role})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </Stack>
      </Box>

      <Stack direction="row" spacing={1}>
        {([
          { key: "projects" as const, label: "My Projects" },
          { key: "inspections" as const, label: "My Inspections" },
          { key: "installs" as const, label: "My Installs" },
        ]).map((tab) => (
          <Chip
            key={tab.key}
            label={tab.label}
            clickable
            color={mobileManagerTab === tab.key ? "primary" : "default"}
            variant={mobileManagerTab === tab.key ? "filled" : "outlined"}
            onClick={() => setMobileManagerTab(tab.key)}
            sx={{ flex: 1, height: 34 }}
          />
        ))}
      </Stack>

      {mobileManagerTab === "projects" && (
        <>
          {NeedsAttentionSection}

          {pendingApprovals.length > 0 && (
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "warning.dark", background: "rgba(230,119,0,0.07)" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <AssignmentLateOutlined sx={{ fontSize: 18, color: "warning.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>Pending Approvals</Typography>
                <Chip label={pendingApprovals.length} size="small" color="warning" variant="outlined"
                  sx={{ height: 20, fontSize: "0.7rem" }} />
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Projects waiting for your approval
              </Typography>
              <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }} flexWrap="nowrap">
                {pendingApprovals.map((p) => (
                  <Chip key={p.id}
                    label={p.jobNumber || p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    color="warning" variant="outlined"
                    sx={{ flexShrink: 0, cursor: "pointer" }} />
                ))}
              </Stack>
            </Box>
          )}

          {autoAssignFlags.length > 0 && (
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "info.dark", background: "rgba(2,136,209,0.07)" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <PersonOutlined sx={{ fontSize: 18, color: "info.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>New Auto-assignments</Typography>
                <Chip label={autoAssignFlags.length} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                <Button size="small" variant="text" color="info" sx={{ fontSize: "0.72rem" }}
                  onClick={() => {
                    localStorage.removeItem("pm_auto_assign_flags");
                    setAutoAssignFlags([]);
                  }}>
                  Dismiss all
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Assets auto-assigned when an installer started a workflow
              </Typography>
              <Stack spacing={0.25}>
                {autoAssignFlags.map((f) => (
                  <Stack key={f.id} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <ItemRow
                        label={`${f.jobNumber ? f.jobNumber + ": " : ""}${f.assetTag}`}
                        sub={`Assigned by ${f.assignedBy} · ${fmtDate(f.assignedAt)}`}
                        onClick={() => navigate("/installations/assets")}
                      />
                    </Box>
                    <Button size="small" variant="text" color="inherit"
                      sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => {
                        const updated = autoAssignFlags.filter((x) => x.id !== f.id);
                        localStorage.setItem("pm_auto_assign_flags", JSON.stringify(updated));
                        setAutoAssignFlags(updated);
                      }}>
                      ×
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          <Box className="glass-card" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: canViewAllProjects ? 1 : 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora" }}>Projects</Typography>
              <Button size="small" variant="text" onClick={() => navigate("/projects")}>View all</Button>
            </Stack>
            {canViewAllProjects && (
              <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }}>
                <Chip label="My Projects" clickable size="small"
                  color={dashboardProjectScope === "mine" ? "primary" : "default"}
                  variant={dashboardProjectScope === "mine" ? "filled" : "outlined"}
                  onClick={() => setDashboardProjectScope("mine")}
                  sx={{ height: 26, fontSize: "0.72rem" }} />
                <Chip label="All Projects" clickable size="small"
                  color={dashboardProjectScope === "all" ? "primary" : "default"}
                  variant={dashboardProjectScope === "all" ? "filled" : "outlined"}
                  onClick={() => setDashboardProjectScope("all")}
                  sx={{ height: 26, fontSize: "0.72rem" }} />
              </Stack>
            )}
            {dashboardProjects.length === 0
              ? <Typography variant="caption" color="text.secondary">No projects in scope.</Typography>
              : <Stack spacing={1}>
                  {dashboardProjects.slice(0, 6).map((project) => {
                    const { issueCount, totalAssets, complete, completionPct } = getProjectCompletionMetrics(project);

                    return (
                      <Paper key={project.id} elevation={0} onClick={() => navigate(projectAssetsPath(project))}
                        sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
                              "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography variant="body2" fontWeight={700} noWrap sx={{ flex: 1 }}>
                            {project.jobNumber}
                          </Typography>
                          <Chip
                            label={workflowModeLabel(project.workflowMode)}
                            color={workflowModeChipColor(project.workflowMode)}
                            size="small"
                            variant="outlined"
                            sx={{ height: 22, fontSize: 11 }}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ mb: 1 }}>
                          {project.customerName || "No customer"} · {project.status}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                            {totalAssets} assets
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                            {complete} done
                          </Typography>
                          <Box sx={{ flex: 1, minWidth: 80 }}>
                            <LinearProgress
                              variant="determinate"
                              value={completionPct}
                              color={issueCount > 0 ? "error" : "success"}
                              sx={{ height: 6, borderRadius: 1 }}
                            />
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 34, textAlign: "right", flexShrink: 0 }}>
                            {completionPct}%
                          </Typography>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
            }
          </Box>

          {InspectionInboxSection}
          {EvidenceHealthGrid}
          {WorkloadPanel}
        </>
      )}

      {mobileManagerTab === "inspections" && (
        <>
          <Box className="glass-card" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora" }}>My Inspections</Typography>
              <Button size="small" variant="text" onClick={() => navigate("/projects")}>View all</Button>
            </Stack>
            {managedInspectionProjects.length === 0
              ? <Typography variant="caption" color="text.secondary">No inspection projects in scope.</Typography>
              : <Stack spacing={1}>
                  {managedInspectionProjects.slice(0, 6).map((project) => (
                    <Paper key={project.id} elevation={0} onClick={() => navigate(`/projects/${project.id}`)}
                      sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
                            "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
                      <Typography variant="body2" fontWeight={700} noWrap>{project.jobNumber}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {project.customerName || "No customer"} · {project.workflowMode ?? "Inspection"}
                      </Typography>
                    </Paper>
                  ))}
                </Stack>
            }
          </Box>

          {InspectionInboxSection}
        </>
      )}

      {mobileManagerTab === "installs" && (
        <>
          <Box className="glass-card" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora" }}>My Installs</Typography>
              <Button size="small" variant="text" onClick={() => navigate("/installations/assets")}>View all</Button>
            </Stack>
            {managedOpenAssets.length === 0
              ? <Typography variant="caption" color="text.secondary">No installation assets in scope.</Typography>
              : <Stack spacing={1}>
                  {managedOpenAssets.slice(0, 6).map((asset) => (
                    <Paper key={asset.id} elevation={0} onClick={() => navigate("/installations/assets")}
                      sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
                            "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={700} noWrap>{asset.assetTag || asset.assetName || asset.id}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {asset.jobNumber} · {asset.assignedUserId ? "Assigned" : "Unassigned"}
                          </Typography>
                        </Box>
                        <Chip
                          label={dashboardStatusChip(asset).label}
                          size="small"
                          color={dashboardStatusChip(asset).color}
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.62rem" }}
                        />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
            }
          </Box>

          {WorkloadPanel}
          {EvidenceHealthGrid}
        </>
      )}
    </Stack>
  );

  return (
    <Stack spacing={3}>

      {showNativeManagerHome && ManagerMobileHome}

      {/* PERSONAL WORKSPACE STRIP - all except Viewer */}
      {!isViewer && !showNativeManagerHome && (
        <Box className="glass-card" sx={{ p: 2.5 }}>
          {isManager && !viewingOwnDashboard && viewedDashboardUser && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, p: 1, borderRadius: 1, background: "rgba(2,136,209,0.1)", border: "1px solid rgba(2,136,209,0.3)" }}>
              <SwitchAccountOutlined sx={{ fontSize: 16, color: "info.main", flexShrink: 0 }} />
              <Typography variant="caption" sx={{ flex: 1, color: "info.main" }}>
                Viewing {viewedDashboardUser.fullName} ({viewedDashboardUser.role}) dashboard - read only
              </Typography>
              <IconButton size="small" onClick={() => setSelectedDashboardId(user.id)}>
                <CloseOutlined fontSize="small" />
              </IconButton>
            </Box>
          )}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <PersonOutlined sx={{ color: showAdminOverviewStrip ? "info.main" : viewingOwnDashboard ? "primary.main" : "info.main", fontSize: 20 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", lineHeight: 1.2 }}>
                {showAdminOverviewStrip ? "Admin Oversight" : viewingOwnDashboard ? user.fullName : viewedDashboardUser?.fullName ?? user.fullName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {showAdminOverviewStrip
                  ? "Active projects and assets in the current dashboard scope"
                  : viewingOwnDashboard ? user.role : viewedDashboardUser?.role ?? ""}
              </Typography>
            </Box>
            {isManager && (dashboardUsers.length > 0 || selectedDashboardId !== user.id) && (
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel shrink>View as</InputLabel>
                <Select
                  label="View as"
                  value={selectedDashboardId}
                  onChange={(e) => setSelectedDashboardId(e.target.value)}
                >
                  {isAdmin && <MenuItem value={ALL_DASHBOARDS_VALUE}><em>All Dashboards</em></MenuItem>}
                  <MenuItem value={user.id}><em>My Dashboard</em></MenuItem>
                  {dashboardUsers.map((u) => (
                    <MenuItem key={u.id} value={u.id}>{u.fullName} ({u.role})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <Stack direction="row" spacing={0.75}>
              <Chip icon={<WorkOutlineOutlined sx={{ fontSize: 13 }} />}
                label={`${overviewActiveCount} active`} size="small"
                color={overviewActiveCount > 0 ? "primary" : "default"} variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }} />
              <Tooltip title="Workflow run is currently paused" arrow>
                <Chip label={`${overviewPausedCount} paused`} size="small"
                  color={overviewPausedCount > 0 ? "warning" : "default"} variant="outlined"
                  sx={{ height: 22, fontSize: "0.7rem", cursor: "help" }} />
              </Tooltip>
              <Tooltip title="No workflow run has been started yet" arrow>
                <Chip label={`${overviewQueuedCount} queued`} size="small"
                  color="default" variant="outlined" sx={{ height: 22, fontSize: "0.7rem", cursor: "help" }} />
              </Tooltip>
              {overviewPendingCount > 0 && (
                <Tooltip title="Asset is assigned and acknowledged but the workflow hasn't started" arrow>
                  <Chip label={`${overviewPendingCount} pending`} size="small"
                    color="info" variant="outlined" sx={{ height: 22, fontSize: "0.7rem", cursor: "help" }} />
                </Tooltip>
              )}
              {overviewBlockingCount > 0 && (
                <Chip icon={<ErrorOutlineOutlined sx={{ fontSize: 13 }} />}
                  label={`${overviewBlockingCount} blocking`} size="small"
                  color="error" variant="outlined" sx={{ height: 22, fontSize: "0.7rem" }} />
              )}
            </Stack>
          </Stack>
        </Box>
      )}
      {/* UNIVERSAL TAB BAR (all non-viewer users) */}
      {showTabBar && (
        <Box className="glass-card" sx={{ p: 1.5 }}>
          <Tabs value={pmDashboardTab} onChange={(_, v: PmDashboardTab) => handleDashboardTabChange(v)}
            sx={{ minHeight: 36 }}>
            {showPmProjectsTab && (
              <Tab
                value="pm-projects"
                label={renderDashboardTabLabel(isAdmin ? "Projects" : "My PM Projects", projectTabSignal)}
                sx={getDashboardTabSx()}
              />
            )}
            {hasInspectionsTab && (
              <Tab
                value="my-inspections"
                label={renderDashboardTabLabel(isAdmin ? "Inspections" : "My Inspections", inspectionTabSignal)}
                sx={getDashboardTabSx()}
              />
            )}
            <Tab
              value="my-installs"
              label={renderDashboardTabLabel(isAdmin ? "Installs" : "My Installs", installTabSignal)}
              sx={getDashboardTabSx()}
            />
          </Tabs>
        </Box>
      )}

      {/* My Inspections tab content - non-manager users */}
      {showTabBar && !isManager && pmDashboardTab === "my-inspections" && MyInspectionAttentionSection}
      {showTabBar && !isManager && pmDashboardTab === "my-inspections" && MyInspectionWorkspace}


      {/* FIELD USER VIEW */}
      {canActAsFieldTechnician && pmDashboardTab === "my-installs" && (
        <>
          {inspectionRunsDue > 0 && (
            <Box className="glass-card" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <AssignmentLateOutlined sx={{ fontSize: 18, color: "info.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  Inspection Work
                </Typography>
                <Chip label={inspectionRunsDue} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Internal inspections assigned to you and still open
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="info"
                onClick={() => navigate("/installations/assets?workflowType=Inspection")}
              >
                Open inspections
              </Button>
            </Box>
          )}

          {/* My Jobs Today */}
          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <WorkOutlineOutlined sx={{ color: "primary.main", fontSize: 20 }} />
              <Typography variant="h6" sx={{ fontFamily: "Sora" }}>My Jobs Today</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              Sorted by activity {"\u2014"} tap to open quick actions
            </Typography>
            {myInstallAssets.length === 0 ? (
              <Typography variant="caption" color="text.disabled">No field jobs assigned to you.</Typography>
            ) : (
              <>
                <Grid container spacing={1.5}>
                  {myInstallAssets.slice(0, 6).map((a) => {
                    const cardAction = getMyJobsCardAction(a);
                    return (
                      <Grid item xs={12} sm={6} md={4} key={a.id}>
                        <Paper elevation={0} onClick={() => { void openQuickActionOrStart(a); }}
                          sx={{
                            p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5,
                            cursor: "pointer", transition: "all 0.15s",
                            "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
                          }}>
                          <Stack spacing={0.75}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
                                  <Typography variant="caption" fontWeight={600} noWrap display="block">
                                    {a.assetTag || a.assetName}
                                  </Typography>
                                  {a.totalSteps > 0 && (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      noWrap
                                      sx={{ fontSize: "0.62rem", flexShrink: 0 }}
                                    >
                                      {formatMyJobsStepCompletionLabel(a.completedSteps, a.totalSteps)}
                                    </Typography>
                                  )}
                                </Stack>
                                <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
                                  {a.jobNumber}
                                </Typography>
                              </Box>
                              <Chip
                                label={cardAction.chipLabel}
                                size="small"
                                color={cardAction.chipColor}
                                variant="outlined"
                                sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }}
                              />
                            </Stack>
                            {cardAction.widgets.length > 0 && (
                              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                                {cardAction.widgets.map((w, wi) => (
                                  <Chip
                                    key={`${w.kind}-${wi}`}
                                    size="small"
                                    variant="outlined"
                                    color={w.color}
                                    icon={w.kind === "missing-photo"
                                      ? <PhotoCameraOutlined sx={{ fontSize: 12 }} />
                                      : <ErrorOutlineOutlined sx={{ fontSize: 12 }} />}
                                    label={w.kind === "missing-photo"
                                      ? (w.count > 0 ? String(w.count) : "\u2013")
                                      : "Issue"}
                                    sx={{ height: 16, fontSize: "0.55rem", "& .MuiChip-icon": { fontSize: 12, ml: 0.25 } }}
                                  />
                                ))}
                              </Stack>
                            )}
                            <Button size="small" variant="outlined"
                              color={cardAction.buttonColor}
                              // Immediate feedback on the button that was actually
                              // pressed. Offline (or on a slow link) resolving an
                              // action can take a moment with no visible change,
                              // which reads as "the app ignored me" and invites
                              // repeat taps. runnerLoading is per-asset, so only
                              // this card's button reacts.
                              startIcon={runnerLoading === a.id ? <CircularProgress size={12} color="inherit" /> : undefined}
                              disabled={runnerLoading === a.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (cardAction.actionKind === "missing-media") {
                                  void openMissingMediaFromDashboardAsset(a);
                                  return;
                                }
                                if (cardAction.actionKind === "resolve-blocking") {
                                  const blockingIssue = openIssues.find((issue) => issue.assetId === a.id && issue.isBlocking);
                                  if (blockingIssue) {
                                    // openIssueRepair tracks its own dialog flag, so drive
                                    // runnerLoading here too or this button alone would stay
                                    // inert while it loads the issue.
                                    setRunnerLoading(a.id);
                                    void openIssueRepair(blockingIssue).finally(() => {
                                      setRunnerLoading((current) => (current === a.id ? null : current));
                                    });
                                    return;
                                  }
                                }
                                if (cardAction.actionKind === "signature") {
                                  const pendingSignature = pendingSigs.find((sig) => sig.assetId === a.id);
                                  if (pendingSignature) {
                                    openSignatureRepair(pendingSignature);
                                    return;
                                  }
                                }
                                void openQuickActionOrStart(a);
                              }}
                              sx={{
                                alignSelf: "flex-start",
                                height: 22,
                                fontSize: "0.68rem",
                                py: 0,
                                maxWidth: isNativePlatform ? "100%" : undefined,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}>
                              {cardAction.buttonLabel}
                            </Button>
                          </Stack>
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
                {myInstallAssets.length > 6 && (
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: "block" }}>
                    +{myInstallAssets.length - 6} more {"\u2014"}{" "}
                    <Box component="span" sx={{ cursor: "pointer", color: "primary.main" }}
                      onClick={() => navigate("/installations/assets")}>
                      view all
                    </Box>
                  </Typography>
                )}
              </>
            )}
          </Box>

          {/* Photo reminders from PM */}
          {photoReminders.length > 0 && (
            <Stack spacing={0.5}>
              {photoReminders.map((r) => (
                <Alert
                  key={r.id}
                  severity="info"
                  onClose={() => {
                    const updated = photoReminders.filter((x) => x.id !== r.id);
                    localStorage.setItem("installer_photo_reminders", JSON.stringify(updated));
                    setPhotoReminders(updated);
                  }}
                >
                  <Typography variant="caption" fontWeight={600}>
                    {r.sentByName} requested photos for: {r.assetTag} {"\u2014"} {r.workflowName}
                  </Typography>
                </Alert>
              ))}
            </Stack>
          )}

          {/* My runs missing media */}
          {missingMediaFlags.filter(f => f.technicianUserId === user.id).length > 0 && (
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "warning.dark", background: "rgba(237,108,2,0.07)" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <PhotoCameraOutlined sx={{ fontSize: 18, color: "warning.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  Runs Missing Media
                </Typography>
                <Chip label={missingMediaFlags.filter(f => f.technicianUserId === user.id).length} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Your completed runs with missing photo or video evidence {"\u2014"} tap to upload missing media
              </Typography>
              <Stack spacing={0.5}>
                {missingMediaFlags.filter(f => f.technicianUserId === user.id).map((f) => (
                  <Stack key={f.id} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                        {f.jobNumber ? `${f.jobNumber}: ` : ""}{f.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {f.workflowName} - {fmtDate(f.completedAt)}
                      </Typography>
                      {"totalExpected" in f && (
                        <Typography variant="caption" color="warning.main" display="block">
                          {(f as MissingMediaFlag).totalCaptured} of {(f as MissingMediaFlag).totalExpected} media steps done
                        </Typography>
                      )}
                    </Box>
                    <Button size="small" variant="outlined" color="warning" sx={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                      onClick={() => { setPhotoUploadMode("installer"); setPhotoUploadTarget(f as MissingMediaFlag); }}>
                      Add Missing Photos
                    </Button>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => {
                        const updated = missingMediaFlags.filter((x) => x.id !== f.id);
                        localStorage.setItem("pm_missing_media_flags", JSON.stringify(updated));
                        setMissingMediaFlags(updated);
                      }}>
                      x
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Needs Attention - Installer view */}
          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <WarningAmberOutlined sx={{ color: myInstallAttentionCount > 0 ? "warning.main" : "success.main", fontSize: 20 }} />
              <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Needs Attention</Typography>
              <Box sx={{ display: "inline-flex", alignItems: "center", minWidth: 64, ml: 1 }}>
                {attentionLoading ? (
                  <CircularProgress size={14} />
                ) : myInstallAttentionCount === 0 ? (
                  <Chip label="All clear" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                ) : null}
              </Box>
              <Box sx={{ flex: 1 }} />
              <Button size="small" variant="text" component={Link} to="/issues"
                endIcon={<OpenInNewOutlined sx={{ fontSize: 13 }} />} sx={{ fontSize: "0.72rem" }}>
                Issues Board
              </Button>
            </Stack>

            <Grid container spacing={2}>

              {/* My Blocking Issues */}
              <Grid item xs={12} sm={6} md={4}>
                <Box sx={{
                  p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
                  border: "1px solid", transition: "all 0.2s",
                  borderColor: myInstallBlocking.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
                  background:  myInstallBlocking.length > 0
                    ? "linear-gradient(180deg, rgba(64,15,17,0.78) 0%, rgba(33,13,14,0.56) 100%)"
                    : "rgba(255,255,255,0.03)",
                }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <ErrorOutlineOutlined sx={{ fontSize: 18, color: myInstallBlocking.length > 0 ? "error.main" : "text.disabled" }} />
                    <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My Blocking Issues</Typography>
                    {resolvingDashboardIssueId && (
                      <Chip
                        label="Updating"
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.62rem", fontWeight: 700 }}
                      />
                    )}
                  </Stack>
                  <Typography variant="h5" fontWeight={700} color={myInstallBlocking.length > 0 ? "error.main" : "text.secondary"}>
                    {myInstallBlocking.length}
                  </Typography>
                  {myInstallBlocking.length > 0 ? (
                    <Stack spacing={0.25} sx={{ mt: 1 }}>
                      {myInstallBlocking.slice(0, 3).map((iss) => (
                        <ItemRow key={iss.issueId}
                          label={`${iss.jobNumber}: ${iss.assetTag}`}
                          sub={iss.description.slice(0, 40) + (iss.description.length > 40 ? "..." : "")}
                          actionLabel="Resolve now"
                          onClick={() => openIssueRepair(iss)} />
                      ))}
                      {myInstallBlocking.length > 3 && (
                        <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                          +{myInstallBlocking.length - 3} more
                        </Typography>
                      )}
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="success.main">
                      {resolvingDashboardIssueId ? "Refreshing blocking issues..." : "No blocking issues"}
                    </Typography>
                  )}
                </Box>
              </Grid>

              {/* My Pending Signatures */}
              <Grid item xs={12} sm={6} md={4}>
                <Box sx={{
                  p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
                  border: "1px solid", transition: "all 0.2s",
                  borderColor: myInstallPendingSigs.length > 0 ? "warning.main" : "rgba(255,255,255,0.08)",
                  background:  myInstallPendingSigs.length > 0 ? "rgba(230,119,0,0.07)" : "rgba(255,255,255,0.03)",
                }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <PendingActionsOutlined sx={{ fontSize: 18, color: myInstallPendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
                    <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My Pending Signatures</Typography>
                  </Stack>
                  <Typography variant="h5" fontWeight={700} color={myInstallPendingSigs.length > 0 ? "warning.main" : "text.secondary"}>
                    {myInstallPendingSigs.length}
                  </Typography>
                  {myInstallPendingSigs.length > 0 ? (
                    <Stack spacing={0.25} sx={{ mt: 1 }}>
                      {myInstallPendingSigs.slice(0, 3).map((s) => (
                        <ItemRow key={s.runId}
                          label={`${s.jobNumber}: ${s.assetTag}`}
                          sub={`${pendingSignatureStageText(s.signatureStatus)} · Field work complete ${fmtDate(s.completedAt)}`}
                          actionLabel={pendingSignatureStageLabel(s.signatureStatus)}
                          {...(isPendingCustomerSignature(s.signatureStatus) && s.customerLinkSentAt
                            ? { customerLinkSentAt: s.customerLinkSentAt, projectTimeZoneId: s.projectTimeZoneId }
                            : {})}
                          onClick={() => openSignatureRepair(s)} />
                      ))}
                      {myInstallPendingSigs.length > 3 && (
                        <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                          +{myInstallPendingSigs.length - 3} more
                        </Typography>
                      )}
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="success.main">All signatures collected</Typography>
                  )}
                </Box>
              </Grid>

              {/* My High Observations */}
              <Grid item xs={12} sm={6} md={4}>
                <Box sx={{
                  p: { xs: 1.5, sm: 2 }, borderRadius: 2, height: "100%",
                  border: "1px solid", transition: "all 0.2s",
                  borderColor: myInstallHighObservations.length > 0 ? "warning.dark" : "rgba(255,255,255,0.08)",
                  background:  myInstallHighObservations.length > 0 ? "rgba(249,168,37,0.07)" : "rgba(255,255,255,0.03)",
                }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <ReportOutlined sx={{ fontSize: 18, color: myInstallHighObservations.length > 0 ? "warning.main" : "text.disabled" }} />
                    <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My High Observations</Typography>
                  </Stack>
                  <Typography variant="h5" fontWeight={700} color={myInstallHighObservations.length > 0 ? "warning.main" : "text.secondary"}>
                    {myInstallHighObservations.length}
                  </Typography>
                  {myInstallHighObservations.length > 0 ? (
                    <Stack spacing={0.25} sx={{ mt: 1 }}>
                      {myInstallHighObservations.slice(0, 3).map((iss) => (
                        <ItemRow key={iss.issueId}
                          label={`${iss.jobNumber}: ${iss.assetTag}`}
                          sub={iss.description.slice(0, 40) + (iss.description.length > 40 ? "..." : "")}
                          actionLabel="Review"
                          onClick={() => openIssueRepair(iss)} />
                      ))}
                      {myInstallHighObservations.length > 3 && (
                        <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                          +{myInstallHighObservations.length - 3} more
                        </Typography>
                      )}
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="success.main">No high-severity observations</Typography>
                  )}
                </Box>
              </Grid>

            </Grid>
          </Box>

          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <CheckCircleOutlineOutlined sx={{ fontSize: 18, color: myInstallHistory.length > 0 ? "success.main" : "text.disabled" }} />
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                Job History
              </Typography>
              {myInstallHistory.length > 0 && !isNativePlatform && (
                <Button size="small" variant="outlined" startIcon={<PrintOutlined fontSize="small" />} onClick={() => window.print()}>
                  Print All
                </Button>
              )}
              <Chip label={myInstallHistory.length} size="small" color={myInstallHistory.length > 0 ? "success" : "default"} variant="outlined"
                sx={{ height: 20, fontSize: "0.7rem" }} />
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Finished, completed, closed, cancelled, or deleted installation work that was assigned to you.
            </Typography>
            {myInstallHistory.length === 0 ? (
              <Typography variant="caption" color="text.secondary">No install history yet</Typography>
            ) : (
              <Stack spacing={0.75}>
                {myInstallHistory.slice(0, 6).map(renderHistoryCard)}
              </Stack>
            )}
          </Box>
        </>
      )}

      {/* SUPERVISOR VIEW */}
      {isSupervisor && pmDashboardTab === "my-installs" && (
        <>
          {/* Needs Attention - team issues */}
          {NeedsAttentionSection}

          {/* Field Activity: Workload panel */}
          {WorkloadPanel}

          {/* Unassigned + Not Started */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <WarningAmberOutlined sx={{ fontSize: 18, color: unassignedAssets.length > 0 ? "warning.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>Unassigned Assets</Typography>
                  <Chip label={unassignedAssets.length} size="small"
                    color={unassignedAssets.length > 0 ? "warning" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                  Active jobs with no technician assigned
                </Typography>
                {unassignedAssets.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">All assets are assigned</Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {unassignedAssets.slice(0, 5).map((a) => (
                      <ItemRow key={a.id}
                        label={a.assetTag || a.assetName || a.id}
                        sub={a.jobNumber}
                        onClick={() => navigate("/installations/assets")} />
                    ))}
                    {unassignedAssets.length > 5 && (
                      <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                        +{unassignedAssets.length - 5} more
                      </Typography>
                    )}
                  </Stack>
                )}
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <AssignmentLateOutlined sx={{ fontSize: 18, color: notStartedAssets.length > 0 ? "warning.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>Not Started</Typography>
                  <Chip label={notStartedAssets.length} size="small"
                    color={notStartedAssets.length > 0 ? "warning" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                  Assigned but not yet begun
                </Typography>
                {notStartedAssets.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">All assigned assets are in progress</Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {notStartedAssets.slice(0, 5).map((a) => (
                      <ItemRow key={a.id}
                        label={a.assetTag || a.assetName || a.id}
                        sub={[a.jobNumber, a.assignedUserId ? `Assigned: ${a.assignedUserId}` : undefined].filter(Boolean).join(" - ")}
                        onClick={() => navigate("/installations/assets")} />
                    ))}
                    {notStartedAssets.length > 5 && (
                      <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                        +{notStartedAssets.length - 5} more
                      </Typography>
                    )}
                  </Stack>
                )}
              </Box>
            </Grid>
          </Grid>

          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <CheckCircleOutlineOutlined sx={{ fontSize: 18, color: myInstallHistory.length > 0 ? "success.main" : "text.disabled" }} />
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                Install History
              </Typography>
              {myInstallHistory.length > 0 && !isNativePlatform && (
                <Button size="small" variant="outlined" startIcon={<PrintOutlined fontSize="small" />} onClick={() => window.print()}>
                  Print All
                </Button>
              )}
              <Chip label={myInstallHistory.length} size="small" color={myInstallHistory.length > 0 ? "success" : "default"} variant="outlined"
                sx={{ height: 20, fontSize: "0.7rem" }} />
            </Stack>
            {myInstallHistory.length === 0 ? (
              <Typography variant="caption" color="text.secondary">No install history yet</Typography>
            ) : (
              <Stack spacing={0.75}>
                {myInstallHistory.slice(0, 6).map(renderHistoryCard)}
              </Stack>
            )}
          </Box>
        </>
      )}

      {/* ENGINEER VIEW */}
      {isEngineer && pmDashboardTab === "my-installs" && (
        <>
          {/* Needs Attention - scoped */}
          {NeedsAttentionSection}

          {/* Quality Focus: Sign-offs + Draft Configs */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <PendingActionsOutlined sx={{ fontSize: 18, color: myInstallPendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>Sign-offs Waiting on Me</Typography>
                  <Chip label={myInstallPendingSigs.length} size="small"
                    color={myInstallPendingSigs.length > 0 ? "warning" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                {myInstallPendingSigs.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">No pending sign-offs</Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {myInstallPendingSigs.slice(0, 5).map((s) => (
                      <ItemRow key={s.runId}
                        label={`${s.jobNumber}: ${s.assetTag}`}
                        sub={`${pendingSignatureStageText(s.signatureStatus)} · Field work complete ${fmtDate(s.completedAt)}`}
                        actionLabel={pendingSignatureStageLabel(s.signatureStatus)}
                        {...(isPendingCustomerSignature(s.signatureStatus) && s.customerLinkSentAt
                          ? { customerLinkSentAt: s.customerLinkSentAt, projectTimeZoneId: s.projectTimeZoneId }
                          : {})}
                        onClick={() => openSignatureRepair(s)} />
                    ))}
                    {myInstallPendingSigs.length > 5 && (
                      <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                        +{myInstallPendingSigs.length - 5} more
                      </Typography>
                    )}
                  </Stack>
                )}
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <FactCheckOutlined sx={{ fontSize: 18, color: draftConfigs.length > 0 ? "warning.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>Workflow Configs in Draft</Typography>
                  <Chip label={draftConfigs.length} size="small"
                    color={draftConfigs.length > 0 ? "warning" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                  Not yet published {"\u2014"} review and publish
                </Typography>
                {draftConfigs.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">No draft configs</Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {draftConfigs.slice(0, 5).map((cfg) => (
                      <ItemRow key={cfg.id}
                        label={cfg.name}
                        sub={cfg.updatedAt ? `Updated ${fmtDate(cfg.updatedAt)}` : undefined}
                        onClick={() => navigate("/work-instructions")} />
                    ))}
                    {draftConfigs.length > 5 && (
                      <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                        +{draftConfigs.length - 5} more
                      </Typography>
                    )}
                  </Stack>
                )}
              </Box>
            </Grid>
          </Grid>
        </>
      )}

      {/* PROJECT MANAGER / ADMIN VIEW */}
      {isManager && !showNativeManagerHome && (
        <>
          {pmDashboardTab === "pm-projects" && ProjectStatusGrid}

          {/* Needs Attention - company-wide */}
          {pmDashboardTab === "pm-projects" && NeedsAttentionSection}

          {/* Inspection workspace */}
          {pmDashboardTab === "my-inspections" && !isAdmin && MyInspectionAttentionSection}
          {pmDashboardTab === "my-inspections" && (isAdmin ? AdminInspectionWorkspace : MyInspectionWorkspace)}

          {/* Pending Approvals strip - if any */}
          {pmDashboardTab === "pm-projects" && pendingApprovals.length > 0 && (
            <Box className="glass-card" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <AssignmentLateOutlined sx={{ fontSize: 18, color: "warning.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>Pending Approvals</Typography>
                <Chip label={pendingApprovals.length} size="small" color="warning" variant="outlined"
                  sx={{ height: 20, fontSize: "0.7rem" }} />
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Projects waiting for your approval
              </Typography>
              <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }} flexWrap="nowrap">
                {pendingApprovals.map((p) => (
                  <Chip key={p.id}
                    label={p.jobNumber || p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    color="warning" variant="outlined"
                    sx={{ flexShrink: 0, cursor: "pointer" }} />
                ))}
              </Stack>
            </Box>
          )}

          {/* Inspection signals */}
          {(pmDashboardTab === "pm-projects" || pmDashboardTab === "my-inspections") && InspectionInboxSection}

          {/* Auto-assignment flags - field user self-assigned */}
          {pmDashboardTab === "pm-projects" && autoAssignFlags.length > 0 && (
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "info.dark", background: "rgba(2,136,209,0.07)" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <PersonOutlined sx={{ fontSize: 18, color: "info.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  New Auto-assignments
                </Typography>
                <Chip label={autoAssignFlags.length} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                <Button size="small" variant="text" color="info" sx={{ fontSize: "0.72rem" }}
                  onClick={() => {
                    localStorage.removeItem("pm_auto_assign_flags");
                    setAutoAssignFlags([]);
                  }}>
                  Dismiss all
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Assets that were auto-assigned when an installer started a workflow
              </Typography>
              <Stack spacing={0.25}>
                {autoAssignFlags.map((f) => (
                  <Stack key={f.id} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <ItemRow
                        label={`${f.jobNumber ? f.jobNumber + ": " : ""}${f.assetTag}`}
                        sub={`Assigned to ${f.assignedBy} - ${fmtDate(f.assignedAt)}`}
                        onClick={() => navigate("/installations")}
                      />
                    </Box>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => {
                        const updated = autoAssignFlags.filter((x) => x.id !== f.id);
                        localStorage.setItem("pm_auto_assign_flags", JSON.stringify(updated));
                        setAutoAssignFlags(updated);
                      }}>
                      x
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Installer media updates - PM notifications when installers upload missing media */}
          {pmDashboardTab === "pm-projects" && photoUpdateNotifications.length > 0 && (
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "info.dark", background: "rgba(2,136,209,0.07)" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <PhotoCameraOutlined sx={{ fontSize: 18, color: "info.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  Installer Media Updates
                </Typography>
                <Chip label={photoUpdateNotifications.length} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                <Button size="small" variant="text" color="info" sx={{ fontSize: "0.72rem" }}
                  onClick={() => {
                    localStorage.removeItem("pm_photo_update_notifications");
                    setPhotoUpdateNotifications([]);
                  }}>
                  Dismiss all
                </Button>
              </Stack>
              <Stack spacing={0.5} mt={1}>
                {photoUpdateNotifications.map((n) => (
                  <Stack key={n.id} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                        {n.installerName} updated media for {n.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {n.workflowName} - {fmtDate(n.updatedAt)}
                      </Typography>
                      <Typography variant="caption" display="block" color={n.wasComplete ? "success.main" : "warning.main"}>
                        {n.wasComplete ? "All media added" : `${n.stillMissing} step${n.stillMissing !== 1 ? "s" : ""} still missing`}
                      </Typography>
                    </Box>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => {
                        const updated = photoUpdateNotifications.filter((x) => x.id !== n.id);
                        localStorage.setItem("pm_photo_update_notifications", JSON.stringify(updated));
                        setPhotoUpdateNotifications(updated);
                      }}>
                      x
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Missing media flags - PM sees all runs without required media */}
          {pmDashboardTab === "pm-projects" && missingMediaFlags.length > 0 && (
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "warning.dark", background: "rgba(237,108,2,0.07)" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <PhotoCameraOutlined sx={{ fontSize: 18, color: "warning.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  Runs Missing Media
                </Typography>
                <Chip label={missingMediaFlags.length} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                <Button size="small" variant="text" color="warning" sx={{ fontSize: "0.72rem" }}
                  onClick={() => {
                    localStorage.removeItem("pm_missing_media_flags");
                    setMissingMediaFlags([]);
                  }}>
                  Dismiss all
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Workflow runs completed without all required photos or videos captured
              </Typography>
              <Stack spacing={0.75}>
                {missingMediaFlags.map((f) => (
                  <Stack key={f.id} direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                        {f.jobNumber ? `${f.jobNumber}: ` : ""}{f.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {f.workflowName} - {fmtDate(f.completedAt)}
                      </Typography>
                      {"totalExpected" in f && (
                        <>
                          <Typography variant="caption" color="warning.main" display="block">
                            {(f as MissingMediaFlag).totalCaptured}/{(f as MissingMediaFlag).totalExpected} media steps captured
                          </Typography>
                          {(f as MissingMediaFlag).missingSteps?.slice(0, 3).map((ms) => (
                            <Typography key={`${ms.stepId}-${ms.inputId}`} variant="caption" color="text.disabled" display="block" sx={{ pl: 1 }}>
                              - {ms.stepTitle} - {ms.inputLabel}: {ms.captured} captured
                            </Typography>
                          ))}
                          {((f as MissingMediaFlag).missingSteps?.length ?? 0) > 3 && (
                            <Typography variant="caption" color="text.disabled" display="block" sx={{ pl: 1 }}>
                              +{((f as MissingMediaFlag).missingSteps?.length ?? 0) - 3} more...
                            </Typography>
                          )}
                        </>
                      )}
                    </Box>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="info"
                        sx={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                        onClick={() => openMissingMediaRepair(f)}
                      >
                        Open Repair
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        color="warning"
                        sx={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                        disabled={reminderSentId === f.id}
                        onClick={() => {
                          const reminder = {
                            id: randomId(),
                            runId: f.runId,
                            assetTag: f.assetTag,
                            jobNumber: f.jobNumber,
                            workflowName: f.workflowName,
                            sentAt: new Date().toISOString(),
                            sentByName: user.fullName ?? "PM",
                          };
                          const existing = JSON.parse(localStorage.getItem("installer_photo_reminders") ?? "[]");
                          localStorage.setItem("installer_photo_reminders", JSON.stringify([...existing, reminder]));
                          window.dispatchEvent(new Event("installer-photo-reminders-changed"));
                          setReminderSentId(f.id);
                          setTimeout(() => setReminderSentId(null), 2000);
                        }}
                      >
                        {reminderSentId === f.id ? "Sent" : "Notify Field User"}
                      </Button>
                      <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                        onClick={() => {
                          const updated = missingMediaFlags.filter((x) => x.id !== f.id);
                          localStorage.setItem("pm_missing_media_flags", JSON.stringify(updated));
                          setMissingMediaFlags(updated);
                        }}>
                        x
                      </Button>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Regional Snapshot */}
          {pmDashboardTab === "pm-projects" && RegionalSnapshotSection}

          {/* Evidence + Health */}
          {pmDashboardTab === "pm-projects" && EvidenceHealthGrid}

          {/* Workload */}
          {pmDashboardTab === "pm-projects" && WorkloadPanel}

          {/* Install workspace */}
          {pmDashboardTab === "my-installs" && (isAdmin ? AdminInstallWorkspace : (
            <Stack spacing={2}>
              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <WorkOutlineOutlined sx={{ color: "primary.main", fontSize: 20 }} />
                  <Typography variant="h6" sx={{ fontFamily: "Sora" }}>My Installs</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                  Installation assets currently assigned to you for field execution.
                </Typography>
                {myInstallAssets.length === 0 ? (
                  <Typography variant="caption" color="text.disabled">No installation assets currently assigned to you for field execution.</Typography>
                ) : (
                  <>
                    <Grid container spacing={1.5}>
                      {myInstallAssets.slice(0, 6).map((a) => (
                        <Grid item xs={12} sm={6} md={4} key={a.id}>
                          <Paper elevation={0} onClick={() => navigate("/installations/assets")}
                            sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, cursor: "pointer",
                              transition: "all 0.15s", "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" } }}>
                            <Stack spacing={0.75}>
                              <Typography variant="caption" fontWeight={600} noWrap display="block">
                                {a.assetTag || a.assetName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
                                {a.jobNumber}
                              </Typography>
                              <Chip label={dashboardStatusChip(a).label}
                                size="small" variant="outlined"
                                color={dashboardStatusChip(a).color}
                                sx={{ alignSelf: "flex-start", height: 16, fontSize: "0.58rem" }} />
                            </Stack>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                    {myInstallAssets.length > 6 && (
                      <Button size="small" variant="text" sx={{ mt: 1 }}
                        onClick={() => navigate("/installations/assets")}>
                        View all {myInstallAssets.length} assets
                      </Button>
                    )}
                  </>
                )}
              </Box>

              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <CheckCircleOutlineOutlined sx={{ fontSize: 18, color: myInstallHistory.length > 0 ? "success.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                    Install History
                  </Typography>
                  {myInstallHistory.length > 0 && !isNativePlatform && (
                    <Button size="small" variant="outlined" startIcon={<PrintOutlined fontSize="small" />} onClick={() => window.print()}>
                      Print All
                    </Button>
                  )}
                  <Chip label={myInstallHistory.length} size="small" color={myInstallHistory.length > 0 ? "success" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                {myInstallHistory.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">No install history yet</Typography>
                ) : (
                  <Stack spacing={0.75}>
                    {myInstallHistory.slice(0, 6).map(renderHistoryCard)}
                  </Stack>
                )}
              </Box>
            </Stack>
          ))}
        </>
      )}

      {/* VIEWER VIEW */}
      {isViewer && (
        <>
          {/* Needs Attention - read-only */}
          {NeedsAttentionSection}

          {/* Regional Snapshot - read only */}
          {RegionalSnapshotSection}

          {/* Project Status */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Box className="glass-card" sx={{ p: 2.5, height: "100%" }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <TrendingUpOutlined sx={{ fontSize: 18, color: "primary.main" }} />
                  <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem" }}>Project Status</Typography>
                </Stack>
                <Stack spacing={1.25}>
                  {statusGroups.map(([status, count]) => (
                    <Stack key={status} direction="row" alignItems="center" spacing={1.5}>
                      <Chip label={status} size="small"
                        color={(statusColor[status] ?? "default") as "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"}
                        variant="outlined" sx={{ fontSize: "0.68rem", height: 20, minWidth: 100 }} />
                      <Box sx={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <Box sx={{
                          height: "100%", borderRadius: 3,
                          width: `${Math.round((count / projectCount) * 100)}%`,
                          background: status === "Completed" ? "#2e7d32" : status === "In Progress" ? "#1976d2" :
                            status === "Pending Approval" ? "#ed6c02" : status === "Cancelled" ? "#d32f2f" : "#555",
                        }} />
                      </Box>
                      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 24, textAlign: "right" }}>{count}</Typography>
                    </Stack>
                  ))}
                  {statusGroups.length === 0 && (
                    <Typography variant="caption" color="text.disabled">No projects loaded.</Typography>
                  )}
                </Stack>
                <Divider sx={{ my: 2 }} />
                <Stack direction="row" spacing={1}>
                  <CheckCircleOutlineOutlined sx={{ fontSize: 14, color: "success.main", mt: 0.25 }} />
                  <Typography variant="caption" color="text.secondary">
                    Dashboard totals include active, open, in-progress, pending, and overdue projects only.
                  </Typography>
                </Stack>
              </Box>
            </Grid>
          </Grid>
        </>
      )}

      {/* ── Per-installer workload report dialog ── */}
      {workloadReportTarget && (() => {
        const w = workloadReportTarget;
        const techAssets = openAssets.filter((a) => a.assignedUserId === w.userId);
        const load = w.totalAssigned >= 10 ? "error" : w.totalAssigned >= 5 ? "warning" : "success";
        return (
          <Dialog open onClose={() => setWorkloadReportTarget(null)} fullWidth maxWidth="md" id="workload-report-dialog">
            <DialogTitle>
              <Stack direction="row" alignItems="center" spacing={1}>
                <AssessmentOutlined sx={{ color: "primary.main" }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" sx={{ fontFamily: "Sora" }}>{w.fullName} — Workload Report</Typography>
                  <Typography variant="caption" color="text.secondary">{new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</Typography>
                </Box>
                <IconButton size="small" onClick={() => setWorkloadReportTarget(null)}><CloseOutlined fontSize="small" /></IconButton>
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                {/* Summary */}
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  {[
                    { label: "Total Assets", value: w.totalAssigned, color: load },
                    { label: "In Progress", value: w.inProgress, color: "primary" },
                    { label: "Paused", value: w.paused, color: "warning" },
                    { label: "Queued", value: w.notStarted, color: "default" },
                  ].map(({ label, value, color }) => (
                    <Paper key={label} elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, minWidth: 90 }}>
                      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                      <Typography variant="h5" fontWeight={700} color={`${color}.main`}>{value}</Typography>
                    </Paper>
                  ))}
                  {w.totalSteps > 0 && (
                    <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5, minWidth: 120 }}>
                      <Typography variant="caption" color="text.secondary" display="block">Steps</Typography>
                      <Typography variant="h5" fontWeight={700}>{w.completedSteps}/{w.totalSteps}</Typography>
                    </Paper>
                  )}
                </Stack>
                <Divider />
                {/* Per-project asset detail */}
                {w.projectBreakdown.map((pb) => {
                  const proj = projectById.get(pb.projectId);
                  const pbAssets = techAssets.filter((a) => a.projectId === pb.projectId);
                  return (
                    <Box key={pb.projectId}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                        <Typography variant="subtitle2" fontWeight={700} color="primary.main">{pb.jobNumber}</Typography>
                        {proj?.customerName && <Typography variant="body2" color="text.secondary">— {proj.customerName}</Typography>}
                        {proj?.projectManager && (
                          <Chip label={`PM: ${proj.projectManager}`} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.65rem", ml: "auto" }} />
                        )}
                        <Chip label={`${pb.inProgress} active · ${pb.paused} paused · ${pb.notStarted} queued`} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} />
                      </Stack>
                      <Stack spacing={0.4}>
                        {pbAssets.map((a) => {
                          const state = isPausedAsset(a.runStatus) ? "Paused"
                            : isInProgressAsset(a.runStatus) || isInProgressAsset(a.status) ? "In Progress"
                            : isNotStartedAsset(a.status) ? "Not Started" : a.status;
                          const stateColor = state === "In Progress" ? "primary" : state === "Paused" ? "warning" : "default";
                          return (
                            <Stack key={a.id} direction="row" alignItems="center" spacing={1}
                              sx={{ px: 1.5, py: 0.5, borderRadius: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                              <Typography variant="caption" fontWeight={700} sx={{ flex: "0 0 110px" }}>{a.assetTag || a.id}</Typography>
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>{a.assetName || a.assetModel || "—"}</Typography>
                              <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>{a.location || ""}</Typography>
                              {a.totalSteps > 0 && (
                                <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>{a.completedSteps}/{a.totalSteps} steps</Typography>
                              )}
                              <Chip label={state} size="small" color={stateColor as "primary"|"warning"|"default"} variant="outlined"
                                sx={{ height: 18, fontSize: "0.62rem", flexShrink: 0 }} />
                            </Stack>
                          );
                        })}
                        {pbAssets.length === 0 && <Typography variant="caption" color="text.disabled" sx={{ pl: 1.5 }}>No individual asset data available</Typography>}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 1.5 }}>
              <Button startIcon={<PrintOutlined />} onClick={() => window.print()}>Print</Button>
              <Button variant="contained" startIcon={<AssessmentOutlined />}
                disabled={reportingTechId === w.userId}
                onClick={() => void handleGenerateTechReport(w as TechnicianWorkloadSummaryItem)}>
                Download PDF
              </Button>
              <Button onClick={() => setWorkloadReportTarget(null)}>Close</Button>
            </DialogActions>
          </Dialog>
        );
      })()}

      {/* ── All-installers workload report dialog ── */}
      <Dialog open={workloadReportAllOpen} onClose={() => setWorkloadReportAllOpen(false)} fullWidth maxWidth="lg" id="workload-report-all-dialog">
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PrintOutlined sx={{ color: "primary.main" }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Technician Workload — Full Report</Typography>
              <Typography variant="caption" color="text.secondary">
                {scopedWorkload.length} technician{scopedWorkload.length !== 1 ? "s" : ""} · {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setWorkloadReportAllOpen(false)}><CloseOutlined fontSize="small" /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            {scopedWorkload.map((w) => {
              const techAssets = openAssets.filter((a) => a.assignedUserId === w.userId);
              const load = w.totalAssigned >= 10 ? "error" : w.totalAssigned >= 5 ? "warning" : "success";
              return (
                <Box key={w.userId}>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora" }}>{w.fullName}</Typography>
                    <Chip label={w.totalAssigned >= 10 ? "Heavy" : w.totalAssigned >= 5 ? "Moderate" : "Light"}
                      size="small" color={load} variant="outlined" sx={{ height: 18, fontSize: "0.65rem" }} />
                    {w.hasIssues && <Chip label="Issues" size="small" color="warning" sx={{ height: 18, fontSize: "0.65rem" }} />}
                    <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                      {w.inProgress} active · {w.paused} paused · {w.notStarted} queued · {w.totalAssigned} total
                    </Typography>
                  </Stack>
                  {w.projectBreakdown.map((pb) => {
                    const proj = projectById.get(pb.projectId);
                    const pbAssets = techAssets.filter((a) => a.projectId === pb.projectId);
                    return (
                      <Box key={pb.projectId} sx={{ mb: 1, pl: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                          <Typography variant="caption" fontWeight={700} color="primary.main">{pb.jobNumber}</Typography>
                          {proj?.customerName && <Typography variant="caption" color="text.secondary">— {proj.customerName}</Typography>}
                          {proj?.projectManager && <Typography variant="caption" color="text.disabled">· PM: {proj.projectManager}</Typography>}
                        </Stack>
                        <Stack spacing={0.3}>
                          {pbAssets.map((a) => {
                            const state = isPausedAsset(a.runStatus) ? "Paused"
                              : isInProgressAsset(a.runStatus) || isInProgressAsset(a.status) ? "In Progress"
                              : isNotStartedAsset(a.status) ? "Not Started" : a.status;
                            const stateColor = state === "In Progress" ? "primary" : state === "Paused" ? "warning" : "default";
                            return (
                              <Stack key={a.id} direction="row" alignItems="center" spacing={1}
                                sx={{ px: 1, py: 0.25, borderRadius: 1, background: "rgba(255,255,255,0.03)" }}>
                                <Typography variant="caption" fontWeight={600} sx={{ flex: "0 0 100px", fontSize: "0.68rem" }}>{a.assetTag || a.id}</Typography>
                                <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, fontSize: "0.65rem" }}>{a.assetName || a.assetModel || "—"}</Typography>
                                {a.totalSteps > 0 && <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.62rem", flexShrink: 0 }}>{a.completedSteps}/{a.totalSteps} steps</Typography>}
                                <Chip label={state} size="small" color={stateColor as "primary"|"warning"|"default"} variant="outlined"
                                  sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }} />
                              </Stack>
                            );
                          })}
                        </Stack>
                      </Box>
                    );
                  })}
                  <Divider sx={{ mt: 1 }} />
                </Box>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          {!isNativePlatform && (
            <Button startIcon={<PrintOutlined />} onClick={() => window.print()}>Print All</Button>
          )}
          <Button onClick={() => setWorkloadReportAllOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Photo upload dialog - installer adds missing photos to a completed run */}
      {photoUploadTarget && (
        <PhotoUploadDialog
          open={!!photoUploadTarget}
          flag={photoUploadTarget}
          mode={photoUploadMode}
          currentUserName={user.fullName ?? ""}
          onClose={() => setPhotoUploadTarget(null)}
          onUpdated={async (updatedFlag) => {
            const repairedAssetId = photoUploadTarget?.assetId;
            setPhotoUploadTarget(null);
            const raw: MissingMediaFlag[] = JSON.parse(localStorage.getItem("pm_missing_media_flags") ?? "[]");
            setMissingMediaFlags(raw.map((f) => ({ ...f, missingSteps: f.missingSteps ?? [], totalExpected: f.totalExpected ?? 0, totalCaptured: f.totalCaptured ?? 0 })));
            const refreshedWorkspace = await refreshDashboardAfterIssueUpdate();
            if (!isNativePlatform || updatedFlag !== null || !repairedAssetId || !refreshedWorkspace) {
              return;
            }
            const refreshedAsset = [...refreshedWorkspace.currentInstalls, ...refreshedWorkspace.currentInspections]
              .find((asset) => asset.id === repairedAssetId);
            if (refreshedAsset) {
              await openQuickActionOrStart(refreshedAsset);
            }
          }}
        />
      )}

      {issueDetailTarget && (
        <IssueDetailDialog
          open={!!issueDetailTarget}
          issue={issueDetailTarget.issue}
          currentUser={user.fullName ?? user.email ?? "User"}
          hideComments
          hideResolutionMedia
          onClose={() => setIssueDetailTarget(null)}
          onSave={(updated) => void handleDashboardIssueSave(updated as AssetIssue | RunIssue)}
        />
      )}

      {/* Quick Action Dialog for "My Jobs Today" */}
      <Dialog open={quickActionOpen} onClose={closeQuickActionDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <WorkOutlineOutlined sx={{ color: "primary.main" }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                {quickActionAsset?.assetTag || quickActionAsset?.assetName || "Asset"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {quickActionAsset?.jobNumber}
              </Typography>
            </Box>
            <Chip
              label={quickActionAsset ? dashboardStatusChip(quickActionAsset).label : ""}
              size="small"
              color={quickActionAsset ? dashboardStatusChip(quickActionAsset).color : "default"}
              variant="outlined"
            />
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {quickActionLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Stack spacing={2}>
              {/* Asset details */}
              {quickActionAsset && (
                <Box>
                  {quickActionAsset.totalSteps > 0 && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Progress: {formatStepCompletionPercent(quickActionAsset.completedSteps, quickActionAsset.totalSteps)}
                      {quickActionAsset.missingItems > 0 && ` \u2022 ${quickActionAsset.missingItems} missing`}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                    {quickActionAttention.blockingIssues.length > 0 && (
                      <Chip size="small" color="error" variant="outlined" label={`${quickActionAttention.blockingIssues.length} blocking`} />
                    )}
                    {quickActionAttention.highObservations.length > 0 && (
                      <Chip size="small" color="warning" variant="outlined" label={`${quickActionAttention.highObservations.length} high observation`} />
                    )}
                    {quickActionAttention.missingMedia && (
                      <Chip size="small" color="warning" variant="outlined" label="Missing photos" />
                    )}
                    {quickActionAttention.pendingSignature && (
                      <Chip size="small" color="warning" variant="outlined" label="Pending signature" />
                    )}
                  </Stack>
                </Box>
              )}

              {/* Quick Actions */}
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
                Quick Actions
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={docsLoading ? <CircularProgress size={14} /> : <FolderOutlined fontSize="small" />}
                  onClick={() => {
                    if (quickActionAsset) {
                      setDocsDialogAsset(quickActionAsset);
                      setDocsDialogOpen(true);
                      closeQuickActionDialog();
                    }
                  }}
                  disabled={docsLoading}
                >
                  Documents ({docsCount})
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<EditOutlined fontSize="small" />}
                  onClick={() => {
                    closeQuickActionDialog();
                    navigate("/installations/assets");
                  }}
                >
                  Edit Asset
                </Button>
                {quickActionPrimaryAction && (
                  <Button
                    size="small"
                    variant="contained"
                    color={quickActionPrimaryAction.color}
                    startIcon={
                      quickActionPrimaryAction.label === "Resolve Blocking Issue" || quickActionPrimaryAction.label === "Resolve Issue" ? <WarningAmberOutlined fontSize="small" /> :
                      quickActionPrimaryAction.label === "Add Missing Photos" || quickActionPrimaryAction.label === "Add Photos" ? <PhotoCameraOutlined fontSize="small" /> :
                      quickActionPrimaryAction.label === "Complete Sign-off" ? <PendingActionsOutlined fontSize="small" /> :
                      quickActionPrimaryAction.label === "Review High Observation" ? <ReportOutlined fontSize="small" /> :
                      <PlayArrowOutlined fontSize="small" />
                    }
                    onClick={quickActionPrimaryAction.onClick}
                  >
                    {quickActionPrimaryAction.label}
                  </Button>
                )}
              </Stack>

              {(quickActionAttention.blockingIssues.length > 0 ||
                quickActionAttention.highObservations.length > 0 ||
                quickActionAttention.missingMedia ||
                quickActionAttention.pendingSignature) && (
                <Alert severity={quickActionAttention.blockingIssues.length > 0 ? "error" : "warning"} sx={{ mt: 0.5 }}>
                  {quickActionAttention.blockingIssues.length > 0
                    ? "This asset has an open blocking issue. Resolve it before expecting the workflow to complete normally."
                    : quickActionAttention.missingMedia
                      ? "This asset has missing workflow photos. The primary action takes the user directly to photo recovery."
                      : quickActionAttention.pendingSignature
                        ? "This asset is waiting for sign-off. Keep signature recovery as a first-class action."
                        : "This asset has high-severity observations that still need review."}
                </Alert>
              )}

              {/* Workflow assignments */}
              {quickActionAssignments.length === 0 && quickActionRuns.length === 0 && !productWorkflow ? (
                quickActionAsset && assetLikelyHasWorkflow(
                  quickActionAsset,
                  nativeMyJobsCardContext[quickActionAsset.id]?.asset,
                ) && isOfflineConfigMissingContext() ? (
                  <Stack spacing={1.5}>
                    <Alert severity="warning">
                      {OFFLINE_CONFIG_MISSING_MESSAGE}
                    </Alert>
                    <Button
                      variant="outlined"
                      onClick={() => retryOfflineDownload()}
                    >
                      Retry download when online
                    </Button>
                  </Stack>
                ) : (
                <Stack spacing={1.5}>
                  <Alert severity="info">
                    No workflow assigned to this asset yet.
                  </Alert>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<PlayArrowOutlined />}
                    onClick={() => void openAssignDialogFromDashboard()}
                  >
                    Assign Workflow
                  </Button>
                </Stack>
                )
              ) : quickActionAssignments.length === 0 && quickActionRuns.length === 0 && productWorkflow ? (
                // Product-linked workflow (no explicit assignment)
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
                    Linked Workflow (from product)
                  </Typography>
                  <Paper elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {productWorkflow.configName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {isInspectionWorkflowType(productWorkflow.workflowTypeId) ? "Inspection" : "Installation"} workflow
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        startIcon={runnerLoading === quickActionAsset?.id ? <CircularProgress size={14} /> : <PlayArrowOutlined />}
                        disabled={runnerLoading === quickActionAsset?.id}
                        onClick={() => {
                          if (quickActionAsset && productWorkflow) {
                            launchProductWorkflowFromDashboard(quickActionAsset, productWorkflow);
                          }
                        }}
                      >
                        Start Run
                      </Button>
                    </Stack>
                  </Paper>
                </Box>
              ) : quickActionAssignments.length === 0 && quickActionRuns.length > 0 ? (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
                    Previous Workflow Runs
                  </Typography>
                  <Alert severity="info" sx={{ mb: 1.5 }}>
                    This asset has previous workflow runs but no current assignment. Assign a new workflow to start fresh.
                  </Alert>
                  <Stack spacing={1}>
                    {quickActionRuns.slice(0, 3).map((run) => (
                      <Paper key={run.id} elevation={0} sx={{ p: 1.25, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" fontWeight={600}>
                              Run #{run.runNumber ?? 1}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {run.status} · {run.completedAt ? `Completed ${new Date(run.completedAt).toLocaleDateString()}` : run.startedAt ? `Started ${new Date(run.startedAt).toLocaleDateString()}` : "In progress"}
                            </Typography>
                          </Box>
                          <Chip
                            label={run.status}
                            size="small"
                            color={run.status === "Complete" ? "success" : run.status === "Issue" ? "error" : "primary"}
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.65rem" }}
                          />
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<PlayArrowOutlined />}
                    onClick={() => void openAssignDialogFromDashboard()}
                    sx={{ mt: 1.5 }}
                  >
                    Assign New Workflow
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
                    Assigned Workflows
                  </Typography>
                  <Stack spacing={1}>
                    {quickActionAssignments.map((asgn) => {
                      const isActive = quickActionRuns.some((r) => r.workflowConfigId === asgn.workflowConfigId && !r.isLocked);
                      const isInspection = isInspectionWorkflowType(asgn.workflowTypeId);
                      return (
                        <Paper key={asgn.id} elevation={0} sx={{ p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5 }}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" fontWeight={600}>
                                {asgn.workflowConfigName || asgn.workflowConfigId}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {isInspection ? "Inspection" : "Installation"} workflow
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.5}>
                              {isInspection && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="info"
                                  onClick={() => {
                                    if (quickActionAsset) {
                                      setImportDialogAsset({
                                        id: quickActionAsset.id,
                                        assetTag: quickActionAsset.assetTag,
                                        assetName: quickActionAsset.assetName,
                                        projectId: quickActionAsset.projectId,
                                      });
                                      setImportDialogOpen(true);
                                      closeQuickActionDialog();
                                    }
                                  }}
                                >
                                  Upload JSON
                                </Button>
                              )}
                              <Button
                                size="small"
                                variant="contained"
                                color={isActive ? "primary" : "success"}
                                startIcon={runnerLoading === quickActionAsset?.id ? <CircularProgress size={14} /> : <PlayArrowOutlined />}
                                disabled={runnerLoading === quickActionAsset?.id}
                                onClick={() => checkAssignmentThenStartFromDashboard(quickActionAsset!, asgn)}
                              >
                                {isActive ? "Resume Run" : "Start Run"}
                              </Button>
                            </Stack>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<OpenInNewOutlined />}
            onClick={() => {
              closeQuickActionDialog();
              navigate("/installations/assets");
            }}
          >
            Go to Project Assets
          </Button>
          <Button onClick={closeQuickActionDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Auto-assign confirmation dialog */}
      <Dialog open={!!autoAssignConfirm} onClose={() => setAutoAssignConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {autoAssignConfirm?.reason === "unassigned" ? "Unassigned Asset" : "Asset Assigned to Another User"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {autoAssignConfirm?.reason === "unassigned" ? (
              <>
                <strong>{autoAssignConfirm?.asset.assetTag || autoAssignConfirm?.asset.assetName}</strong> has no installer assigned.
                Starting this workflow will assign it to <strong>you ({user.fullName})</strong>.
              </>
            ) : (
              <>
                <strong>{autoAssignConfirm?.asset.assetTag || autoAssignConfirm?.asset.assetName}</strong> is currently assigned to <strong>{autoAssignConfirm?.otherName}</strong>.
                Starting this workflow will reassign it to <strong>you ({user.fullName})</strong>.
              </>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAutoAssignConfirm(null)}>Cancel</Button>
          <Button variant="contained" onClick={confirmAutoAssignAndStartFromDashboard}>
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Inspection Import Dialog */}
      {importDialogAsset && (
        <Dialog open={importDialogOpen} onClose={() => { setImportDialogOpen(false); setImportDialogAsset(null); }} maxWidth="md" fullWidth>
          <DialogTitle>Upload Inspection JSON</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              Upload an inspection JSON file for <strong>{importDialogAsset.assetTag || importDialogAsset.assetName}</strong>.
              This is the same functionality available on the Project Assets page.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Navigate to Project Assets to use the full inspection import dialog with file upload and JSON paste functionality.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setImportDialogOpen(false); setImportDialogAsset(null); }}>Close</Button>
            <Button
              variant="contained"
              startIcon={<OpenInNewOutlined />}
              onClick={() => {
                setImportDialogOpen(false);
                setImportDialogAsset(null);
                navigate("/installations/assets");
              }}
            >
              Go to Project Assets
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Assign Workflow Dialog */}
      <Dialog open={assignDialogOpen} onClose={() => !assignSaving && setAssignDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PlayArrowOutlined fontSize="small" />
            <span>Assign Workflow - {quickActionAsset?.assetTag || quickActionAsset?.assetName}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Workflow Type: <strong>{workflowModeLabel(quickActionAsset?.workflowMode)}</strong> (set by the project)
            </Typography>
            <FormControl size="small" fullWidth required>
              <InputLabel shrink>Workflow Config (Published) *</InputLabel>
              <Select
                label="Workflow Config (Published) *"
                value={assignForm.workflowConfigId}
                onChange={(e) => {
                  const cfg = workflowConfigs.find((c) => c.id === e.target.value);
                  setAssignForm({
                    workflowConfigId: e.target.value,
                    workflowTypeId: cfg ? resolveConfigWorkflowTypeId(cfg, workflowTypes) : "",
                  });
                }}
              >
                {workflowConfigs.length === 0 && (
                  <MenuItem value="" disabled>No published configs available for this product</MenuItem>
                )}
                {workflowConfigs.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                    {c.configType ? ` - ${c.configType}` : ""}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>v{c.version}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialogOpen(false)} disabled={assignSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveAssignmentFromDashboard}
            disabled={!assignForm.workflowConfigId || assignSaving}
            startIcon={assignSaving ? <CircularProgress size={16} /> : undefined}
          >
            {assignSaving ? "Saving..." : "Assign"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* WorkOrderRunner - Run workflow popup */}
      {runnerOpen && runnerWorkflow && runnerAsset && (
        <WorkOrderRunner
          open={runnerOpen}
          onClose={() => {
            setRunnerOpen(false);
            setRunnerWorkflow(null);
            setRunnerAsset(null);
            setRunnerWorkflowConfigId(undefined);
            setRunnerExistingRunId(undefined);
          }}
          workflow={runnerWorkflow}
          productId={""}
          productName={runnerAsset.assetName ?? ""}
          projectAssetId={runnerAsset.id}
          workflowConfigId={runnerWorkflowConfigId}
          existingRunId={runnerExistingRunId}
          currentUserName={user.fullName ?? ""}
          currentUserId={user.id}
          assetTag={runnerAsset.assetTag}
          jobNumber={runnerAsset.jobNumber}
          projectId={runnerAsset.projectId}
          timeZoneId={runnerProjectTimeZone}
          teamMembers={runnerTeamMembers}
          onComplete={refreshLiveDashboardDataNow}
          onPause={refreshLiveDashboardDataNow}
        />
      )}

      {/* Documents Dialog for Quick Action */}
      {docsDialogOpen && docsDialogAsset && (
        <AssetDocumentsDialog
          open={docsDialogOpen}
          onClose={() => setDocsDialogOpen(false)}
          asset={{
            id: docsDialogAsset.id,
            assetTag: docsDialogAsset.assetTag ?? "",
            assetName: docsDialogAsset.assetName,
            projectId: docsDialogAsset.projectId ?? "",
            productId: "",
            status: "NotStarted",
            featureValuesJson: "{}",
            issuesJson: "[]",
          } as any}
          currentUserName={user.fullName ?? ""}
          onDocsChanged={(assetId: string, count: number) => {
            setDocsCount(count);
          }}
          products={products}
        />
      )}

      <Snackbar
        open={!!dashboardError}
        autoHideDuration={6000}
        onClose={() => setDashboardError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setDashboardError(null)} sx={{ width: "100%" }}>
          {dashboardError}
        </Alert>
      </Snackbar>

    </Stack>
  );
};

export default Dashboard;
