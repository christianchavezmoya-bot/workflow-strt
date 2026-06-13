import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, Grid,
  IconButton, InputLabel, LinearProgress, MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import {
  AssessmentOutlined, AssignmentLateOutlined, CheckCircleOutlineOutlined, CloseOutlined,
  EditOutlined, ErrorOutlineOutlined, ExpandLessOutlined, ExpandMoreOutlined,
  FactCheckOutlined, FolderOutlined, OpenInNewOutlined, PendingActionsOutlined, PersonOutlined,
  PhotoCameraOutlined, PlayArrowOutlined, PrintOutlined, ReportOutlined, SwitchAccountOutlined, TrendingDownOutlined, TrendingFlatOutlined, TrendingUpOutlined,
  WarningAmberOutlined, WorkOutlineOutlined,
} from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProjects, setProjects } from "../../store/projectSlice";
import { fetchProducts } from "../../store/productsSlice";
import { officesService } from "../../services/officesService";
import { assetWorkflowRunService, type OpenIssueRecord, type PendingSignatureRecord } from "../../services/assetWorkflowRunService";
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
import { generateTechnicianReport, type TechnicianReportData } from "../../utils/generateTechnicianReport";
import { countMissingWorkflowItems, runHasCompletedAllSteps } from "../../utils/workflowCompleteness";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import { workflowConfigService } from "../../services/workflowConfigService";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import { workflowTypeService } from "../../services/workflowTypeService";
import PhotoUploadDialog, { type MissingMediaFlag as PhotoMissingMediaFlag, type PhotoUpdateNotification } from "./PhotoUploadDialog";
import WorkOrderRunner from "../workInstructions/WorkOrderRunner";
import AssetDocumentsDialog from "../installations/AssetDocumentsDialog";
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";
import type { WorkflowAssignment, WorkflowType } from "../../types/workflowType";
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import type { Workflow } from "../../types/workflow";
import type { AssetIssue } from "../../types/projectAsset";
import { brandSettingsService } from "../../services/brandSettingsService";
import { generateWorkflowReport, resolveImageToDataUrl } from "../../utils/generateWorkflowReport";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function isPausedAsset(status?: string | null) {
  return (status ?? "").toLowerCase() === "paused";
}

function isInProgressAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase();
  return value === "inprogress" || value === "in progress";
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

