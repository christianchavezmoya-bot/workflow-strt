import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, Grid,
  IconButton, InputLabel, LinearProgress, MenuItem, Paper, Select, Snackbar, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import {
  AssignmentLateOutlined, CheckCircleOutlineOutlined, CheckCircleOutlined, CloseOutlined,
  EditOutlined, ErrorOutlineOutlined,
  FactCheckOutlined, FolderOutlined, OpenInNewOutlined, PendingActionsOutlined, PersonOutlined,
  PhotoCameraOutlined, PlayArrowOutlined, PrintOutlined, ReportOutlined, SwitchAccountOutlined, TrendingUpOutlined,
  WarningAmberOutlined, WorkOutlineOutlined,
} from "@mui/icons-material";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shouldSkipBlockingFetch } from "../../services/connectivityMonitor";
import { useRepoSubscription } from "../../hooks/useRepoSubscription";
import { useProjectTimeZone } from "../../hooks/useProjectTimeZone";
import { isDashboardAttentionIssue } from "../../utils/issueAttention";
import { Link, useNavigate } from "react-router-dom";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { useCatalogPrefetch } from "../../hooks/useCatalogPrefetch";
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
  mergeDashboardWorkspaceItems,
  dedupeDashboardWorkspace,
} from "../../utils/dashboardWorkspaceMerge";
import {
  shouldFetchProjectAssetSummary,
  shouldFetchTechnicianWorkload,
} from "../../utils/dashboardFetchScope";
import { runStaggeredDashboardLiveRefresh, type DashboardLiveRefreshScope } from "../../utils/dashboardRefreshStagger";
import {
  flushHiddenDeferredRefresh,
  flushRunnerDeferredRefresh,
  INITIAL_DASHBOARD_REFRESH_DEFER_STATE,
  requestDashboardRefresh,
} from "../../utils/dashboardRefreshSchedule";
import { runPool } from "../../utils/runPool";
import { countMissingWorkflowItems, getRunMissingMediaSteps, runHasCompletedAllSteps, sanitizeMissingMediaFlags } from "../../utils/workflowCompleteness";
import { formatInstant, resolveReportTimeZone } from "../../utils/datetime";
import { resolveProjectTimeZoneForReport } from "../../utils/projectTimeZone";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import { workflowConfigService } from "../../services/workflowConfigService";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import { WorkflowAssignmentRepository } from "../../repositories/WorkflowAssignmentRepository";
import { workflowTypeService } from "../../services/workflowTypeService";
import type { MissingMediaFlag as PhotoMissingMediaFlag, PhotoUpdateNotification } from "./photoUploadTypes";
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";
import WorkflowSignatureFlowHost, { type WorkflowSignatureFlowTarget } from "../../components/ui/WorkflowSignatureFlowHost";
import AttentionItemList from "./AttentionItemList";
import DashboardAttentionItemRow from "./DashboardAttentionItemRow";
import DashboardNeedsAttentionSection from "./DashboardNeedsAttentionSection";
import DashboardInspectionAttentionSection from "./DashboardInspectionAttentionSection";
import DashboardRegionalSnapshotSection from "./DashboardRegionalSnapshotSection";
import DashboardEvidenceHealthGrid from "./DashboardEvidenceHealthGrid";
import DashboardWorkloadPanel, { type ScopedWorkloadItem, type WorkloadProjectBreakdown } from "./DashboardWorkloadPanel";
import DashboardProjectStatusGrid, { type DashboardProjectScope } from "./DashboardProjectStatusGrid";
import DashboardManagerMobileHome from "./DashboardManagerMobileHome";
import DashboardAdminInspectionWorkspace from "./DashboardAdminInspectionWorkspace";
import DashboardAdminInstallWorkspace, { type AdminInstallFilter } from "./DashboardAdminInstallWorkspace";
import DashboardInspectionInboxSection from "./DashboardInspectionInboxSection";
import { INSPECTION_INBOX_UI_ENABLED } from "../../config/productFeatureFlags";
import DashboardMyInspectionJobsToday from "./DashboardMyInspectionJobsToday";
import DashboardMyInspectionJobHistory from "./DashboardMyInspectionJobHistory";
import DashboardInstallHistoryCard from "./DashboardInstallHistoryCard";
import DashboardPendingApprovalsSection from "./DashboardPendingApprovalsSection";
import DashboardAutoAssignFlagsSection from "./DashboardAutoAssignFlagsSection";
import DashboardPhotoUpdateNotificationsSection from "./DashboardPhotoUpdateNotificationsSection";
import DashboardMissingMediaFlagsSection from "./DashboardMissingMediaFlagsSection";
import DashboardManagerMobileProjectsList from "./DashboardManagerMobileProjectsList";
import DashboardWorkspaceHeader from "./DashboardWorkspaceHeader";
import DashboardTabBar from "./DashboardTabBar";
import DashboardManagerDesktopView from "./DashboardManagerDesktopView";
import DashboardFieldTechnicianInstallView from "./DashboardFieldTechnicianInstallView";
import DashboardSupervisorInstallView from "./DashboardSupervisorInstallView";
import DashboardEngineerInstallView from "./DashboardEngineerInstallView";
import DashboardViewerView from "./DashboardViewerView";
import DashboardPmInstallWorkspace from "./DashboardPmInstallWorkspace";
import type { WorkflowAssignment, WorkflowType } from "../../types/workflowType";
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import type { Workflow } from "../../types/workflow";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { AssetIssue, ProjectAsset } from "../../types/projectAsset";
import { brandSettingsService } from "../../services/brandSettingsService";
import { featureService } from "../../services/featureService";
import type { Feature as LibFeature } from "../../types/feature";
import { randomId } from "../../utils/randomId";
import { isMobileNativePlatform } from "../../utils/platform";
import { markWorkflowOpenTap } from "../../utils/workflowOpenPerf";
import {
  loadWorkflowOpenPayload,
  refreshWorkflowOpenDataInBackground,
  OFFLINE_CONFIG_MISSING_MESSAGE,
  isOfflineConfigMissingContext,
  retryOfflineDownload,
} from "../../services/workflowOpenService";
import { getWorkflowDisplayState, type WorkflowDisplayState } from "../../utils/workflowDisplayState";
import { mediaStore } from "../../services/mediaStore";
import { buildProjectRequestKey, type ProjectRepositoryUpdateDetail } from "../../repositories/ProjectRepository";
import { get as dcGet, put as dcPut, DASHBOARD_CACHE_KEYS } from "../../services/dashboardCache";
import { entityGetAsset } from "../../services/localDB";
import { signatureService } from "../../services/signatureService";
import { notificationService } from "../../services/notificationService";
import { resolveConfigWorkflowTypeId } from "../installations/assetInstallationPageLogic";
import { filterPublishedConfigsForProject } from "../installations/assetInstallationWorkflowAssign";
import { findWorkflowType, resolveProjectWorkflowTypeId } from "../../utils/workflowTypeRules";
import {
  assetLikelyHasWorkflow,
  dashboardStatusChip,
  fmtDate,
  formatMyJobsStepCompletionLabel,
  formatStepCompletionPercent,
  isDashboardVisibleProjectStatus,
  isInProgressAsset,
  isIssueAsset,
  isInspectionWorkflowType,
  isNotStartedAsset,
  type DashboardTabSignal,
  type PmDashboardTab,
  isOpenInspectionStatus,
  isPausedAsset,
  isPendingAsset,
  myJobsAssetIdsKey,
  myJobsCardActionFromDisplayState,
  pendingSignatureStageLabel,
  pendingSignatureStageText,
  pickActiveRunForAttention,
  workflowModeChipColor,
  workflowModeLabel,
  projectStatusChipColor,
  type AutoAssignFlag,
  type MyJobsCardAction,
  type MyJobsCardWidget,
} from "./dashboardPageLogic";
import { useDashboardWorkspace } from "./useDashboardWorkspace";
import { useDashboardAttention } from "./useDashboardAttention";

const WorkOrderRunner = lazy(() => import("../workInstructions/WorkOrderRunner"));
const PhotoUploadDialog = lazy(() => import("./PhotoUploadDialog"));
const AssetDocumentsDialog = lazy(() => import("../installations/AssetDocumentsDialog"));
const DashboardWorkloadReportDialogs = lazy(() => import("./DashboardWorkloadReportDialogs"));
const DashboardQuickActionDialog = lazy(() => import("./DashboardQuickActionDialog"));
const DashboardAutoAssignConfirmDialog = lazy(() => import("./DashboardAutoAssignConfirmDialog"));
const DashboardAssignWorkflowDialog = lazy(() => import("./DashboardAssignWorkflowDialog"));