function isWaitingForSignature(signatureStatus?: string | null) {
  const value = (signatureStatus ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "pendingcustomer" || value === "pendinginstaller";
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

function displayRunState(asset: { runStatus?: string | null; status?: string | null; signatureStatus?: string | null; evidenceStatus?: string | null }) {
  // Check for Issue status first (highest priority for attention)
  if (isIssueAsset(asset.status) || isIssueAsset(asset.runStatus)) return "Issue";
  if ((asset.evidenceStatus ?? "").toLowerCase() === "missingdata") return "Missing";
  if (isPausedAsset(asset.runStatus)) return "Paused";
  if (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)) return "In Progress";
  if (isNotStartedAsset(asset.status)) return "Not Started";
  if (isPendingAsset(asset.status)) return "Pending";
  return asset.runStatus || asset.status || "Unknown";
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
  if (value === "completed" || value === "finished" || value === "closed") return "success";
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

const WINDOW_OPTIONS = [30, 60, 90, 180];

const ALL_DASHBOARDS_VALUE = "__all__";

type PmDashboardTab = "pm-projects" | "my-inspections" | "my-installs";
type DashboardProjectScope = "mine" | "all";

type InspectionRunSignal = {
  id: string;
  projectId: string;
  assignedUserId?: string;
  status: string;
};

type AdminInstallFilter = "all" | "in-progress" | "unassigned";

type WorkloadProjectBreakdown = { projectId: string; jobNumber: string; notStarted: number; pending: number; inProgress: number; paused: number; total: number };
type ScopedWorkloadItem = {
  userId: string; fullName: string;
  notStarted: number; pending: number; inProgress: number; paused: number; totalAssigned: number;
  jobNumbers: string[]; hasIssues: boolean; completedSteps: number; totalSteps: number;
  startedAt?: string; projectBreakdown: WorkloadProjectBreakdown[];
};

function isDashboardVisibleProjectStatus(status?: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return normalized !== "completed"
    && normalized !== "cancelled"
    && normalized !== "closed"
    && normalized !== "archived";
}

const Dashboard = () => {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const can        = usePermissions();
  const isAdmin      = user.role === "Admin";
  const isManager    = user.role === "Admin" || user.role === "Project Manager";
  const isSupervisor = user.role === "Supervisor";
  const isEngineer   = user.role === "Engineer" || user.role === "QA Inspector";
  const isViewer     = user.role === "Viewer" || user.role === "Client";
  const canActAsFieldTechnician = !!can.installationAssets?.runWorkflow && !isViewer;
  const isNativePlatform = Capacitor.isNativePlatform();
  const showNativeManagerHome = isManager && isNativePlatform;

  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const dispatch      = useAppDispatch();
  const projects      = useAppSelector((s) => s.projects.items);
  const products      = useAppSelector((s) => s.products.items);

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

  // Phase 1 workspace
  const [workspaceExpanded, setWorkspaceExpanded] = useState(!isEngineer ? false : true);

  // Phase 4 - evidence
  const [evidenceData,    setEvidenceData]    = useState<EvidenceCompleteness | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceWindow,  setEvidenceWindow]  = useState(90);

  // Phase 5 - workflow health
  const [healthData,    setHealthData]    = useState<WorkflowHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthWindow,  setHealthWindow]  = useState(90);

  // Incremented by run-state events to trigger analytics re-fetch
  const [analyticsRefreshTick, setAnalyticsRefreshTick] = useState(0);

  // For Engineer: draft workflow configs
  const [draftConfigs, setDraftConfigs] = useState<{id:string; name:string; updatedAt?:string}[]>([]);
  // For Supervisor: runs completed today count
  const [completedToday, setCompletedToday] = useState(0);

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
  const [photoUploadMode, setPhotoUploadMode] = useState<"installer" | "pm">("installer");
  const [reminderSentId, setReminderSentId] = useState<string | null>(null);
  const [issueDetailLoading, setIssueDetailLoading] = useState(false);
  const [issueDetailTarget, setIssueDetailTarget] = useState<{
    issue: AssetIssue | RunIssue;
    assetId: string;
    runId?: string;
    source: "asset" | "run";
  } | null>(null);
  const [historyDialogLoading, setHistoryDialogLoading] = useState(false);

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
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  // Admin: view another user's dashboard
  type DashboardUserEntry = { id: string; fullName: string; role: string; office: string };
  const [dashboardUsers, setDashboardUsers] = useState<DashboardUserEntry[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>(isAdmin ? ALL_DASHBOARDS_VALUE : user.id);

  const countryForOffice = useMemo(() => createCountryResolver(globalOffices), [globalOffices]);
  const officeIdsForRegion = useMemo(() => {
    if (activeOffice === "All") return null;
    return new Set(globalOffices.filter((o) => o.country === activeOffice).map((o) => o.id));
  }, [activeOffice, globalOffices]);

  useEffect(() => {
    officesService.getAll().then((offices) => {
      setGlobalOffices(offices);
      setAvailableCountries(Array.from(new Set(offices.map((o) => o.country).filter(Boolean))).sort());
    });
  }, []);

  useEffect(() => {
    if (!isManager) return;
    api.get<DashboardUserEntry[]>("/users")
      .then((res) => setDashboardUsers(res.data.filter((u) => u.id !== user.id)))
      .catch(() => {});
  }, [isManager, user.id]);

  const loadAttention = useCallback(async () => {
    setAttentionLoading(true);
    try {
      const [iss, sigs] = await Promise.all([
        assetWorkflowRunService.listOpenIssues(user.id),
        assetWorkflowRunService.listPendingSignatures(user.id),
      ]);
      setOpenIssues(iss);
      setPendingSigs(sigs);
    } finally {
      setAttentionLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    dispatch(fetchProjects());
    dispatch(fetchProducts());
    loadAttention();
    setWorkloadLoading(true);
    projectAssetService.technicianWorkloadSummary().then(setWorkload).finally(() => setWorkloadLoading(false));
    projectAssetService.listOpen().then(setOpenAssets);
    projectAssetService.activeSummary().then(setProjectAssetSummary).catch(() => setProjectAssetSummary([]));
    if (isEngineer) {
      workflowConfigService.getAll().then((configs) => {
        setDraftConfigs(configs.filter((c: any) => c.status === "Draft" || c.status === "draft"));
      }).catch(() => {});
    }
  }, [dispatch, loadAttention, isEngineer]);

  // When the background project refresh completes, apply the authoritative list directly to
  // Redux state — avoids a second API round-trip while still evicting any ghost projects.
  useEffect(() => {
    const handleUpdated = (e: Event) => {
      const { items } = (e as CustomEvent<{ items: import("../../types/project").Project[] }>).detail;
      dispatch(setProjects({ items, total: items.length }));
    };
    window.addEventListener("repo:projects:updated", handleUpdated);
    return () => window.removeEventListener("repo:projects:updated", handleUpdated);
  }, [dispatch]);

  useEffect(() => {
    if (isViewer) {
      setDashboardWorkspace({
        currentInstalls: [],
        currentInspections: [],
        installHistory: [],
        inspectionHistory: [],
      });
      return;
    }

    let cancelled = false;
    setWorkspaceLoading(true);
    projectAssetService
      .dashboardWorkspace(isManager && selectedDashboardId !== ALL_DASHBOARDS_VALUE ? selectedDashboardId : undefined)
      .then((data) => {
        if (!cancelled) setDashboardWorkspace(data);
      })
      .finally(() => {
        if (!cancelled) setWorkspaceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isManager, isViewer, selectedDashboardId]);

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

  // Notification-driven refresh: assignment events → workload + workspace + open assets
  useEffect(() => {
    const refresh = () => {
      setWorkloadLoading(true);
      projectAssetService.technicianWorkloadSummary().then(setWorkload).finally(() => setWorkloadLoading(false));
      projectAssetService.listOpen().then(setOpenAssets);
      setWorkspaceLoading(true);
      projectAssetService
        .dashboardWorkspace(isManager && selectedDashboardId !== ALL_DASHBOARDS_VALUE ? selectedDashboardId : undefined)
        .then((data) => setDashboardWorkspace(data))
        .finally(() => setWorkspaceLoading(false));
    };
    window.addEventListener("notifications:assignments-changed", refresh);
    return () => window.removeEventListener("notifications:assignments-changed", refresh);
  }, [isManager, selectedDashboardId]);

  // Notification-driven refresh: run state events → workspace + open assets + attention items + analytics
  useEffect(() => {
    const refresh = () => {
      projectAssetService.listOpen().then(setOpenAssets);
      projectAssetService.activeSummary().then(setProjectAssetSummary).catch(() => setProjectAssetSummary([]));
      setWorkspaceLoading(true);
      projectAssetService
        .dashboardWorkspace(isManager && selectedDashboardId !== ALL_DASHBOARDS_VALUE ? selectedDashboardId : undefined)
        .then((data) => setDashboardWorkspace(data))
        .finally(() => setWorkspaceLoading(false));
      loadAttention();
      setAnalyticsRefreshTick((t) => t + 1);
    };
    window.addEventListener("notifications:run-state-changed", refresh);
    return () => window.removeEventListener("notifications:run-state-changed", refresh);
  }, [isManager, selectedDashboardId, loadAttention]);

  // Phase 4 - evidence completeness
  useEffect(() => {
    if (!isManager) return;
    setEvidenceLoading(true);
    dashboardService.evidenceCompleteness(evidenceWindow)
      .then(setEvidenceData)
      .catch(() => setEvidenceData(null))
      .finally(() => setEvidenceLoading(false));
  }, [isManager, evidenceWindow, analyticsRefreshTick]);

  // Phase 5 - workflow health
  useEffect(() => {
    if (!isManager) return;
    setHealthLoading(true);
    dashboardService.workflowHealth(healthWindow)
      .then(setHealthData)
      .catch(() => setHealthData(null))
      .finally(() => setHealthLoading(false));
  }, [isManager, healthWindow, analyticsRefreshTick]);
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

  // Workload derived from visibleOpenAssets so it respects the My/All scope filter.
  // Cross-references the full workload API data for step counts, issue flags, and fullName.
  const scopedWorkload = useMemo(() => {
    type PBEntry = { projectId: string; jobNumber: string; notStarted: number; pending: number; inProgress: number; paused: number; total: number };
    const byUser = new Map<string, { assets: OpenAssetItem[]; breakdown: Map<string, PBEntry> }>();

    for (const asset of visibleOpenAssets) {
      if (!asset.assignedUserId) continue;
      if (!byUser.has(asset.assignedUserId))
        byUser.set(asset.assignedUserId, { assets: [], breakdown: new Map() });
      const entry = byUser.get(asset.assignedUserId)!;
      entry.assets.push(asset);
      if (!entry.breakdown.has(asset.projectId))
        entry.breakdown.set(asset.projectId, { projectId: asset.projectId, jobNumber: asset.jobNumber ?? "", notStarted: 0, pending: 0, inProgress: 0, paused: 0, total: 0 });
      const pb = entry.breakdown.get(asset.projectId)!;
      pb.total++;
      if (isPausedAsset(asset.runStatus)) pb.paused++;
      else if (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)) pb.inProgress++;
      else if (isIssueAsset(asset.status)) pb.inProgress++;
      else if (isPendingAsset(asset.status)) pb.pending++;
      else if (isNotStartedAsset(asset.status)) pb.notStarted++;
    }

    return [...byUser.entries()]
      .map(([userId, data]) => {
        const api = workload.find((w) => w.userId === userId);
        const assets = data.assets;
        return {
          userId,
          fullName: api?.fullName ?? userId,
          paused:        assets.filter((a) => isPausedAsset(a.runStatus)).length,
          inProgress:    assets.filter((a) => !isPausedAsset(a.runStatus) && (isInProgressAsset(a.runStatus) || isInProgressAsset(a.status))).length,
          notStarted:    assets.filter((a) => !isPausedAsset(a.runStatus) && !isInProgressAsset(a.runStatus) && !isInProgressAsset(a.status) && isNotStartedAsset(a.status)).length,
          pending:       assets.filter((a) => !isPausedAsset(a.runStatus) && !isInProgressAsset(a.runStatus) && !isInProgressAsset(a.status) && isPendingAsset(a.status)).length,
          totalAssigned: assets.length,
          jobNumbers:    [...new Set(assets.map((a) => a.jobNumber).filter(Boolean))] as string[],
          hasIssues:     api?.hasIssues ?? false,
          completedSteps: api?.completedSteps ?? 0,
          totalSteps:     api?.totalSteps ?? 0,
          startedAt:      api?.startedAt,
          projectBreakdown: [...data.breakdown.values()],
        };
      })
      .filter((w) => w.totalAssigned > 0)
      .sort((a, b) => b.totalAssigned - a.totalAssigned);
  }, [visibleOpenAssets, workload]);
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
    return activeDashboardProjects.filter((project) =>
      String(project.projectManager ?? "").trim().toLowerCase() === String(user.fullName ?? "").trim().toLowerCase()
    );
  }, [activeDashboardProjects, dashboardProjectOwnerName, scopedProjects, user.fullName, viewedDashboardUserId]);
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
    await Promise.all([
      loadAttention(),
      projectAssetService.listOpen().then(setOpenAssets),
      projectAssetService.activeSummary().then(setProjectAssetSummary).catch(() => setProjectAssetSummary([])),
      projectAssetService
        .dashboardWorkspace(isManager && selectedDashboardId !== ALL_DASHBOARDS_VALUE ? selectedDashboardId : undefined)
        .then((data) => setDashboardWorkspace(data))
        .catch(() => {}),
    ]);
    setAnalyticsRefreshTick((t) => t + 1);
  }, [isManager, loadAttention, selectedDashboardId]);

  const openHistoryReport = useCallback(async (assetItem: DashboardWorkspaceAssetItem) => {
    setHistoryDialogLoading(true);
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
      const [brandSettings, signatureEvents] = await Promise.all([
        brandSettingsService.get(),
        latestRun.isLocked ? import("../../services/signatureService").then(({ signatureService }) => signatureService.listEvents(latestRun.id)) : Promise.resolve([]),
      ]);
      const bizLogoResolved = brandSettings.logoBase64
        ? await resolveImageToDataUrl(brandSettings.logoBase64)
        : null;
      await generateWorkflowReport({
        run: latestRun,
        asset,
        workflowConfigName: configName,
        businessLogoBase64: bizLogoResolved,
        customerName: projects.find((project) => project.id === asset.projectId)?.customerName,
        jobNumber: projects.find((project) => project.id === asset.projectId)?.jobNumber,
        siteName: projects.find((project) => project.id === asset.projectId)?.siteName,
        siteLocation: asset.location ?? undefined,
        assignedTechnician: user.fullName ?? undefined,
        signatureEvents,
        outputMode: "open",
      });
    } finally {
      setHistoryDialogLoading(false);
    }
  }, [navigate, projects, user.fullName]);

  const openIssueRepair = useCallback(async (issue: OpenIssueRecord) => {
    setIssueDetailLoading(true);
    try {
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
    } finally {
      setIssueDetailLoading(false);
    }
  }, [buildAssetRepairPath, navigate]);

  const handleDashboardIssueSave = useCallback(async (updatedIssue: AssetIssue | RunIssue) => {
    if (!issueDetailTarget) return;

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
      if (refreshedIssue) {
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
      if (refreshedIssue) {
        setIssueDetailTarget({
          issue: refreshedIssue,
          assetId: issueDetailTarget.assetId,
          runId: refreshedRun.id,
          source: "run",
        });
      }
    }

    await refreshDashboardAfterIssueUpdate();
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

  const inspectionProjects = useMemo(
    () => dashboardProjects.filter((p) => p.workflowMode === "INSPECTION_ONLY" || p.workflowMode === "MIXED"),
    [dashboardProjects]
  );
  const inspectionProjectIds = useMemo(
    () => new Set(inspectionProjects.map((p) => p.id)),
    [inspectionProjects]
  );
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
          <Button
            size="small"
            variant="outlined"
            startIcon={historyDialogLoading ? <CircularProgress size={12} /> : <OpenInNewOutlined fontSize="small" />}
            disabled={historyDialogLoading}
            onClick={(e) => {
              e.stopPropagation();
              void openHistoryReport(asset);
            }}
            sx={{ minWidth: 0, px: 1.1 }}
          >
            View
          </Button>
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
  const [runnerLoading, setRunnerLoading] = useState<string | null>(null);
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
  const [workflowConfigs, setWorkflowConfigs] = useState<{ id: string; name: string; workflowTypeId: string }[]>([]);
  // Product-based workflow for assets without explicit assignment
  const [productWorkflow, setProductWorkflow] = useState<{ configId: string; configName: string; workflowTypeId?: string } | null>(null);

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
    const fallbackMissingMedia =
      latestRun && runHasCompletedAllSteps(latestRun) && countMissingWorkflowItems(latestRun) > 0
        ? {
            id: `run-missing-${latestRun.id}`,
            runId: latestRun.id,
            assetId: quickActionAsset.id,
            assetTag: quickActionAsset.assetTag || quickActionAsset.assetName || quickActionAsset.id,
            jobNumber: quickActionAsset.jobNumber,
            workflowName: "Workflow",
            technicianUserId: quickActionAsset.assignedUserId ?? "",
            technicianName: user.fullName ?? "",
            completedAt: latestRun.completedAt ?? latestRun.updatedAt ?? latestRun.startedAt,
            missingSteps: [],
            totalExpected: 0,
            totalCaptured: 0,
          }
        : null;
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
      missingMedia:
        missingMediaFlags.find(
          (flag) => flag.assetId === quickActionAsset.id || flag.runId === sortedRuns[0]?.id
        ) ?? fallbackMissingMedia,
      activeRun: sortedRuns.find((run) => !run.isLocked) ?? null,
      latestRun,
    };
  }, [missingMediaFlags, openIssues, pendingSigs, quickActionAsset, quickActionRuns, user.fullName]);

  type DashboardProductWorkflow = { configId: string; configName: string; workflowTypeId?: string } | null;

  async function resolveProductWorkflowForAsset(
    fullAsset: Awaited<ReturnType<typeof projectAssetService.getById>>,
    assignments: WorkflowAssignment[],
  ): Promise<DashboardProductWorkflow> {
    if (assignments.length > 0 || !fullAsset?.productConfigId) return null;
    try {
      const cfg = await workflowConfigService.getById(fullAsset.productConfigId);
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

  function getQuickActionAttentionForAsset(asset: QuickActionAsset, runs: AssetWorkflowRun[]) {
    const sortedRuns = [...runs].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const latestRun = sortedRuns[0] ?? null;
    const fallbackMissingMedia =
      latestRun && runHasCompletedAllSteps(latestRun) && countMissingWorkflowItems(latestRun) > 0
        ? {
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
          }
        : null;
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
      missingMedia:
        missingMediaFlags.find(
          (flag) => flag.assetId === asset.id || flag.runId === sortedRuns[0]?.id
        ) ?? fallbackMissingMedia,
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
      const [assignments, runs, docs, fullAsset] = await Promise.all([
        assetWorkflowAssignmentService.listByAsset(asset.id),
        api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${asset.id}`).then(r => r.data).catch(() => []),
        api.get(`/asset-documents/by-asset/${asset.id}`).then(res => res.data).catch(() => []),
        projectAssetService.getById(asset.id).catch(() => null),
      ]);
      setQuickActionAssignments(assignments);
      setQuickActionRuns(runs);
      setDocsCount(Array.isArray(docs) ? docs.length : 0);
      
      setProductWorkflow(await resolveProductWorkflowForAsset(fullAsset, assignments));
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

  async function openQuickActionOrStart(asset: QuickActionAsset) {
    setQuickActionLoading(true);
    setRunnerLoading(asset.id);
    setDocsLoading(true);
    try {
      const [assignments, runs, docs, fullAsset] = await Promise.all([
        assetWorkflowAssignmentService.listByAsset(asset.id),
        api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${asset.id}`).then((r) => r.data).catch(() => []),
        api.get(`/asset-documents/by-asset/${asset.id}`).then((res) => res.data).catch(() => []),
        projectAssetService.getById(asset.id).catch(() => null),
      ]);

      const resolvedProductWorkflow = await resolveProductWorkflowForAsset(fullAsset, assignments);

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
      setDocsCount(Array.isArray(docs) ? docs.length : 0);
      setProductWorkflow(resolvedProductWorkflow);
      setQuickActionOpen(true);
    } catch {
      setQuickActionAsset(asset);
      setQuickActionAssignments([]);
      setQuickActionRuns([]);
      setDocsCount(0);
      setProductWorkflow(null);
      setQuickActionOpen(true);
    } finally {
      setRunnerLoading((current) => (current === asset.id ? null : current));
      setDocsLoading(false);
      setQuickActionLoading(false);
    }
  }

  async function launchProductWorkflowFromDashboard(asset: QuickActionAsset, workflowMeta: { configId: string; configName: string; workflowTypeId?: string }) {
    setRunnerLoading(asset.id);
    try {
      const cfg = await workflowConfigService.getById(workflowMeta.configId);
      if (!cfg) { alert("Workflow config not found."); return; }
      let wf: Workflow | null = null;
      try {
        const parsed = JSON.parse(cfg.stepsJson);
        if (parsed?.steps) wf = parsed as Workflow;
        else if (Array.isArray(parsed)) wf = { id: cfg.id, name: cfg.name, productId: cfg.productId, createdAt: Date.now(), steps: parsed, media: [] };
      } catch {}
      if (!wf || wf.steps.length === 0) { alert("This workflow has no steps defined."); return; }
      setRunnerExistingRunId(undefined);
      setRunnerAsset(asset);
      setRunnerWorkflow(wf);
      setRunnerWorkflowConfigId(workflowMeta.configId);
      setRunnerOpen(true);
      closeQuickActionDialog();
    } catch {
      alert("Failed to load workflow.");
    } finally {
      setRunnerLoading(null);
    }
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
        label: "Add Missing Photos",
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
        label: "Resolve Blocking Issue",
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
        label: "Complete Sign-off",
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
  }, [openIssueRepair, openSignatureRepair, productWorkflow, quickActionAsset, quickActionAssignments, quickActionAttention, quickActionRuns]);

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
    setRunnerLoading(asset.id);
    try {
      const cfg = await workflowConfigService.getById(assignment.workflowConfigId);
      if (!cfg) { alert("Workflow config not found."); return; }
      let wf: Workflow | null = null;
      try {
        const parsed = JSON.parse(cfg.stepsJson);
        if (parsed?.steps) wf = parsed as Workflow;
        else if (Array.isArray(parsed)) wf = { id: cfg.id, name: cfg.name, productId: cfg.productId, createdAt: Date.now(), steps: parsed, media: [] };
      } catch {}
      if (!wf || wf.steps.length === 0) { alert("This workflow has no steps defined."); return; }

      let existingRunId: string | undefined;
      const runs = runsOverride ?? quickActionRuns;
      const activeRun = runs.find((r) => r.workflowConfigId === assignment.workflowConfigId && !r.isLocked);
      if (activeRun) existingRunId = activeRun.id;

      setRunnerExistingRunId(existingRunId);
      setRunnerAsset(asset);
      setRunnerWorkflow(wf);
      setRunnerWorkflowConfigId(assignment.workflowConfigId);
      setRunnerOpen(true);
      closeQuickActionDialog();
    } catch { alert("Failed to load workflow."); } finally {
      setRunnerLoading(null);
    }
  }

  async function confirmAutoAssignAndStartFromDashboard() {
    if (!autoAssignConfirm) return;
    const { asset, assignment } = autoAssignConfirm;
    setAutoAssignConfirm(null);
    if (assignment) {
      void startWorkflowFromDashboard(asset, assignment);
    }
  }

  function isInspectionWorkflowType(workflowTypeId?: string): boolean {
    if (!workflowTypeId) return false;
    const typeName = String(workflowTypeId).toLowerCase();
    return typeName.includes("inspection") || typeName === "insp";
  }

  // Load workflow types and configs when assign dialog opens
  useEffect(() => {
    if (assignDialogOpen && workflowTypes.length === 0) {
      workflowTypeService.list().then(setWorkflowTypes).catch(() => setWorkflowTypes([]));
    }
  }, [assignDialogOpen, workflowTypes.length]);

  useEffect(() => {
    if (assignDialogOpen && quickActionAsset) {
      // Load all configs and filter by product if available
      workflowConfigService.getAll().then((configs) => {
        setWorkflowConfigs(configs.map((c: any) => ({ id: c.id, name: c.name, workflowTypeId: c.workflowTypeId })));
      }).catch(() => setWorkflowConfigs([]));
    }
  }, [assignDialogOpen, quickActionAsset]);

  async function saveAssignmentFromDashboard() {
    if (!quickActionAsset || !assignForm.workflowTypeId || !assignForm.workflowConfigId) return;
    setAssignSaving(true);
    try {
      await assetWorkflowAssignmentService.create(quickActionAsset.id, assignForm.workflowConfigId, assignForm.workflowTypeId);
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
    () => pendingSigs.filter((sig) => myInstallAssets.some((asset) => asset.id === sig.assetId)),
    [pendingSigs, myInstallAssets]
  );
  // High-severity observations on user's assigned assets (created by the current user)
  const myInstallHighObservations = useMemo(
    () => openIssues.filter((issue) =>
      !issue.isBlocking &&
      issue.severity === "high" &&
      issue.issueType === "observation" &&
      myInstallAssets.some((asset) => asset.id === issue.assetId)
    ),
    [openIssues, myInstallAssets]
  );
  const myInstallAttentionCount = myInstallBlocking.length + myInstallPendingSigs.length + myInstallHighObservations.length;

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
    if (pmDashboardTab === "pm-projects" && !showPmProjectsTab) {
      setPmDashboardTab(hasInspectionsTab ? "my-inspections" : "my-installs");
    }
    if (pmDashboardTab === "my-inspections" && !hasInspectionsTab) {
      setPmDashboardTab("my-installs");
    }
  }, [isManager, pmDashboardTab, showPmProjectsTab, hasInspectionsTab]);

  // Installer: my pending sigs
  const myPendingSigs = useMemo(() =>
    pendingSigs.filter(s => myAssets.some(a => a.id === s.assetId || a.jobNumber === s.jobNumber)),
    [pendingSigs, myAssets]);

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
  }, [canActAsFieldTechnician, isManager, user.id, user.role, visibleProjectIds]);

  // Project status chart
  const statusGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of dashboardProjects) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [dashboardProjects]);

  const statusColor: Record<string, string> = {
    "In Progress": "primary", "Completed": "success", "Pending Approval": "warning",
    "Cancelled": "error", "Draft": "default", "Approved": "info", "On Hold": "warning",
  };

  const MyInspectionWorkspace = (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <AssessmentOutlined sx={{ color: "primary.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>{isAdmin ? "Inspections" : "My Inspections"}</Typography>
        {workspaceLoading && <CircularProgress size={14} sx={{ ml: 1 }} />}
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
                  <Chip label={displayRunState(asset)} size="small" variant="outlined"
                    color={isPausedAsset(asset.runStatus) ? "warning" : isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status) ? "primary" : "default"}
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
                      {asset.jobNumber}{" · "}{asset.completedAt ? `Completed ${fmtDate(asset.completedAt)}` : `Updated ${fmtDate(asset.latestActivityAt)}`}
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
      await generateTechnicianReport({ technicianName: w.fullName, reportPeriod: exportDate, runs: [], assets: [], exportDate } as TechnicianReportData);
    } finally { setReportingTechId(null); }
  }
  // Reusable: individual clickable item row
  const ItemRow = ({
    label,
    sub,
    onClick,
    actionLabel,
  }: {
    label: string;
    sub?: string;
    onClick: () => void;
    actionLabel?: string;
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
        <Chip
          label={actionLabel}
          size="small"
          color="info"
          variant="outlined"
          sx={{ height: 18, fontSize: "0.6rem", flexShrink: 0 }}
        />
      )}
    </Stack>
  );
  // Reusable JSX blocks

  const NeedsAttentionSection = (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <WarningAmberOutlined sx={{ color: attentionCount > 0 ? "warning.main" : "success.main", fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Needs Attention</Typography>
        {attentionLoading && <CircularProgress size={14} sx={{ ml: 1 }} />}
        {attentionCount === 0 && !attentionLoading && (
          <Chip label="All clear" size="small" color="success" variant="outlined" sx={{ ml: 1, height: 20, fontSize: "0.7rem" }} />
        )}
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
                    sub={`Completed ${fmtDate(s.completedAt)}`}
                    actionLabel="Sign-off"
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
                  "&:hover": { background: "rgba(45,212,191,0.1)", borderColor: "rgba(45,212,191,0.3)", transform: "translateY(-2px)" },
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
          ? `${dashboardProjectScope === "mine" ? "My" : "All"} active projects for ${viewingOwnDashboard ? "you" : viewedDashboardUser?.fullName ?? "this user"}`
          : isAdmin
            ? `${dashboardProjectScope === "mine" ? "Your" : "All"} active projects in the current dashboard scope.`
            : `${dashboardProjectScope === "mine" ? "Your" : "All"} active projects in the current dashboard scope.`}
      </Typography>

      {dashboardProjects.length === 0 ? (
        <Typography variant="caption" color="text.disabled">No assigned projects in this scope.</Typography>
      ) : (
        <Stack spacing={1.25}>
          {dashboardProjects.map((project) => {
            const summary = projectSummaryById.get(project.id);
            const projectAssets = openAssets.filter((asset) => asset.projectId === project.id);
            const issueCount = projectAssets.filter((asset) => String(asset.status ?? "").toLowerCase() === "issue").length;
            const noWorkflowCount = projectAssets.filter((asset) => !asset.totalSteps && String(asset.status ?? "").toLowerCase() !== "complete").length;
            const totalAssets = summary?.total ?? project.assetCount ?? projectAssets.length;
            const notStarted = summary?.notStarted ?? projectAssets.filter((asset) => isNotStartedAsset(asset.status)).length;
            const inProgress = summary?.inProgress ?? projectAssets.filter((asset) => isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)).length;
            const complete = summary?.complete ?? Math.max(0, totalAssets - notStarted - inProgress - issueCount);
            const completionPct = totalAssets > 0 ? Math.round((complete / totalAssets) * 100) : 0;
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
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": {
                    background: "rgba(45,212,191,0.06)",
                    borderColor: "rgba(45,212,191,0.25)",
                    transform: "translateY(-1px)",
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
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" color={project.projectManager?.trim() ? "text.secondary" : "warning.main"} noWrap>
                      PM: {project.projectManager?.trim() || "No PM assigned"}
                    </Typography>
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
                    {asset.jobNumber} - {displayRunState(asset)}
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
            <Typography variant="caption" color="text.disabled">No data available for selected window.</Typography>
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
            <Typography variant="caption" color="text.disabled">No data available for selected window.</Typography>
          )}
        </Box>
      </Grid>
    </Grid>
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
      {workloadLoading ? <LinearProgress /> : scopedWorkload.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No open assets currently assigned to technicians in this scope.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {scopedWorkload.map((w) => {
            const isExpanded = expandedWorkloadId === w.userId;
            const inPct     = w.totalAssigned > 0 ? (w.inProgress / w.totalAssigned) * 100 : 0;
            const pausedPct = w.totalAssigned > 0 ? (w.paused   / w.totalAssigned) * 100 : 0;
            const notPct    = w.totalAssigned > 0 ? ((w.notStarted + w.pending) / w.totalAssigned) * 100 : 0;
            const stepPct   = w.totalSteps > 0 ? Math.min(100, (w.completedSteps / w.totalSteps) * 100) : 0;
            const load      = w.totalAssigned >= 10 ? "error" : w.totalAssigned >= 5 ? "warning" : "success";
            const loadLabel = w.totalAssigned >= 10 ? "Heavy" : w.totalAssigned >= 5 ? "Moderate" : "Light";
            const barColor  = w.hasIssues ? "warning.main" : "primary.main";
            const startLabel = w.startedAt
              ? new Date(w.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : null;
            const techAssets = visibleOpenAssets.filter((a) => a.assignedUserId === w.userId);
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
                          ? `${w.completedSteps}/${w.totalSteps} steps · ${w.inProgress} active · ${w.paused} paused · ${w.notStarted} queued · ${w.pending} pending`
                          : `${w.inProgress} active · ${w.paused} paused · ${w.notStarted} queued · ${w.pending} pending`
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
                      {w.pending > 0 && (
                        <>{" · "}<Tooltip title="Asset is assigned and acknowledged but the workflow hasn't started" arrow>
                          <span style={{ cursor: "help", textDecoration: "underline dotted" }}>{w.pending} pending</span>
                        </Tooltip></>
                      )}
                      {startLabel && <span style={{ opacity: 0.5 }}>{" · since "}{startLabel}</span>}
                    </Typography>
                  </Stack>

                  {/* ── Project chips ── */}
                  {w.projectBreakdown.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {w.projectBreakdown.map((pb) => (
                        <Tooltip key={pb.projectId} title={`${pb.inProgress} active · ${pb.paused} paused · ${pb.notStarted} queued · ${pb.pending} pending`} arrow>
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
              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: "0.62rem" }}>My Projects</Typography>
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
                    const summary = projectSummaryById.get(project.id);
                    const projectAssets = openAssets.filter((asset) => asset.projectId === project.id);
                    const issueCount = projectAssets.filter((asset) => String(asset.status ?? "").toLowerCase() === "issue").length;
                    const totalAssets = summary?.total ?? project.assetCount ?? projectAssets.length;
                    const notStarted = summary?.notStarted ?? projectAssets.filter((asset) => isNotStartedAsset(asset.status)).length;
                    const inProgress = summary?.inProgress ?? projectAssets.filter((asset) => isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)).length;
                    const complete = summary?.complete ?? Math.max(0, totalAssets - notStarted - inProgress - issueCount);
                    const completionPct = totalAssets > 0 ? Math.round((complete / totalAssets) * 100) : 0;

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
                          label={displayRunState(asset)}
                          size="small"
                          color={isPausedAsset(asset.runStatus) ? "warning" : isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status) ? "primary" : isIssueAsset(asset.status) ? "error" : isPendingAsset(asset.status) ? "info" : "default"}
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
            {!isEngineer && (
              <IconButton size="small" onClick={() => setWorkspaceExpanded((v) => !v)}>
                {workspaceExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
              </IconButton>
            )}
          </Stack>

          <Collapse in={workspaceExpanded || isEngineer}>
            <Box sx={{ mt: 1.5 }}>
              {showAdminOverviewStrip ? (
                <Typography variant="caption" color="text.secondary">
                  Use the tabs below to review project ownership, inspection activity, and install activity across the current scope.
                </Typography>
              ) : myAssets.length === 0 ? (
                <Typography variant="caption" color="text.disabled">
                  {workspaceLoading
                    ? "Loading your assigned assets..."
                    : myInstallHistory.length > 0 || myInspectionHistory.length > 0
                      ? "No active assets right now. Use the history cards below to review completed or closed work."
                      : "No assets currently assigned to you."}
                </Typography>
              ) : (
                <Grid container spacing={1.5}>
                  {myAssets.slice(0, 6).map((a) => (
                    <Grid item xs={12} sm={6} md={4} key={a.id}>
                      <Paper elevation={0} onClick={() => navigate("/installations/assets")}
                        sx={{
                          p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5,
                          cursor: "pointer", transition: "all 0.15s",
                          "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
                        }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <WorkOutlineOutlined sx={{ fontSize: 14, color: "text.secondary", flexShrink: 0 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="caption" fontWeight={600} noWrap display="block">
                              {a.assetTag || a.assetName || a.id}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
                              {a.jobNumber} - {displayRunState(a)}
                            </Typography>
                          </Box>
                          <Chip label={isPausedAsset(a.runStatus) ? "Paused" : isInProgressAsset(a.runStatus) || isInProgressAsset(a.status) ? "Active" : "Queued"}
                            size="small"
                            color={isPausedAsset(a.runStatus) ? "warning" : isInProgressAsset(a.runStatus) || isInProgressAsset(a.status) ? "primary" : "default"}
                            variant="outlined"
                            sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }} />
                        </Stack>
                      </Paper>
                    </Grid>
                  ))}
                  {myAssets.length > 6 && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.disabled">
                        +{myAssets.length - 6} more assets - <Box component="span" sx={{ cursor: "pointer", color: "primary.main" }} onClick={() => navigate("/installations/assets")}>view all</Box>
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}
            </Box>
          </Collapse>
        </Box>
      )}
      {/* UNIVERSAL TAB BAR (all non-viewer users) */}
      {showTabBar && (
        <Box className="glass-card" sx={{ p: 1.5 }}>
          <Tabs value={pmDashboardTab} onChange={(_, v: PmDashboardTab) => setPmDashboardTab(v)}
            sx={{ minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0.5, fontSize: "0.8rem" } }}>
            {showPmProjectsTab && <Tab value="pm-projects" label={isAdmin ? "Projects" : "My PM Projects"} />}
            {hasInspectionsTab && <Tab value="my-inspections" label={isAdmin ? "Inspections" : "My Inspections"} />}
            <Tab value="my-installs" label={isAdmin ? "Installs" : "My Installs"} />
          </Tabs>
        </Box>
      )}

      {/* My Inspections tab content - non-manager users */}
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
                    const isActive = isInProgressAsset(a.runStatus) || isInProgressAsset(a.status);
                    const isPaused = isPausedAsset(a.runStatus);
                    const hasCompletedAllSteps = a.totalSteps > 0 && a.completedSteps >= a.totalSteps;
                    const hasMissingPhotoRepair = a.totalSteps > 0 && a.completedSteps >= a.totalSteps && a.missingItems > 0;
                    const blockingIssuesForAsset = openIssues.filter((issue) => issue.assetId === a.id && issue.isBlocking);
                    const shouldResolveBlockingIssue = !isPaused && !hasMissingPhotoRepair && hasCompletedAllSteps && blockingIssuesForAsset.length > 0;
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
                                <Typography variant="caption" fontWeight={600} noWrap display="block">
                                  {a.assetTag || a.assetName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: "0.65rem" }}>
                                  {a.jobNumber}
                                </Typography>
                                {a.totalSteps > 0 && (
                                  <Typography variant="caption" color={a.missingItems > 0 ? "warning.main" : "text.disabled"} noWrap display="block" sx={{ fontSize: "0.62rem" }}>
                                    {a.completedSteps}/{a.totalSteps} steps{a.missingItems > 0 ? ` \u2022 ${a.missingItems} missing` : ""}
                                  </Typography>
                                )}
                              </Box>
                              {hasMissingPhotoRepair ? (
                                <Tooltip title="Workflow steps are complete but required captures are still missing" arrow>
                                  <Chip label="Missing" size="small" color="error" variant="outlined"
                                    sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0, cursor: "help" }} />
                                </Tooltip>
                              ) : isPaused ? (
                                <Tooltip title="Workflow run is currently paused" arrow>
                                  <Chip label="Paused" size="small" color="warning" variant="outlined"
                                    sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0, cursor: "help" }} />
                                </Tooltip>
                              ) : isActive ? (
                                <Chip label="Active" size="small" color="primary" variant="outlined"
                                  sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }} />
                              ) : isPendingAsset(a.status) ? (
                                <Tooltip title="Asset is assigned and acknowledged but the workflow hasn't started" arrow>
                                  <Chip label="Pending" size="small" color="info" variant="outlined"
                                    sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0, cursor: "help" }} />
                                </Tooltip>
                              ) : (
                                <Tooltip title="No workflow run has been started yet" arrow>
                                  <Chip label="Queued" size="small" color="default" variant="outlined"
                                    sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0, cursor: "help" }} />
                                </Tooltip>
                              )}
                            </Stack>
                            <Button size="small" variant="outlined"
                              color={hasMissingPhotoRepair ? "warning" : shouldResolveBlockingIssue ? "error" : isActive || isPaused ? "primary" : "inherit"}
                              onClick={(e) => { e.stopPropagation(); void openQuickActionOrStart(a); }}
                              sx={{ alignSelf: "flex-start", height: 22, fontSize: "0.68rem", py: 0 }}>
                              {hasMissingPhotoRepair ? "Add Photos" : shouldResolveBlockingIssue ? "Resolve Blocking Issue" : isActive || isPaused ? "Resume" : "Start"}
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
              {attentionLoading && <CircularProgress size={14} sx={{ ml: 1 }} />}
              {myInstallAttentionCount === 0 && !attentionLoading && (
                <Chip label="All clear" size="small" color="success" variant="outlined" sx={{ ml: 1, height: 20, fontSize: "0.7rem" }} />
              )}
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
                  background:  myInstallBlocking.length > 0 ? "rgba(211,47,47,0.07)" : "rgba(255,255,255,0.03)",
                }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <ErrorOutlineOutlined sx={{ fontSize: 18, color: myInstallBlocking.length > 0 ? "error.main" : "text.disabled" }} />
                    <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>My Blocking Issues</Typography>
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
                          actionLabel="Resolve"
                          onClick={() => openIssueRepair(iss)} />
                      ))}
                      {myInstallBlocking.length > 3 && (
                        <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                          +{myInstallBlocking.length - 3} more
                        </Typography>
                      )}
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="success.main">No blocking issues</Typography>
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
                          sub={`Completed ${fmtDate(s.completedAt)}`}
                          actionLabel="Sign-off"
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
              {myInstallHistory.length > 0 && (
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
              {myInstallHistory.length > 0 && (
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
                        sub={`Completed ${fmtDate(s.completedAt)}`}
                        actionLabel="Sign-off"
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
                            id: crypto.randomUUID(),
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
                              <Chip label={displayRunState(a)}
                                size="small" variant="outlined"
                                color={isInProgressAsset(a.runStatus) ? "primary" : isPausedAsset(a.runStatus) ? "warning" : "default"}
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
                  {myInstallHistory.length > 0 && (
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
        const techAssets = visibleOpenAssets.filter((a) => a.assignedUserId === w.userId);
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
              const techAssets = visibleOpenAssets.filter((a) => a.assignedUserId === w.userId);
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
          <Button startIcon={<PrintOutlined />} onClick={() => window.print()}>Print All</Button>
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
          onUpdated={() => {
            setPhotoUploadTarget(null);
            const raw: MissingMediaFlag[] = JSON.parse(localStorage.getItem("pm_missing_media_flags") ?? "[]");
            setMissingMediaFlags(raw.map((f) => ({ ...f, missingSteps: f.missingSteps ?? [], totalExpected: f.totalExpected ?? 0, totalCaptured: f.totalCaptured ?? 0 })));
          }}
        />
      )}

      {issueDetailTarget && (
        <IssueDetailDialog
          open={!!issueDetailTarget}
          issue={issueDetailTarget.issue}
          currentUser={user.fullName ?? user.email ?? "User"}
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
              label={quickActionAsset ? displayRunState(quickActionAsset) : ""}
              size="small"
              color={quickActionAsset && (isInProgressAsset(quickActionAsset.runStatus) || isInProgressAsset(quickActionAsset.status)) ? "primary" : quickActionAsset && isPausedAsset(quickActionAsset.runStatus) ? "warning" : "default"}
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
                      Progress: {quickActionAsset.completedSteps}/{quickActionAsset.totalSteps} steps
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
                      quickActionPrimaryAction.label === "Resolve Blocking Issue" ? <WarningAmberOutlined fontSize="small" /> :
                      quickActionPrimaryAction.label === "Add Missing Photos" ? <PhotoCameraOutlined fontSize="small" /> :
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
                <Stack spacing={1.5}>
                  <Alert severity="info">
                    No workflow assigned to this asset yet.
                  </Alert>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<PlayArrowOutlined />}
                    onClick={() => setAssignDialogOpen(true)}
                  >
                    Assign Workflow
                  </Button>
                </Stack>
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
                    onClick={() => setAssignDialogOpen(true)}
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
            <FormControl fullWidth size="small">
              <InputLabel>Workflow Type</InputLabel>
              <Select
                value={assignForm.workflowTypeId}
                label="Workflow Type"
                onChange={(e) => setAssignForm((f) => ({ ...f, workflowTypeId: e.target.value, workflowConfigId: "" }))}
              >
                {workflowTypes.map((wt) => (
                  <MenuItem key={wt.id} value={wt.id}>{wt.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small" disabled={!assignForm.workflowTypeId}>
              <InputLabel>Workflow Config</InputLabel>
              <Select
                value={assignForm.workflowConfigId}
                label="Workflow Config"
                onChange={(e) => setAssignForm((f) => ({ ...f, workflowConfigId: e.target.value }))}
              >
                {workflowConfigs
                  .filter((c) => c.workflowTypeId === assignForm.workflowTypeId)
                  .map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
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
            disabled={!assignForm.workflowTypeId || !assignForm.workflowConfigId || assignSaving}
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
          onComplete={() => {
            // Refresh the workspace after workflow completion
            setWorkspaceLoading(true);
            projectAssetService
              .dashboardWorkspace(isManager && selectedDashboardId !== ALL_DASHBOARDS_VALUE ? selectedDashboardId : undefined)
              .then((data) => setDashboardWorkspace(data))
              .finally(() => setWorkspaceLoading(false));
          }}
          onPause={() => {
            // Refresh the workspace after workflow pause
            setWorkspaceLoading(true);
            projectAssetService
              .dashboardWorkspace(isManager && selectedDashboardId !== ALL_DASHBOARDS_VALUE ? selectedDashboardId : undefined)
              .then((data) => setDashboardWorkspace(data))
              .finally(() => setWorkspaceLoading(false));
          }}
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

    </Stack>
  );
};

export default Dashboard;