type NativeMyJobsCardContext = {
  asset: ProjectAsset;
  runs: AssetWorkflowRun[];
};

const ALL_DASHBOARDS_VALUE = "__all__";
const DASHBOARD_ASSIGNMENT_RECOVERY_KEY = "dashboard:pending-assignment-recovery";
const DASHBOARD_RUN_STATE_RECOVERY_KEY = "dashboard:pending-run-state-recovery";
const DASHBOARD_PROJECT_REQUEST_KEY = buildProjectRequestKey();

type InspectionRunSignal = {
  id: string;
  projectId: string;
  assignedUserId?: string;
  status: string;
};

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

  const [globalOffices,      setGlobalOffices]      = useState<Office[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
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
  const [signatureFlowTarget, setSignatureFlowTarget] = useState<WorkflowSignatureFlowTarget | null>(null);
  const [issueDetailTarget, setIssueDetailTarget] = useState<{
    issue: AssetIssue | RunIssue;
    assetId: string;
    runId?: string;
    source: "asset" | "run";
  } | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardNotice, setDashboardNotice] = useState<string | null>(null);
  const [installerReminderSentByRunId, setInstallerReminderSentByRunId] = useState<Record<string, boolean>>({});
  const [resolvingDashboardIssueId, setResolvingDashboardIssueId] = useState<string | null>(null);
  // Per-asset, not a shared boolean: with one flag every "View" button in Job
  // History span and disabled at once, so pressing one row looked like the app
  // had fired all of them. Mirrors the existing runnerLoading pattern.
  const [historyDialogLoading, setHistoryDialogLoading] = useState<string | null>(null);
  const dashboardRefreshTimerRef = useRef<number | null>(null);
  const dashboardRefreshDeferRef = useRef(INITIAL_DASHBOARD_REFRESH_DEFER_STATE);
  const runnerOpenRef = useRef(false);
  const dashboardRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const dashboardRefreshQueuedRef = useRef(false);
  const dashboardRefreshQueuedScopeRef = useRef<DashboardLiveRefreshScope>("light");
  const dashboardWebAttentionBootedRef = useRef(false);

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
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>(isAdmin ? ALL_DASHBOARDS_VALUE : user.id);

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

  const {
    dashboardWorkspace,
    dashboardWorkspaceRef,
    workspaceLoading,
    setWorkspaceLoading,
    cacheHydrated,
    setCacheHydrated,
    dashboardBootPhase,
    applyDashboardWorkspace,
    effectiveDashboardWorkspaceUserId,
  } = useDashboardWorkspace({
    isAuthenticated,
    isNativePlatform,
    isViewer,
    isManager,
    userId: user.id,
    selectedDashboardId,
    shouldUseDashboardWorkspaceSessionCache,
  });

  const markNativeDashboardCacheHydrated = useCallback(() => {
    setCacheHydrated(true);
  }, [setCacheHydrated]);

  const {
    openIssues,
    setOpenIssues,
    pendingSigs,
    attentionLoading,
    loadAttention,
    refreshAttentionFromIssueCache,
  } = useDashboardAttention({
    isManager,
    isNativePlatform,
    userId: user.id,
    onNativeCacheHydrated: markNativeDashboardCacheHydrated,
  });

  const issueDetailProjectId = useMemo(
    () => (issueDetailTarget
      ? openIssues.find((issue) => issue.issueId === issueDetailTarget.issue.id)?.projectId
      : undefined),
    [issueDetailTarget, openIssues],
  );
  const issueDetailTimeZone = useProjectTimeZone(issueDetailProjectId);

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

  // ── Native cache hydration: show last-known data instantly on mount ──
  useEffect(() => {
    if (!isNativePlatform) return;
    const cOpenAssets = dcGet<OpenAssetItem[]>(DASHBOARD_CACHE_KEYS.openAssets);
    const cSummary = dcGet<ProjectAssetSummaryItem[]>(DASHBOARD_CACHE_KEYS.projectAssetSummary);
    const cWorkload = dcGet<TechnicianWorkloadSummaryItem[]>(DASHBOARD_CACHE_KEYS.workload);
    const cOffices = dcGet<Office[]>(DASHBOARD_CACHE_KEYS.globalOffices);
    const cCountries = dcGet<string[]>(DASHBOARD_CACHE_KEYS.availableCountries);
    if (cOpenAssets) setOpenAssets(cOpenAssets);
    if (cSummary) setProjectAssetSummary(cSummary);
    if (cWorkload) setWorkload(cWorkload);
    if (cOffices) setGlobalOffices(cOffices);
    if (cCountries) setAvailableCountries(cCountries);
    // Mark cache as hydrated so loading spinners don't override cached data
    if (cOpenAssets || cSummary || cWorkload || cOffices || cCountries) {
      setCacheHydrated(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // AppShell's useShellCatalogBootstrap already warms these three catalogs after auth;
  // this covers the case where that fetch failed (e.g. offline at launch).
  useCatalogPrefetch(isAuthenticated && dashboardBootPhase === "full");

  useEffect(() => {
    if (!isAuthenticated || dashboardBootPhase !== "full") return;

    // Must run BEFORE the platform branches below: the web branch returns a cleanup
    // function, which previously made a trailing `if (isEngineer)` block unreachable on
    // web and silently left the Draft Workflows panel empty there. Gated to the tab that
    // renders that panel; the web service call is SWR-cached so switching tabs is cheap.
    if (isEngineer && pmDashboardTab === "my-installs") {
      workflowConfigService.getAll().then((configs) => {
        setDraftConfigs(configs.filter((c: { status?: string }) => c.status === "Draft" || c.status === "draft"));
      }).catch(() => {});
    }
  }, [
    dashboardBootPhase,
    isAuthenticated,
    isEngineer,
    pmDashboardTab,
  ]);

  // Attention + workload fetches — intentionally NOT tied to catalog slice updates.
  // Previously this effect re-ran on every projects/products/users load transition and
  // stamped open-issues/pending-signatures dozens of times on web cold start.
  useEffect(() => {
    if (!isAuthenticated || dashboardBootPhase !== "full") return;

    if (isNativePlatform) {
      seedNativeDashboardSummariesFromLocal();
      setWorkloadLoading(false);
      void loadAttention();
      if (shouldSkipBlockingFetch()) return undefined;

      // Same stagger as web: attention first, then workload, then open-assets /
      // active-summary so native Dashboard boot does not Promise.all the heavy
      // endpoints against a 10s timeout budget.
      const workloadTimer = needsTechnicianWorkload
        ? window.setTimeout(() => {
            void projectAssetService.technicianWorkloadSummary()
              .then((w) => { setWorkload(w); dcPut(DASHBOARD_CACHE_KEYS.workload, w); })
              .catch(() => {});
          }, 1200)
        : undefined;
      const summaryTimer = window.setTimeout(() => {
        void projectAssetService.listOpen()
          .then((a) => { setOpenAssets(a); dcPut(DASHBOARD_CACHE_KEYS.openAssets, a); })
          .catch(() => {});
        if (needsProjectAssetSummary) {
          void projectAssetService.activeSummary()
            .then((s) => { setProjectAssetSummary(s); dcPut(DASHBOARD_CACHE_KEYS.projectAssetSummary, s); })
            .catch(() => setProjectAssetSummary([]));
        }
      }, 800);
      return () => {
        if (workloadTimer !== undefined) window.clearTimeout(workloadTimer);
        window.clearTimeout(summaryTimer);
      };
    }

    if (dashboardWebAttentionBootedRef.current) return;
    dashboardWebAttentionBootedRef.current = true;

    // Web cold-start: stagger heavy SQLite reads so attention/workload/open-assets
    // do not stampede the API on first paint (session cache still paints immediately).
    void loadAttention().catch(() => {});
    const workloadTimer = needsTechnicianWorkload
      ? window.setTimeout(() => {
          setWorkloadLoading(true);
          projectAssetService.technicianWorkloadSummary()
            .then((w) => { setWorkload(w); })
            .catch(() => {})
            .finally(() => setWorkloadLoading(false));
        }, 1200)
      : undefined;
    const summaryTimer = window.setTimeout(() => {
      projectAssetService.listOpen().then(setOpenAssets).catch(() => {});
      if (needsProjectAssetSummary) {
        projectAssetService.activeSummary().then(setProjectAssetSummary).catch(() => setProjectAssetSummary([]));
      }
    }, 800);
    return () => {
      if (workloadTimer !== undefined) window.clearTimeout(workloadTimer);
      window.clearTimeout(summaryTimer);
    };
  }, [
    dashboardBootPhase,
    isAuthenticated,
    isNativePlatform,
    loadAttention,
    needsProjectAssetSummary,
    needsTechnicianWorkload,
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

  const refreshLiveDashboardDataNow = useCallback((scope: DashboardLiveRefreshScope = "full"): Promise<void> => {
    if (dashboardRefreshInFlightRef.current) {
      dashboardRefreshQueuedRef.current = true;
      if (scope === "full") dashboardRefreshQueuedScopeRef.current = "full";
      return dashboardRefreshInFlightRef.current;
    }

    const activeScope = scope;
    const promise = (async () => {
      if (isNativePlatform) {
        seedNativeDashboardSummariesFromLocal();
        // Skip local workspace seed while a network refresh is in flight — it races
        // with the server response and caused MY INSTALLS to flicker 2 ↔ 3.
      }
      setWorkspaceLoading(true);
      try {
        await runStaggeredDashboardLiveRefresh({
          workspace: () => projectAssetService
            .dashboardWorkspace(effectiveDashboardWorkspaceUserId)
            .then((data) => { applyDashboardWorkspace(data); })
            .catch(() => { /* keep last-good workspace on a failed manual refresh */ }),
          attention: () => loadAttention({ silent: true }),
          listOpen: () => projectAssetService.listOpen().then(setOpenAssets),
          activeSummary: needsProjectAssetSummary
            ? () => projectAssetService.activeSummary().then(setProjectAssetSummary).catch(() => setProjectAssetSummary([]))
            : undefined,
          workload: needsTechnicianWorkload
            ? () => projectAssetService.technicianWorkloadSummary()
              .then(setWorkload)
              .catch(() => {})
            : undefined,
        }, activeScope);
        setAnalyticsRefreshTick((t) => t + 1);
      } finally {
        setWorkspaceLoading(false);
      }
    })();

    dashboardRefreshInFlightRef.current = promise.finally(() => {
      dashboardRefreshInFlightRef.current = null;
      if (dashboardRefreshQueuedRef.current) {
        dashboardRefreshQueuedRef.current = false;
        const nextScope = dashboardRefreshQueuedScopeRef.current;
        dashboardRefreshQueuedScopeRef.current = "light";
        void refreshLiveDashboardDataNow(nextScope);
      }
    });

    return dashboardRefreshInFlightRef.current;
  }, [
    applyDashboardWorkspace,
    effectiveDashboardWorkspaceUserId,
    isNativePlatform,
    loadAttention,
    needsProjectAssetSummary,
    needsTechnicianWorkload,
    seedNativeDashboardSummariesFromLocal,
  ]);

  const enqueueDashboardRefresh = useCallback((scope: DashboardLiveRefreshScope) => {
    if (dashboardRefreshTimerRef.current !== null) {
      window.clearTimeout(dashboardRefreshTimerRef.current);
    }
    const delayMs = isNativePlatform ? 650 : 400;
    dashboardRefreshTimerRef.current = window.setTimeout(() => {
      dashboardRefreshTimerRef.current = null;
      void refreshLiveDashboardDataNow(scope);
    }, delayMs);
  }, [isNativePlatform, refreshLiveDashboardDataNow]);

  const scheduleDashboardRefresh = useCallback((scope: DashboardLiveRefreshScope = "full") => {
    const result = requestDashboardRefresh(dashboardRefreshDeferRef.current, {
      scope,
      runnerOpen: runnerOpenRef.current,
      documentHidden: typeof document !== "undefined" && document.hidden,
    });
    dashboardRefreshDeferRef.current = result.next;
    if (result.schedule && result.scopeToRun) {
      enqueueDashboardRefresh(result.scopeToRun);
    }
  }, [enqueueDashboardRefresh]);

  const refreshLiveDashboardData = useCallback(() => {
    scheduleDashboardRefresh("full");
  }, [scheduleDashboardRefresh]);

  const refreshLiveDashboardDataLight = useCallback(() => {
    scheduleDashboardRefresh("light");
  }, [scheduleDashboardRefresh]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) return;
      const flush = flushHiddenDeferredRefresh(dashboardRefreshDeferRef.current);
      dashboardRefreshDeferRef.current = flush.next;
      if (flush.schedule && flush.scopeToRun) {
        enqueueDashboardRefresh(flush.scopeToRun);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enqueueDashboardRefresh]);

  useEffect(() => () => {
    if (dashboardRefreshTimerRef.current !== null) {
      window.clearTimeout(dashboardRefreshTimerRef.current);
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

  // Drop stale flags written before required/optional media was respected.
  useEffect(() => {
    if (dashboardBootPhase !== "full" || missingMediaFlags.length === 0) return;
    let cancelled = false;
    void (async () => {
      const runs = await Promise.all(
        missingMediaFlags.map((flag) => assetWorkflowRunService.getByIdLocalFirst(flag.runId)),
      );
      if (cancelled) return;
      const runsById = new Map(
        runs.filter((run): run is AssetWorkflowRun => Boolean(run)).map((run) => [run.id, run]),
      );
      const sanitized = sanitizeMissingMediaFlags(missingMediaFlags, runsById);
      if (sanitized.length === missingMediaFlags.length) return;
      localStorage.setItem("pm_missing_media_flags", JSON.stringify(sanitized));
      setMissingMediaFlags(sanitized);
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardBootPhase, missingMediaFlags]);

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
      refreshLiveDashboardData();
    };
    window.addEventListener("notifications:assignments-changed", refresh);
    return () => window.removeEventListener("notifications:assignments-changed", refresh);
  }, [dashboardBootPhase, refreshLiveDashboardData]);

  // Notification-driven refresh: run state events -> workspace + attention only (not open/workload storm)
  useEffect(() => {
    if (dashboardBootPhase !== "full") return;
    window.addEventListener("notifications:run-state-changed", refreshLiveDashboardDataLight);
    window.addEventListener("notifications:refresh", refreshLiveDashboardData);
    // Also listen for asset-level changes dispatched by AssetRepository (and
    // forwarded by offline issue mutations) so the workspace + attention
    // counts refresh live when assets change offline - not only when the
    // notifications:* events happen to be fired alongside.
    window.addEventListener("repo:assets:updated", refreshLiveDashboardDataLight);
    window.addEventListener("repo:issues:updated", refreshAttentionFromIssueCache);
    // Assignment and run caches refresh in the background on native and emit
    // these when they land. Without listening, the dashboard kept rendering the
    // pre-refresh snapshot while other screens (the Assets page listens to
    // repo:assignments:updated) recovered correctly — so the dashboard alone
    // stayed wrong until a manual reload.
    window.addEventListener("repo:assignments:updated", refreshLiveDashboardData);
    window.addEventListener("repo:runs:updated", refreshLiveDashboardDataLight);
    const onFlushComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ syncedAny?: boolean; pendingRemaining?: number }>).detail;
      if (detail?.syncedAny && detail.pendingRemaining === 0) {
        refreshLiveDashboardData();
      }
    };
    window.addEventListener("sync-engine:flush-complete", onFlushComplete);
    return () => {
      window.removeEventListener("notifications:run-state-changed", refreshLiveDashboardDataLight);
      window.removeEventListener("notifications:refresh", refreshLiveDashboardData);
      window.removeEventListener("repo:assets:updated", refreshLiveDashboardDataLight);
      window.removeEventListener("repo:issues:updated", refreshAttentionFromIssueCache);
      window.removeEventListener("repo:assignments:updated", refreshLiveDashboardData);
      window.removeEventListener("repo:runs:updated", refreshLiveDashboardDataLight);
      window.removeEventListener("sync-engine:flush-complete", onFlushComplete);
    };
  }, [dashboardBootPhase, refreshAttentionFromIssueCache, refreshLiveDashboardData, refreshLiveDashboardDataLight]);

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
  const highIssues = visibleOpenIssues.filter((i) => isDashboardAttentionIssue(i));
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
      setDashboardError(message);
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
  const assetAttentionLabel = useCallback(
    (record: {
      projectId?: string | null;
      jobNumber?: string | null;
      assetTag?: string | null;
      assetName?: string | null;
    }) => {
      const project = record.projectId ? projectById.get(record.projectId) : undefined;
      const jobNumber = record.jobNumber || project?.jobNumber || "No job";
      const assetLabel = record.assetTag || record.assetName || "Asset";
      return `${jobNumber}: ${assetLabel}`;
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
      const { generateWorkflowReport, resolveImageToDataUrl } = await import("../../utils/generateWorkflowReport");
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
        timeZoneId: await resolveProjectTimeZoneForReport(projects.find((project) => project.id === asset.projectId)),
        signatureEvents,
        productFeatures,
        outputMode: "open",
      });
    } finally {
      setHistoryDialogLoading((current) => (current === assetItem.id ? null : current));
    }
  }, [navigate, projects, user.fullName]);

  function issueFromOpenRecord(record: OpenIssueRecord): AssetIssue | RunIssue {
    return {
      id: record.issueId,
      description: record.description,
      issueType: record.issueType,
      severity: record.severity,
      isBlocking: record.isBlocking,
      reportedAt: record.reportedAt,
      createdBy: record.createdBy ?? undefined,
      stepTitle: record.stepTitle ?? undefined,
      resolved: false,
      reportMedia: [],
      resolutionMedia: [],
    };
  }

  const openIssueRepair = useCallback(async (issue: OpenIssueRecord) => {
    setQuickActionOpen(false);

    if (issue.source === "asset") {
      const asset = await projectAssetService.getById(issue.assetId);
      if (asset) {
        let issues: AssetIssue[] = [];
        try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
        const matchedIssue = issues.find((item) => item.id === issue.issueId) ?? issueFromOpenRecord(issue) as AssetIssue;
        setIssueDetailTarget({
          issue: matchedIssue,
          assetId: asset.id,
          source: "asset",
        });
        return;
      }
    }

    if (issue.source === "run") {
      const run = await assetWorkflowRunService.getByIdLocalFirst(issue.runId)
        ?? await assetWorkflowRunService.getById(issue.runId);
      if (run) {
        let issues: RunIssue[] = [];
        try { issues = JSON.parse(run.issuesJson || "[]"); } catch {}
        const matchedIssue = issues.find((item) => item.id === issue.issueId) ?? issueFromOpenRecord(issue) as RunIssue;
        setIssueDetailTarget({
          issue: matchedIssue,
          assetId: issue.assetId,
          runId: run.id,
          source: "run",
        });
        return;
      }
    }

    // Last resort: open dialog from the attention index alone (offline when entity
    // blob is missing but the issue row was bootstrapped into IndexedDB).
    setIssueDetailTarget({
      issue: issueFromOpenRecord(issue),
      assetId: issue.assetId,
      runId: issue.source === "run" ? issue.runId : undefined,
      source: issue.source,
    });
  }, []);

  const handleDashboardIssueSave = useCallback(async (updatedIssue: AssetIssue | RunIssue) => {
    if (!issueDetailTarget) return;
    const shouldCloseDialog = Boolean(updatedIssue.resolved);
    const openIssuesBeforeClose = openIssues;
    if (shouldCloseDialog) {
      setResolvingDashboardIssueId(updatedIssue.id);
      setOpenIssues((prev) => prev.filter((issue) => issue.issueId !== updatedIssue.id));
    }

    try {
      if (issueDetailTarget.source === "asset") {
        const asset = await projectAssetService.getById(issueDetailTarget.assetId);
        let issues: AssetIssue[] = [];
        if (asset) {
          try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
        }
        if (issues.some((item) => item.id === updatedIssue.id)) {
          issues = issues.map((item) => item.id === updatedIssue.id ? updatedIssue as AssetIssue : item);
        } else {
          issues = [...issues, updatedIssue as AssetIssue];
        }
        const refreshedAsset = await projectAssetService.patchIssues(issueDetailTarget.assetId, JSON.stringify(issues));
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
        const run = await assetWorkflowRunService.getByIdLocalFirst(issueDetailTarget.runId)
          ?? await assetWorkflowRunService.getById(issueDetailTarget.runId);
        let issues: RunIssue[] = [];
        if (run) {
          try { issues = JSON.parse(run.issuesJson || "[]"); } catch {}
        }
        if (issues.some((item) => item.id === updatedIssue.id)) {
          issues = issues.map((item) => item.id === updatedIssue.id ? updatedIssue as RunIssue : item);
        } else {
          issues = [...issues, updatedIssue as RunIssue];
        }
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
    } catch (err) {
      if (shouldCloseDialog) {
        setOpenIssues(openIssuesBeforeClose);
      }
      setDashboardError(err instanceof Error ? err.message : "Failed to save issue. Try again when back online.");
      throw err;
    } finally {
      if (shouldCloseDialog) {
        setResolvingDashboardIssueId(null);
      }
    }
  }, [issueDetailTarget, openIssues, refreshDashboardAfterIssueUpdate]);

  const openSignatureRepair = useCallback(async (sig: PendingSignatureRecord) => {
    setQuickActionOpen(false);
    setQuickActionAsset(null);
    setQuickActionAssignments([]);
    setQuickActionRuns([]);
    try {
      const [asset, run] = await Promise.all([
        projectAssetService.getById(sig.assetId),
        assetWorkflowRunService.getById(sig.runId),
      ]);
      if (!asset || !run) {
        setDashboardError("Could not open sign-off for this asset.");
        return;
      }

      if (isPendingInstallerSignature(run.signatureStatus) && isManager) {
        if (!asset.assignedUserId) {
          setDashboardError("This asset does not have an assigned installer.");
          return;
        }

        await signatureService.createToken({
          runId: run.id,
          signerRole: "Installer",
          expiresInHours: 72,
          customMessage: `Please review the completed workflow for ${asset.assetTag} and provide your installer sign-off using the link below.`,
        });
        await notificationService.create({
          eventType: "installer-signature-reminder",
          severity: "warning",
          title: "Installer sign-off required",
          message: `${asset.assetTag} on job ${sig.jobNumber || projectById.get(sig.projectId)?.jobNumber || "unknown"} is waiting for your sign-off.`,
          recipientUserIds: [asset.assignedUserId],
          projectId: asset.projectId,
          assetId: asset.id,
          runId: run.id,
          entityType: "project-asset",
          entityId: asset.id,
        });
        setInstallerReminderSentByRunId((prev) => ({ ...prev, [run.id]: true }));
        window.setTimeout(() => {
          setInstallerReminderSentByRunId((prev) => {
            const next = { ...prev };
            delete next[run.id];
            return next;
          });
        }, 4000);
        setDashboardNotice("Installer sign-off reminder sent.");
        return;
      }

      if (isPendingCustomerSignature(run.signatureStatus) && isManager) {
        setSignatureFlowTarget({
          asset,
          run,
          jobNumber: sig.jobNumber || projectById.get(sig.projectId)?.jobNumber,
        });
        return;
      }

      navigate(buildAssetRepairPath({
        projectId: sig.projectId,
        assetId: sig.assetId,
        action: "signature",
        runId: sig.runId,
      }));
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDashboardError(message || "Could not open sign-off. Check your connection and try again.");
    }
  }, [buildAssetRepairPath, isManager, navigate, projectById]);

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
    if (myInstallAssets.length === 0) {
      setNativeMyJobsCardContext({});
      return;
    }

    let cancelled = false;
    void (async () => {
      if (!isNativePlatform) {
        // Let workspace + attention boot finish before per-asset card enrichment.
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        if (cancelled) return;
      }

      const results: Array<readonly [string, NativeMyJobsCardContext] | null> = [];
      if (isNativePlatform) {
        const entries = await Promise.all(
          myInstallAssets.map(async (asset) => {
            const [cachedAsset, runs] = await Promise.all([
              entityGetAsset(asset.id),
              assetWorkflowRunService.listLocalByAsset(asset.id),
            ]);
            const data = cachedAsset?.data as ProjectAsset | undefined;
            if (!data) return null;
            return [asset.id, { asset: data, runs }] as const;
          }),
        );
        results.push(...entries);
      } else {
        await runPool(myInstallAssets, 2, async (asset) => {
          if (cancelled || shouldSkipBlockingFetch()) return;
          const [fullAsset, runs] = await Promise.all([
            projectAssetService.getById(asset.id).catch(() => null),
            assetWorkflowRunService.listByAsset(asset.id).catch(() => [] as AssetWorkflowRun[]),
          ]);
          if (!fullAsset) return;
          results.push([asset.id, { asset: fullAsset, runs }]);
        });
      }

      if (cancelled) return;
      setNativeMyJobsCardContext((prev) => {
        const fresh: Record<string, NativeMyJobsCardContext> = {};
        for (const entry of results) {
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

  const nativeMyJobsDisplayStateByAssetId = useMemo(() => {
    const map = new Map<string, WorkflowDisplayState>();
    for (const asset of myInstallAssets) {
      const ctx = nativeMyJobsCardContext[asset.id];
      if (!ctx) continue;
      map.set(asset.id, getWorkflowDisplayState(ctx.asset, ctx.runs, {
        paused: isPausedAsset(asset.runStatus),
        inspectionMode: asset.workflowMode === "INSPECTION_ONLY",
        hasRunnableWorkflowSource:
          ctx.runs.length > 0
          || !!ctx.asset.productConfigId
          || !!ctx.asset.workflowTemplateId
          || !!ctx.asset.workflowSummary?.hasWorkflow,
      }));
    }
    return map;
  }, [myInstallAssets, nativeMyJobsCardContext]);

  useEffect(() => {
    const handler = (event: Event) => {
      const assetId = (event as CustomEvent<{ assetId?: string }>).detail?.assetId;
      if (!assetId) return;
      const loadRuns = isNativePlatform
        ? assetWorkflowRunService.listLocalByAsset(assetId)
        : shouldSkipBlockingFetch()
          ? Promise.resolve(null)
          : assetWorkflowRunService.listByAsset(assetId);
      void loadRuns.then((runs) => {
        if (!runs) return;
        setNativeMyJobsCardContext((prev) => {
          const existing = prev[assetId];
          if (!existing) return prev;
          return { ...prev, [assetId]: { ...existing, runs } };
        });
      });
    };
    window.addEventListener("workflow-runs-cache-updated", handler as EventListener);
    return () => window.removeEventListener("workflow-runs-cache-updated", handler as EventListener);
  }, [isNativePlatform]);

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

  // While online, refresh assignments only for My Jobs assets with no local cache yet.
  // Full workspace prefetch already warms assignments for assigned assets; this fills
  // gaps without re-fetching every asset on each dashboard boot (request storm).
  useEffect(() => {
    if (!isNativePlatform || myInstallAssets.length === 0 || shouldSkipBlockingFetch()) return;
    let cancelled = false;
    void (async () => {
      for (const asset of myInstallAssets) {
        if (cancelled) return;
        const local = await WorkflowAssignmentRepository.getLocalByAsset(asset.id).catch(() => []);
        if (local.length === 0) {
          void assetWorkflowAssignmentService.listByAsset(asset.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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
  const [runnerSignoffReviewMode, setRunnerSignoffReviewMode] = useState(false);
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
    const { missing, allRequired } = getRunMissingMediaSteps(latestRun);
    if (missing.length <= 0) return null;
    const totalExpected = allRequired.length;
    const totalCaptured = allRequired.filter((step) => step.captured > 0).length;
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
  }, [user.fullName]);

  const validateMissingMediaFlag = useCallback((flag: MissingMediaFlag | null, run: AssetWorkflowRun | null) => {
    if (!flag) return null;
    if (!run || flag.runId !== run.id) return flag;
    return getRunMissingMediaSteps(run).missing.length > 0 ? flag : null;
  }, []);

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
    return validateMissingMediaFlag(latestRunFlag, latestRun)
      ?? fallbackMissingMedia
      ?? validateMissingMediaFlag(assetLevelFlag, latestRun);
  }, [buildFallbackMissingMediaFlag, missingMediaFlags, validateMissingMediaFlag]);

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
      highObservations: assetIssues.filter((issue) => isDashboardAttentionIssue(issue)),
      pendingSignature:
        pendingSigs.find(
          (sig) => sig.assetId === quickActionAsset.id
        ) ?? null,
      missingMedia: resolveMissingMediaForAsset(quickActionAsset, quickActionRuns),
      activeRun: pickActiveRunForAttention(sortedRuns),
      latestRun,
    };
  }, [openIssues, pendingSigs, quickActionAsset, quickActionRuns, resolveMissingMediaForAsset]);

  const getMyJobsCardAction = useCallback((asset: QuickActionAsset): MyJobsCardAction => {
    const displayState = nativeMyJobsDisplayStateByAssetId.get(asset.id);
    if (displayState) {
      return myJobsCardActionFromDisplayState(displayState, isNativePlatform);
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
    const hasMissingMedia = hasMissingMediaFallback || evidenceMissing || (
      Boolean(missingMediaFlag) && effectiveMissingCount > 0
    );

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
  }, [isNativePlatform, missingMediaFlags, nativeMyJobsDisplayStateByAssetId, pendingSigs]);

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
      (isNativePlatform
        ? assetWorkflowRunService.listLocalByAsset(asset.id)
        : assetWorkflowRunService.listByAsset(asset.id)
      ).catch(() => [] as AssetWorkflowRun[]),
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
      highObservations: assetIssues.filter((issue) => isDashboardAttentionIssue(issue)),
      pendingSignature:
        pendingSigs.find(
          (sig) => sig.assetId === asset.id
        ) ?? null,
      missingMedia: resolveMissingMediaForAsset(asset, runs),
      activeRun: pickActiveRunForAttention(sortedRuns),
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
      if (attention.pendingSignature) {
        openSignatureRepair(attention.pendingSignature);
        return;
      }
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

  async function handleMyJobsAssetTap(asset: QuickActionAsset, cardAction?: MyJobsCardAction) {
    const action = cardAction ?? getMyJobsCardAction(asset);
    if (action.actionKind === "missing-media") {
      await openMissingMediaFromDashboardAsset(asset);
      return;
    }
    if (action.actionKind === "resolve-blocking") {
      const blockingIssue = openIssues.find((issue) => issue.assetId === asset.id && issue.isBlocking);
      if (blockingIssue) {
        setRunnerLoading(asset.id);
        try {
          await openIssueRepair(blockingIssue);
        } finally {
          setRunnerLoading((current) => (current === asset.id ? null : current));
        }
        return;
      }
    }
    const pendingSignature = pendingSigs.find((sig) => sig.assetId === asset.id);
    if (action.actionKind === "signature" || pendingSignature) {
      if (pendingSignature) {
        openSignatureRepair(pendingSignature);
        return;
      }
    }
    await openQuickActionOrStart(asset);
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
          setDashboardError(OFFLINE_CONFIG_MISSING_MESSAGE);
          retryOfflineDownload();
        } else {
          setDashboardError("Workflow config not found.");
        }
        return false;
      }
      if (payload.workflow.steps.length === 0) {
        setDashboardError("This workflow has no steps defined.");
        return false;
      }
      setRunnerExistingRunId(options?.existingRunId ?? payload.existingRunId);
      setRunnerAsset(asset);
      setRunnerWorkflow(payload.workflow);
      setRunnerWorkflowConfigId(configId);
      runnerOpenRef.current = true;
      setRunnerOpen(true);
      refreshWorkflowOpenDataInBackground(asset.id, configId);
      options?.onOpened?.();
      return true;
    } catch {
      setDashboardError("Failed to load workflow.");
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
        label: "Review Observation / Scope",
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
      const project = dashboardProjects.find((item) => item.id === quickActionAsset.projectId) ?? null;
      setWorkflowConfigs(filterPublishedConfigsForProject(cfgs, types, project));
    } catch {
      setWorkflowConfigs([]);
    }
  }

  async function saveAssignmentFromDashboard() {
    if (!quickActionAsset || !assignForm.workflowConfigId) return;
    const cfg = workflowConfigs.find((c) => c.id === assignForm.workflowConfigId);
    const workflowTypeId = cfg ? resolveConfigWorkflowTypeId(cfg, workflowTypes) || (cfg.workflowTypeId ?? "") : "";
    if (!workflowTypeId) {
      setDashboardError("Could not determine the workflow type for this config. Reconnect and try again.");
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
      setDashboardError("Failed to assign workflow. Please try again.");
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
      isDashboardAttentionIssue(issue) &&
      myInstallAssets.some((asset) => asset.id === issue.assetId)
    ),
    [openIssues, myInstallAssets]
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
      isDashboardAttentionIssue(issue) &&
      myInspectionAssets.some((asset) => asset.id === issue.assetId)
    ),
    [openIssues, myInspectionAssets]
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
  const showInspectionInbox = INSPECTION_INBOX_UI_ENABLED
    && (inspectionRunsDue > 0 || inspectionImportsWaiting > 0 || inspectionImportsFailed > 0);
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

  const MyInspectionJobsToday = (
    <DashboardMyInspectionJobsToday
      assets={myInspectionAssets}
      workspaceLoading={workspaceLoading}
      runnerLoadingAssetId={runnerLoading}
      getCardAction={getMyJobsCardAction}
      onAssetTap={(asset, cardAction) => void handleMyJobsAssetTap(asset, cardAction)}
      onViewAll={() => navigate("/installations/assets?workflowType=Inspection")}
    />
  );

  const MyInspectionJobHistory = (
    <DashboardMyInspectionJobHistory
      history={myInspectionHistory}
      onNavigateToInspectionAssets={() => navigate("/installations/assets?workflowType=Inspection")}
    />
  );

  async function handleGenerateTechReport(w: TechnicianWorkloadSummaryItem) {
    setReportingTechId(w.userId);
    try {
      const techAssets = openAssets.filter((a) => a.assignedUserId === w.userId);
      const reportTz = await resolveProjectTimeZoneForReport(projects.find((project) => project.id === techAssets[0]?.projectId));
      const exportDate = formatInstant(new Date().toISOString(), reportTz, { time: false, withZone: false });
      const assetIds = new Set(techAssets.map((a) => a.id));

      // Runs carry the time tracking and issue data the report is built from. Web batches
      // one scoped request per project; native goes per asset because that path reads the
      // offline run cache first and so still produces a report with no connection.
      let runs: AssetWorkflowRun[] = [];
      if (assetIds.size > 0) {
        if (isNativePlatform) {
          const perAsset = await Promise.all(
            techAssets.map((a) => assetWorkflowRunService.listLocalByAsset(a.id).catch(() => [])),
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
        projectTimeZoneId: reportTz,
      };
      await generateTechnicianReport(reportData);
    } catch {
      setDashboardError("Could not build the workload report. Check your connection and try again.");
    } finally { setReportingTechId(null); }
  }
  const MyInspectionAttentionSection = (
    <DashboardInspectionAttentionSection
      myInspectionAttentionCount={myInspectionAttentionCount}
      attentionLoading={attentionLoading}
      myInspectionBlocking={myInspectionBlocking}
      myInspectionPendingSigs={myInspectionPendingSigs}
      myInspectionHighObservations={myInspectionHighObservations}
      resolvingDashboardIssueId={resolvingDashboardIssueId}
      isManager={isManager}
      installerReminderSentByRunId={installerReminderSentByRunId}
      assetAttentionLabel={assetAttentionLabel}
      onOpenIssue={openIssueRepair}
      onOpenSignature={openSignatureRepair}
    />
  );

  const NeedsAttentionSection = (
    <DashboardNeedsAttentionSection
      attentionCount={attentionCount}
      attentionLoading={attentionLoading}
      blockingIssues={blockingIssues}
      overdueProjects={overdueProjects}
      visiblePendingSigs={visiblePendingSigs}
      highIssues={highIssues}
      isAdmin={isAdmin}
      assetAttentionLabel={assetAttentionLabel}
      projectAttentionLabel={projectAttentionLabel}
      onOpenIssue={openIssueRepair}
      onOpenSignature={openSignatureRepair}
      onNavigateToProject={(projectId) => navigate(`/projects/${projectId}`)}
    />
  );

  const RegionalSnapshotSection = (
    <DashboardRegionalSnapshotSection
      activeOffice={activeOffice}
      availableCountries={availableCountries}
      projects={projects}
      globalOffices={globalOffices}
      openAssets={openAssets}
      countryForOffice={countryForOffice}
      onSelectRegion={(region) => {
        updateActiveOffice(region);
        navigate("/projects");
      }}
    />
  );

  const ProjectStatusGrid = (
    <DashboardProjectStatusGrid
      isAdmin={isAdmin}
      isManager={isManager}
      canViewAllProjects={canViewAllProjects}
      dashboardProjects={dashboardProjects}
      projectsMissingPmCount={projectsMissingPm.length}
      dashboardProjectScope={dashboardProjectScope}
      onDashboardProjectScopeChange={setDashboardProjectScope}
      viewedDashboardUserId={viewedDashboardUserId}
      viewingOwnDashboard={viewingOwnDashboard}
      viewedDashboardUserName={viewedDashboardUser?.fullName}
      getProjectCompletionMetrics={getProjectCompletionMetrics}
      isReadyToCloseProject={isReadyToCloseProject}
      productNameById={productNameById}
      closingDashboardProjectId={closingDashboardProjectId}
      onCloseProject={(projectId) => void closeProjectFromDashboard(projectId)}
      onNavigateToProjectAssets={(project) => navigate(projectAssetsPath(project))}
    />
  );

  const AdminInspectionWorkspace = (
    <DashboardAdminInspectionWorkspace
      inspectionScopeProjects={inspectionScopeProjects}
      inspectionScopeAssets={inspectionScopeAssets}
      onNavigateToProject={(projectId) => navigate(`/projects/${projectId}`)}
    />
  );

  const AdminInstallWorkspace = (
    <DashboardAdminInstallWorkspace
      installProjectsWithOpenAssets={installProjectsWithOpenAssets}
      totalInstallAssetCount={totalInstallAssetCount}
      installScopeAssets={installScopeAssets}
      adminInstallFilter={adminInstallFilter}
      onAdminInstallFilterChange={setAdminInstallFilter}
      filteredAdminInstallAssets={filteredAdminInstallAssets}
      filteredAdminInstallProjects={filteredAdminInstallProjects}
      adminInstallProjectsOpen={adminInstallProjectsOpen}
      onAdminInstallProjectsOpenChange={setAdminInstallProjectsOpen}
      adminInstallPmFilter={adminInstallPmFilter}
      onAdminInstallPmFilterChange={setAdminInstallPmFilter}
      adminInstallProjectFilter={adminInstallProjectFilter}
      onAdminInstallProjectFilterChange={setAdminInstallProjectFilter}
      projectPmLabel={projectPmLabel}
      onNavigateToInstallations={() => navigate("/installations/assets")}
      onNavigateToProject={(projectId) => navigate(`/projects/${projectId}`)}
    />
  );

  const EvidenceHealthGrid = (
    <DashboardEvidenceHealthGrid
      sectionRef={analyticsSectionCallbackRef}
      evidenceWindow={evidenceWindow}
      onEvidenceWindowChange={setEvidenceWindow}
      evidenceLoading={evidenceLoading}
      evidenceData={evidenceData}
      evidenceError={evidenceError}
      healthWindow={healthWindow}
      onHealthWindowChange={setHealthWindow}
      healthLoading={healthLoading}
      healthData={healthData}
      healthError={healthError}
      onNavigateToProject={(projectId) => navigate(`/projects/${projectId}`)}
    />
  );

  const WorkloadPanel = (
    <DashboardWorkloadPanel
      scopedWorkload={scopedWorkload}
      workloadLoading={workloadLoading}
      cacheHydrated={cacheHydrated}
      expandedWorkloadId={expandedWorkloadId}
      onExpandedWorkloadIdChange={setExpandedWorkloadId}
      openAssets={openAssets}
      projectById={projectById}
      onOpenAllReports={() => setWorkloadReportAllOpen(true)}
      onOpenTechnicianReport={setWorkloadReportTarget}
      onNavigateToProject={(projectId) => navigate(`/projects/${projectId}`)}
    />
  );

  const InspectionInboxSection = showInspectionInbox ? (
    <DashboardInspectionInboxSection
      inspectionRunsDue={inspectionRunsDue}
      inspectionImportsWaiting={inspectionImportsWaiting}
      inspectionImportsFailed={inspectionImportsFailed}
      onNavigateToInspectionAssets={() => navigate("/installations/assets?workflowType=Inspection")}
    />
  ) : null;

  const managerMobileProjectsTab = (
    <>
      <DashboardManagerMobileProjectsList
        projects={dashboardProjects}
        canViewAllProjects={canViewAllProjects}
        dashboardProjectScope={dashboardProjectScope}
        onDashboardProjectScopeChange={setDashboardProjectScope}
        onNavigateToProjects={() => navigate("/projects")}
        onNavigateToProjectAssets={(project) => navigate(projectAssetsPath(project))}
        getProjectCompletionMetrics={getProjectCompletionMetrics}
      />

      {pendingApprovals.length > 0 && (
        <DashboardPendingApprovalsSection
          projects={pendingApprovals}
          onNavigateToProject={(projectId) => navigate(`/projects/${projectId}`)}
          emphasized
        />
      )}

      {NeedsAttentionSection}

      <DashboardAutoAssignFlagsSection
        flags={autoAssignFlags}
        onFlagsChange={setAutoAssignFlags}
        onNavigateToAssets={() => navigate("/installations/assets")}
      />

      {InspectionInboxSection}
      {EvidenceHealthGrid}
      {WorkloadPanel}
    </>
  );

  const managerMobileInspectionsTab = (
    <>
      {MyInspectionJobsToday}
      {MyInspectionAttentionSection}
      {MyInspectionJobHistory}
      {InspectionInboxSection}
      <Box className="glass-card" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora" }}>Inspection Projects</Typography>
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
    </>
  );

  const managerMobileInstallsTab = (
    <DashboardPmInstallWorkspace
      myInstallAssets={myInstallAssets}
      myInstallHistory={myInstallHistory}
      historyLoadingAssetId={historyDialogLoading}
      isNativePlatform={isNativePlatform}
      onNavigateToAssets={() => navigate("/installations/assets")}
      onOpenHistory={(asset) => { void openHistoryReport(asset); }}
    />
  );

  const ManagerMobileHome = (
    <DashboardManagerMobileHome
      userFullName={user.fullName}
      userRole={user.role}
      userId={user.id}
      activeOffice={activeOffice}
      overviewActiveCount={overviewActiveCount}
      overviewPausedCount={overviewPausedCount}
      overviewQueuedCount={overviewQueuedCount}
      overviewPendingCount={overviewPendingCount}
      isAdmin={isAdmin}
      dashboardUsers={dashboardUsers}
      viewingOwnDashboard={viewingOwnDashboard}
      viewedDashboardUser={viewedDashboardUser ?? null}
      selectedDashboardId={selectedDashboardId}
      allDashboardsValue={ALL_DASHBOARDS_VALUE}
      onSelectedDashboardIdChange={setSelectedDashboardId}
      mobileManagerTab={mobileManagerTab}
      onMobileManagerTabChange={setMobileManagerTab}
      projectTabSignal={projectTabSignal}
      inspectionTabSignal={inspectionTabSignal}
      installTabSignal={installTabSignal}
      renderTabLabel={renderDashboardTabLabel}
      projectsTab={managerMobileProjectsTab}
      inspectionsTab={managerMobileInspectionsTab}
      installsTab={managerMobileInstallsTab}
    />
  );

  return (
    <Stack spacing={3}>

      {showNativeManagerHome && ManagerMobileHome}

      {!isViewer && !showNativeManagerHome && (
        <DashboardWorkspaceHeader
          showAdminOverviewStrip={showAdminOverviewStrip}
          viewingOwnDashboard={viewingOwnDashboard}
          userFullName={user.fullName ?? ""}
          userRole={user.role ?? ""}
          viewedDashboardUser={viewedDashboardUser ? { id: viewedDashboardUser.id, fullName: viewedDashboardUser.fullName ?? "", role: viewedDashboardUser.role ?? "" } : null}
          isManager={isManager}
          isAdmin={isAdmin}
          dashboardUsers={dashboardUsers.map((dashboardUser) => ({ id: dashboardUser.id, fullName: dashboardUser.fullName ?? "", role: dashboardUser.role ?? "" }))}
          selectedDashboardId={selectedDashboardId}
          allDashboardsValue={ALL_DASHBOARDS_VALUE}
          userId={user.id}
          pmDashboardTab={pmDashboardTab}
          overviewActiveCount={overviewActiveCount}
          overviewPausedCount={overviewPausedCount}
          overviewQueuedCount={overviewQueuedCount}
          overviewPendingCount={overviewPendingCount}
          overviewBlockingCount={overviewBlockingCount}
          onSelectedDashboardIdChange={setSelectedDashboardId}
        />
      )}
      {showTabBar && (
        <DashboardTabBar
          pmDashboardTab={pmDashboardTab}
          showPmProjectsTab={showPmProjectsTab}
          hasInspectionsTab={hasInspectionsTab}
          isAdmin={isAdmin}
          projectTabSignal={projectTabSignal}
          inspectionTabSignal={inspectionTabSignal}
          installTabSignal={installTabSignal}
          renderTabLabel={renderDashboardTabLabel}
          onTabChange={handleDashboardTabChange}
        />
      )}

      {/* My Inspections tab content - non-manager users */}
      {showTabBar && !isManager && pmDashboardTab === "my-inspections" && MyInspectionJobsToday}
      {showTabBar && !isManager && pmDashboardTab === "my-inspections" && MyInspectionAttentionSection}
      {showTabBar && !isManager && pmDashboardTab === "my-inspections" && MyInspectionJobHistory}
      {showTabBar && !isManager && pmDashboardTab === "my-inspections" && InspectionInboxSection}


      {canActAsFieldTechnician && pmDashboardTab === "my-installs" && (
        <DashboardFieldTechnicianInstallView
          inspectionRunsDue={inspectionRunsDue}
          myInstallAssets={myInstallAssets}
          isNativePlatform={isNativePlatform}
          runnerLoadingAssetId={runnerLoading}
          photoReminders={photoReminders}
          missingMediaFlags={missingMediaFlags}
          technicianUserId={user.id}
          attentionLoading={attentionLoading}
          myInstallAttentionCount={myInstallAttentionCount}
          myInstallBlocking={myInstallBlocking}
          myInstallPendingSigs={myInstallPendingSigs}
          myInstallHighObservations={myInstallHighObservations}
          resolvingDashboardIssueId={resolvingDashboardIssueId}
          myInstallHistory={myInstallHistory}
          historyDialogLoading={historyDialogLoading}
          getMyJobsCardAction={getMyJobsCardAction}
          assetAttentionLabel={assetAttentionLabel}
          onOpenInspections={() => navigate("/installations/assets?workflowType=Inspection")}
          onAssetTap={(asset, cardAction) => { void handleMyJobsAssetTap(asset, cardAction); }}
          onViewAllAssets={() => navigate("/installations/assets")}
          onPhotoRemindersChange={setPhotoReminders}
          onMissingMediaFlagsChange={setMissingMediaFlags}
          onUploadPhotos={(flag) => {
            setPhotoUploadMode("installer");
            setPhotoUploadTarget(flag);
          }}
          onOpenIssueRepair={openIssueRepair}
          onOpenSignatureRepair={openSignatureRepair}
          onOpenHistory={(asset) => { void openHistoryReport(asset); }}
        />
      )}

      {isSupervisor && pmDashboardTab === "my-installs" && (
        <DashboardSupervisorInstallView
          needsAttentionSection={NeedsAttentionSection}
          workloadPanel={WorkloadPanel}
          unassignedAssets={unassignedAssets}
          notStartedAssets={notStartedAssets}
          installHistory={myInstallHistory}
          historyLoadingAssetId={historyDialogLoading}
          isNativePlatform={isNativePlatform}
          onNavigateToAssets={() => navigate("/installations/assets")}
          onOpenHistory={(asset) => { void openHistoryReport(asset); }}
        />
      )}

      {isEngineer && pmDashboardTab === "my-installs" && (
        <DashboardEngineerInstallView
          needsAttentionSection={NeedsAttentionSection}
          pendingSignatures={myInstallPendingSigs}
          draftConfigs={draftConfigs}
          assetAttentionLabel={assetAttentionLabel}
          onOpenSignatureRepair={openSignatureRepair}
          onNavigateToWorkInstructions={() => navigate("/work-instructions")}
        />
      )}

      {isManager && !showNativeManagerHome && (
        <DashboardManagerDesktopView
          pmDashboardTab={pmDashboardTab}
          projectStatusGrid={ProjectStatusGrid}
          needsAttentionSection={NeedsAttentionSection}
          inspectionTabContent={(
            <>
              {!isAdmin && MyInspectionJobsToday}
              {!isAdmin && MyInspectionAttentionSection}
              {!isAdmin && MyInspectionJobHistory}
              {!isAdmin && InspectionInboxSection}
              {isAdmin && AdminInspectionWorkspace}
            </>
          )}
          pmProjectsTabContent={(
            <>
              <DashboardPendingApprovalsSection
                projects={pendingApprovals}
                onNavigateToProject={(projectId) => navigate(`/projects/${projectId}`)}
              />
              {InspectionInboxSection}
              <DashboardAutoAssignFlagsSection
                flags={autoAssignFlags}
                onFlagsChange={setAutoAssignFlags}
                onNavigateToAssets={() => navigate("/installations/assets")}
                assignedByLabel="to"
              />
              <DashboardPhotoUpdateNotificationsSection
                notifications={photoUpdateNotifications}
                onNotificationsChange={setPhotoUpdateNotifications}
              />
              <DashboardMissingMediaFlagsSection
                variant="pm"
                flags={missingMediaFlags}
                onFlagsChange={setMissingMediaFlags}
                onOpenRepair={openMissingMediaRepair}
                reminderSentId={reminderSentId}
                onReminderSent={(flagId) => {
                  setReminderSentId(flagId);
                  setTimeout(() => setReminderSentId(null), 2000);
                }}
                sentByName={user.fullName ?? "PM"}
              />
              {RegionalSnapshotSection}
              {EvidenceHealthGrid}
              {WorkloadPanel}
            </>
          )}
          installTabContent={isAdmin ? AdminInstallWorkspace : (
            <DashboardPmInstallWorkspace
              myInstallAssets={myInstallAssets}
              myInstallHistory={myInstallHistory}
              historyLoadingAssetId={historyDialogLoading}
              isNativePlatform={isNativePlatform}
              onNavigateToAssets={() => navigate("/installations/assets")}
              onOpenHistory={(asset) => { void openHistoryReport(asset); }}
            />
          )}
        />
      )}

      {isViewer && (
        <DashboardViewerView
          statusGroups={statusGroups}
          projectCount={projectCount}
          needsAttentionSection={NeedsAttentionSection}
          regionalSnapshotSection={RegionalSnapshotSection}
        />
      )}

      <Suspense fallback={null}>
        <DashboardWorkloadReportDialogs
          reportTarget={workloadReportTarget}
          allReportsOpen={workloadReportAllOpen}
          scopedWorkload={scopedWorkload}
          openAssets={openAssets}
          projectById={projectById}
          reportingTechId={reportingTechId}
          isNativePlatform={isNativePlatform}
          onCloseTarget={() => setWorkloadReportTarget(null)}
          onCloseAll={() => setWorkloadReportAllOpen(false)}
          onGenerateTechReport={(target) => { void handleGenerateTechReport(target); }}
        />
      </Suspense>

      {/* Photo upload dialog - installer adds missing photos to a completed run */}
      {photoUploadTarget && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {issueDetailTarget && (
        <IssueDetailDialog
          open={!!issueDetailTarget}
          issue={issueDetailTarget.issue}
          currentUser={user.fullName ?? user.email ?? "User"}
          timeZoneId={issueDetailTimeZone}
          hideComments
          hideResolutionMedia
          onClose={() => setIssueDetailTarget(null)}
          onSave={(updated) => void handleDashboardIssueSave(updated as AssetIssue | RunIssue)}
        />
      )}

      <WorkflowSignatureFlowHost
        target={signatureFlowTarget}
        assignedTechnician={user.fullName ?? undefined}
        canRequestCustomerSignature={isManager}
        onClose={() => setSignatureFlowTarget(null)}
        onComplete={() => { void loadAttention(); }}
      />

      <Suspense fallback={null}>
        <DashboardQuickActionDialog
          open={quickActionOpen}
          loading={quickActionLoading}
          asset={quickActionAsset}
          attention={quickActionAttention}
          assignments={quickActionAssignments}
          runs={quickActionRuns}
          productWorkflow={productWorkflow}
          primaryAction={quickActionPrimaryAction}
          docsLoading={docsLoading}
          docsCount={docsCount}
          runnerLoadingAssetId={runnerLoading}
          offlineConfigMissingBlock={
            !!(quickActionAsset
              && assetLikelyHasWorkflow(quickActionAsset, nativeMyJobsCardContext[quickActionAsset.id]?.asset)
              && isOfflineConfigMissingContext())
          }
          offlineConfigMissingMessage={OFFLINE_CONFIG_MISSING_MESSAGE}
          onClose={closeQuickActionDialog}
          onNavigateToAssets={() => {
            closeQuickActionDialog();
            navigate("/installations/assets");
          }}
          onOpenDocuments={() => {
            if (quickActionAsset) {
              setDocsDialogAsset(quickActionAsset);
              setDocsDialogOpen(true);
              closeQuickActionDialog();
            }
          }}
          onEditAsset={() => {
            closeQuickActionDialog();
            navigate("/installations/assets");
          }}
          onRetryOfflineDownload={() => { void retryOfflineDownload(); }}
          onOpenAssignDialog={() => { void openAssignDialogFromDashboard(); }}
          onLaunchProductWorkflow={(workflow) => {
            if (quickActionAsset) {
              launchProductWorkflowFromDashboard(quickActionAsset, workflow);
            }
          }}
          onStartAssignment={(assignment) => {
            if (quickActionAsset) {
              checkAssignmentThenStartFromDashboard(quickActionAsset, assignment);
            }
          }}
          onOpenInspectionImport={() => {
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
          assetLikelyHasWorkflowFn={assetLikelyHasWorkflow}
          nativeAssetContext={quickActionAsset ? nativeMyJobsCardContext[quickActionAsset.id]?.asset : undefined}
        />
      </Suspense>

      <Suspense fallback={null}>
        <DashboardAutoAssignConfirmDialog
          open={!!autoAssignConfirm}
          asset={autoAssignConfirm?.asset ?? null}
          reason={autoAssignConfirm?.reason ?? "unassigned"}
          otherName={autoAssignConfirm?.otherName}
          userFullName={user.fullName ?? undefined}
          onClose={() => setAutoAssignConfirm(null)}
          onConfirm={confirmAutoAssignAndStartFromDashboard}
        />
      </Suspense>

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

      <Suspense fallback={null}>
        <DashboardAssignWorkflowDialog
          open={assignDialogOpen}
          saving={assignSaving}
          assetLabel={quickActionAsset?.assetTag || quickActionAsset?.assetName}
          workflowMode={quickActionAsset?.workflowMode}
          projectWorkflowTypeName={
            quickActionAsset
              ? (() => {
                  const project = dashboardProjects.find((item) => item.id === quickActionAsset.projectId);
                  if (!project) return undefined;
                  return findWorkflowType(workflowTypes, resolveProjectWorkflowTypeId(project))?.name;
                })()
              : undefined
          }
          workflowConfigs={workflowConfigs}
          workflowTypes={workflowTypes}
          assignForm={assignForm}
          onAssignFormChange={setAssignForm}
          onClose={() => setAssignDialogOpen(false)}
          onSave={() => { void saveAssignmentFromDashboard(); }}
        />
      </Suspense>

      {/* WorkOrderRunner - Run workflow popup */}
      {runnerOpen && runnerWorkflow && runnerAsset && (
        <Suspense fallback={null}>
        <WorkOrderRunner
          open={runnerOpen}
          onClose={() => {
            runnerOpenRef.current = false;
            setRunnerOpen(false);
            setRunnerWorkflow(null);
            setRunnerAsset(null);
            setRunnerWorkflowConfigId(undefined);
            setRunnerExistingRunId(undefined);
            setRunnerSignoffReviewMode(false);
            const flush = flushRunnerDeferredRefresh(dashboardRefreshDeferRef.current);
            dashboardRefreshDeferRef.current = flush.next;
            if (flush.schedule && flush.scopeToRun) {
              enqueueDashboardRefresh(flush.scopeToRun);
            }
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
          signoffReviewMode={runnerSignoffReviewMode}
          onComplete={() => { scheduleDashboardRefresh("light"); }}
          onPause={() => { scheduleDashboardRefresh("light"); }}
        />
        </Suspense>
      )}

      {/* Documents Dialog for Quick Action */}
      {docsDialogOpen && docsDialogAsset && (
        <Suspense fallback={null}>
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
        </Suspense>
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
      <Snackbar
        open={!!dashboardNotice}
        autoHideDuration={5000}
        onClose={() => setDashboardNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setDashboardNotice(null)} sx={{ width: "100%" }}>
          {dashboardNotice}
        </Alert>
      </Snackbar>

    </Stack>
  );
};

export default Dashboard;
