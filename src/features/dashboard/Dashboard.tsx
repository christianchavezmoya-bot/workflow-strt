import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Divider, Grid,
  IconButton, LinearProgress, MenuItem, Paper, Select, Stack, Tooltip, Typography,
} from "@mui/material";
import {
  AssessmentOutlined, AssignmentLateOutlined, CheckCircleOutlineOutlined,
  ErrorOutlineOutlined, ExpandLessOutlined, ExpandMoreOutlined,
  FactCheckOutlined, OpenInNewOutlined, PendingActionsOutlined, PersonOutlined,
  PhotoCameraOutlined, ReportOutlined, TrendingDownOutlined, TrendingFlatOutlined, TrendingUpOutlined,
  WarningAmberOutlined, WorkOutlineOutlined,
} from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import StatusStepper from "../../components/ui/StatusStepper";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProjects } from "../../store/projectSlice";
import { officesService } from "../../services/officesService";
import { assetWorkflowRunService, type OpenIssueRecord, type PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import { projectAssetService, type OpenAssetItem, type WorkloadSummaryItem } from "../../services/projectAssetService";
import { dashboardService, type EvidenceCompleteness, type WorkflowHealth } from "../../services/dashboardService";
import { generateTechnicianReport, type TechnicianReportData } from "../../utils/generateTechnicianReport";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import { workflowConfigService } from "../../services/workflowConfigService";
import PhotoUploadDialog, { type MissingMediaFlag as PhotoMissingMediaFlag, type PhotoUpdateNotification } from "./PhotoUploadDialog";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "â€”";
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

function displayRunState(asset: OpenAssetItem) {
  if (isPausedAsset(asset.runStatus)) return "Paused";
  if (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)) return "In Progress";
  if (isNotStartedAsset(asset.status)) return "Not Started";
  return asset.runStatus || asset.status || "Unknown";
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

const Dashboard = () => {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const isManager    = user.role === "Admin" || user.role === "Project Manager";
  const isSupervisor = user.role === "Supervisor";
  const isEngineer   = user.role === "Engineer" || user.role === "QA Inspector";
  const isInstaller  = user.role === "Installer" || user.role === "Technician";
  const isViewer     = user.role === "Viewer" || user.role === "Client";

  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const dispatch      = useAppDispatch();
  const projects      = useAppSelector((s) => s.projects.items);

  const [globalOffices,      setGlobalOffices]      = useState<Office[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [openIssues,         setOpenIssues]         = useState<OpenIssueRecord[]>([]);
  const [pendingSigs,        setPendingSigs]        = useState<PendingSignatureRecord[]>([]);
  const [attentionLoading,   setAttentionLoading]   = useState(false);
  const [openAssets,         setOpenAssets]         = useState<OpenAssetItem[]>([]);
  const [workload,           setWorkload]           = useState<WorkloadSummaryItem[]>([]);
  const [workloadLoading,    setWorkloadLoading]    = useState(false);
  const [reportingTechId,    setReportingTechId]    = useState<string | null>(null);

  // Phase 1 workspace
  const [workspaceExpanded, setWorkspaceExpanded] = useState(!isEngineer ? false : true);

  // Phase 4 â€” evidence
  const [evidenceData,    setEvidenceData]    = useState<EvidenceCompleteness | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceWindow,  setEvidenceWindow]  = useState(90);

  // Phase 5 â€” health
  const [healthData,    setHealthData]    = useState<WorkflowHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthWindow,  setHealthWindow]  = useState(90);

  // For Engineer: draft workflow configs
  const [draftConfigs, setDraftConfigs] = useState<{id:string; name:string; updatedAt?:string}[]>([]);
  // For Supervisor: runs completed today count
  const [completedToday, setCompletedToday] = useState(0);

  // PM: auto-assign flags from installers self-assigning
  type AutoAssignFlag = { id: string; assetId: string; assetTag: string; jobNumber: string; assignedBy: string; assignedAt: string };
  const [autoAssignFlags, setAutoAssignFlags] = useState<AutoAssignFlag[]>(() =>
    JSON.parse(localStorage.getItem("pm_auto_assign_flags") ?? "[]")
  );

  // Missing media flags â€” runs completed without photos/videos (uses shared type from PhotoUploadDialog)
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

  const loadAttention = useCallback(async () => {
    setAttentionLoading(true);
    try {
      const [iss, sigs] = await Promise.all([
        assetWorkflowRunService.listOpenIssues(),
        assetWorkflowRunService.listPendingSignatures(),
      ]);
      setOpenIssues(iss);
      setPendingSigs(sigs);
    } finally {
      setAttentionLoading(false);
    }
  }, []);

  useEffect(() => {
    dispatch(fetchProjects());
    loadAttention();
    setWorkloadLoading(true);
    projectAssetService.workloadSummary().then(setWorkload).finally(() => setWorkloadLoading(false));
    projectAssetService.listOpen().then(setOpenAssets);
    if (isEngineer) {
      workflowConfigService.getAll().then((configs) => {
        setDraftConfigs(configs.filter((c: any) => c.status === "Draft" || c.status === "draft"));
      }).catch(() => {});
    }
  }, [dispatch, loadAttention, isEngineer]);

  // Load inspection signals for PM/Admin
  useEffect(() => {
    if (!isManager) return;
    import("../../services/inspectionImportService").then(({ inspectionImportService }) => {
      inspectionImportService.list({ status: "NEEDS_ASSIGNMENT" })
        .then((items) => setInspectionImportsWaiting(items.length))
        .catch(() => {});
      inspectionImportService.list({ status: "FAILED" })
        .then((items) => setInspectionImportsFailed(items.length))
        .catch(() => {});
    });
    import("../../services/api").then(({ default: api }) => {
      api.get("/asset-workflow-runs", { params: { workflowType: "Inspection", status: "in-progress" } })
        .then((r: { data: unknown[] }) => setInspectionRunsDue(r.data.length))
        .catch(() => {});
    });
  }, [isManager]);

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

  // Listen for photo update notifications (installer uploaded photos â†’ PM notified)
  useEffect(() => {
    const reload = () => setPhotoUpdateNotifications(JSON.parse(localStorage.getItem("pm_photo_update_notifications") ?? "[]"));
    window.addEventListener("photo-update-notifications-changed", reload);
    return () => window.removeEventListener("photo-update-notifications-changed", reload);
  }, []);

  // Listen for photo reminders (PM sent reminder â†’ installer notified)
  useEffect(() => {
    const reload = () => setPhotoReminders(JSON.parse(localStorage.getItem("installer_photo_reminders") ?? "[]"));
    window.addEventListener("installer-photo-reminders-changed", reload);
    return () => window.removeEventListener("installer-photo-reminders-changed", reload);
  }, []);

  // Phase 4 â€” evidence completeness
  useEffect(() => {
    if (!isManager) return;
    setEvidenceLoading(true);
    dashboardService.evidenceCompleteness(evidenceWindow)
      .then(setEvidenceData)
      .catch(() => setEvidenceData(null))
      .finally(() => setEvidenceLoading(false));
  }, [isManager, evidenceWindow]);

  // Phase 5 â€” workflow health
  useEffect(() => {
    if (!isManager) return;
    setHealthLoading(true);
    dashboardService.workflowHealth(healthWindow)
      .then(setHealthData)
      .catch(() => setHealthData(null))
      .finally(() => setHealthLoading(false));
  }, [isManager, healthWindow]);

  // â”€â”€ Derived â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filteredProjects = useMemo(() => {
    if (activeOffice === "All" || !officeIdsForRegion) return projects;
    return projects.filter((p) => {
      if (p.officeId) return officeIdsForRegion.has(p.officeId);
      const c = countryForOffice(p.office);
      return c === activeOffice || p.office === activeOffice;
    });
  }, [activeOffice, projects, officeIdsForRegion, countryForOffice]);

  const projectCount    = filteredProjects.length;
  const blockingIssues  = openIssues.filter((i) => i.isBlocking);
  const highIssues      = openIssues.filter((i) => !i.isBlocking && i.severity === "high");
  const overdueProjects = filteredProjects.filter((p) => {
    if (!p.finishDate || p.status === "Completed" || p.status === "Cancelled") return false;
    return new Date(p.finishDate) < new Date();
  });
  const attentionCount = blockingIssues.length + pendingSigs.length + overdueProjects.length + highIssues.length;

  // Phase 1 â€” personal workspace
  const myAssets   = useMemo(() => openAssets.filter((a) => a.assignedUserId === user.id), [openAssets, user.id]);
  const myBlocking = useMemo(() => openIssues.filter((i) => i.isBlocking && myAssets.some((a) => a.id === i.assetId)), [openIssues, myAssets]);
  const myActive   = useMemo(() => myAssets.filter((a) => isInProgressAsset(a.runStatus) || isInProgressAsset(a.status)), [myAssets]);
  const myPaused   = useMemo(() => myAssets.filter((a) => isPausedAsset(a.runStatus)), [myAssets]);
  const myQueued   = useMemo(() => myAssets.filter((a) => isNotStartedAsset(a.status)), [myAssets]);

  // Supervisor: unassigned open assets
  const unassignedAssets = useMemo(() =>
    openAssets.filter(a => !a.assignedUserId && a.status !== "Complete" && a.status !== "Completed"),
    [openAssets]);

  // Supervisor: not-started assets
  const notStartedAssets = useMemo(() =>
    openAssets.filter(a => isNotStartedAsset(a.status)),
    [openAssets]);

  // PM: pending approval projects
  const pendingApprovals = useMemo(() =>
    filteredProjects.filter(p => p.status === "Pending Approval"),
    [filteredProjects]);

  // Inspection signals (PM/Manager only)
  const [inspectionRunsDue,       setInspectionRunsDue]       = useState(0);
  const [inspectionImportsWaiting, setInspectionImportsWaiting] = useState(0);
  const [inspectionImportsFailed,  setInspectionImportsFailed]  = useState(0);

  // Installer: my pending sigs
  const myPendingSigs = useMemo(() =>
    pendingSigs.filter(s => myAssets.some(a => a.id === s.assetId || a.jobNumber === s.jobNumber)),
    [pendingSigs, myAssets]);

  // Project status chart
  const statusGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of filteredProjects) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredProjects]);

  const statusColor: Record<string, string> = {
    "In Progress": "primary", "Completed": "success", "Pending Approval": "warning",
    "Cancelled": "error", "Draft": "default", "Approved": "info", "On Hold": "warning",
  };

  async function handleGenerateTechReport(w: WorkloadSummaryItem) {
    setReportingTechId(w.userId);
    try {
      const exportDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      await generateTechnicianReport({ technicianName: w.fullName, reportPeriod: exportDate, runs: [], assets: [], exportDate } as TechnicianReportData);
    } finally { setReportingTechId(null); }
  }

  // â”€â”€ Reusable: individual clickable item row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ItemRow = ({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) => (
    <Box onClick={(e) => { e.stopPropagation(); onClick(); }}
      sx={{
        px: 1, py: 0.5, borderRadius: 1, cursor: "pointer",
        "&:hover": { background: "rgba(255,255,255,0.07)" },
        transition: "background 0.15s",
      }}>
      <Typography variant="caption" color="text.secondary" noWrap display="block">
        â€¢ {label}
      </Typography>
      {sub && <Typography variant="caption" color="text.disabled" noWrap display="block" sx={{ pl: 1.5, fontSize: "0.65rem" }}>{sub}</Typography>}
    </Box>
  );

  // â”€â”€ Reusable JSX blocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        <Grid item xs={12} sm={6} md={3}>
          <Box sx={{
            p: 2, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: blockingIssues.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
            background:  blockingIssues.length > 0 ? "rgba(211,47,47,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ErrorOutlineOutlined sx={{ fontSize: 18, color: blockingIssues.length > 0 ? "error.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700}>Blocking Issues</Typography>
            </Stack>
            <Typography variant="h4" fontWeight={700} color={blockingIssues.length > 0 ? "error.main" : "text.secondary"}>
              {blockingIssues.length}
            </Typography>
            {blockingIssues.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {blockingIssues.slice(0, 4).map((iss) => (
                  <ItemRow key={iss.issueId}
                    label={`${iss.jobNumber}: ${iss.assetTag}`}
                    sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "â€¦" : "")}
                    onClick={() => navigate("/issues")} />
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
        <Grid item xs={12} sm={6} md={3}>
          <Box sx={{
            p: 2, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: overdueProjects.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
            background:  overdueProjects.length > 0 ? "rgba(211,47,47,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <AssignmentLateOutlined sx={{ fontSize: 18, color: overdueProjects.length > 0 ? "error.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700}>Overdue Projects</Typography>
            </Stack>
            <Typography variant="h4" fontWeight={700} color={overdueProjects.length > 0 ? "error.main" : "text.secondary"}>
              {overdueProjects.length}
            </Typography>
            {overdueProjects.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {overdueProjects.slice(0, 4).map((p) => (
                  <ItemRow key={p.id}
                    label={`${p.jobNumber} â€” ${p.customerName || ""}`}
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
        <Grid item xs={12} sm={6} md={3}>
          <Box sx={{
            p: 2, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: pendingSigs.length > 0 ? "warning.main" : "rgba(255,255,255,0.08)",
            background:  pendingSigs.length > 0 ? "rgba(230,119,0,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <PendingActionsOutlined sx={{ fontSize: 18, color: pendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700}>Pending Signatures</Typography>
            </Stack>
            <Typography variant="h4" fontWeight={700} color={pendingSigs.length > 0 ? "warning.main" : "text.secondary"}>
              {pendingSigs.length}
            </Typography>
            {pendingSigs.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {pendingSigs.slice(0, 4).map((s) => (
                  <ItemRow key={s.runId}
                    label={`${s.jobNumber}: ${s.assetTag}`}
                    sub={`Completed ${fmtDate(s.completedAt)}`}
                    onClick={() => navigate(`/projects/${s.projectId}`)} />
                ))}
                {pendingSigs.length > 4 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{pendingSigs.length - 4} more
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="success.main">All signatures collected</Typography>
            )}
          </Box>
        </Grid>

        {/* High Observations */}
        <Grid item xs={12} sm={6} md={3}>
          <Box sx={{
            p: 2, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: highIssues.length > 0 ? "warning.dark" : "rgba(255,255,255,0.08)",
            background:  highIssues.length > 0 ? "rgba(249,168,37,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ReportOutlined sx={{ fontSize: 18, color: highIssues.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700}>High Observations</Typography>
            </Stack>
            <Typography variant="h4" fontWeight={700} color={highIssues.length > 0 ? "warning.main" : "text.secondary"}>
              {highIssues.length}
            </Typography>
            {highIssues.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {highIssues.slice(0, 4).map((iss) => (
                  <ItemRow key={iss.issueId}
                    label={`${iss.jobNumber}: ${iss.assetTag}`}
                    sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "â€¦" : "")}
                    onClick={() => navigate("/issues")} />
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
                  {rp.length} projects Â· {rp.filter(p => p.status === "In Progress").length} in progress
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
              {filteredProjects.filter(p => p.status === "Completed").length} of {projectCount} completed
            </Typography>
          </Stack>
        </Box>
      </Grid>
      <Grid item xs={12} md={8}>
        <Box className="glass-card" sx={{ p: 2.5, height: "100%" }}>
          <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", mb: 2 }}>Project Lifecycle</Typography>
          <StatusStepper type="External" status="Pending Approval" />
        </Box>
      </Grid>
    </Grid>
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
              <Typography variant="caption" color="text.disabled">{healthData.totalRuns} runs in last {healthWindow} days Â· prev score {healthData.previousScore}%</Typography>
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
          <Typography variant="caption" color="text.secondary">Open assets â€” click to view in installations</Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "primary.main" }} />
            <Typography variant="caption" color="text.secondary">In progress</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "warning.main" }} />
            <Typography variant="caption" color="text.secondary">Paused</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "action.disabled" }} />
            <Typography variant="caption" color="text.secondary">Queued</Typography>
          </Stack>
        </Stack>
      </Stack>
      {workloadLoading ? <LinearProgress /> : workload.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No open assets currently assigned to technicians.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {workload.map((w) => {
            const inPct    = w.totalAssigned > 0 ? (w.inProgress / w.totalAssigned) * 100 : 0;
            const pausedPct = w.totalAssigned > 0 ? (w.paused / w.totalAssigned) * 100 : 0;
            const notPct   = w.totalAssigned > 0 ? (w.notStarted / w.totalAssigned) * 100 : 0;
            const stepPct  = w.totalSteps > 0 ? Math.min(100, (w.completedSteps / w.totalSteps) * 100) : 0;
            const load     = w.totalAssigned >= 10 ? "error" : w.totalAssigned >= 5 ? "warning" : "success";
            const loadLabel = w.totalAssigned >= 10 ? "Heavy" : w.totalAssigned >= 5 ? "Moderate" : "Light";
            const barColor = w.hasIssues ? "warning.main" : "primary.main";
            const startLabel = w.startedAt
              ? new Date(w.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : null;
            return (
              <Paper key={w.userId} elevation={0} onClick={() => navigate("/installations/assets")}
                sx={{
                  p: 1.5, border: "1px solid", borderColor: w.hasIssues ? "warning.dark" : "var(--stroke)",
                  borderRadius: 1.5, cursor: "pointer", transition: "all 0.15s",
                  "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
                }}>
                <Stack spacing={0.75}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{ flex: "0 0 160px", minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="body2" fontWeight={600} noWrap>{w.fullName}</Typography>
                        <Chip label={loadLabel} size="small" color={load} variant="outlined" sx={{ height: 16, fontSize: "0.6rem", flexShrink: 0 }} />
                        {w.hasIssues && <Chip label="Issues" size="small" color="warning" sx={{ height: 16, fontSize: "0.6rem", flexShrink: 0 }} />}
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          {w.inProgress} active Â· {w.paused} paused Â· {w.notStarted} queued
                        </Typography>
                        {startLabel && (
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                            Â· since {startLabel}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Tooltip title={
                        w.totalSteps > 0
                          ? `${w.completedSteps} / ${w.totalSteps} steps Â· ${w.inProgress} in-progress Â· ${w.paused} paused Â· ${w.notStarted} queued`
                          : `${w.inProgress} in progress Â· ${w.paused} paused Â· ${w.notStarted} not started`
                      } arrow>
                        <Box sx={{ position: "relative", height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "flex" }}>
                          {w.totalSteps > 0 ? (
                            // Step-based progress bar
                            <Box sx={{ width: `${stepPct}%`, bgcolor: barColor, transition: "width 0.4s" }} />
                          ) : (
                            // Asset-based progress bar
                            <>
                              {inPct > 0 && <Box sx={{ width: `${inPct}%`, bgcolor: barColor, transition: "width 0.4s" }} />}
                              {pausedPct > 0 && <Box sx={{ width: `${pausedPct}%`, bgcolor: "warning.main", transition: "width 0.4s" }} />}
                              {notPct > 0 && <Box sx={{ width: `${notPct}%`, bgcolor: "action.disabled", transition: "width 0.4s" }} />}
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
                    <Tooltip title="Generate technician report">
                      <span>
                        <IconButton size="small" disabled={reportingTechId === w.userId}
                          onClick={(e) => { e.stopPropagation(); void handleGenerateTechReport(w); }}
                          sx={{ color: "text.secondary", flexShrink: 0 }}>
                          {reportingTechId === w.userId ? <CircularProgress size={14} /> : <AssessmentOutlined sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                  {w.jobNumbers && w.jobNumbers.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {w.jobNumbers.map((jn) => (
                        <Chip key={jn} label={jn} size="small" variant="outlined"
                          sx={{ height: 16, fontSize: "0.6rem", color: "text.secondary", borderColor: "divider" }} />
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );

  return (
    <Stack spacing={3}>

      {/* â”€â”€ PERSONAL WORKSPACE STRIP â€” all except Viewer â”€â”€ */}
      {!isViewer && (
        <Box className="glass-card" sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <PersonOutlined sx={{ color: "primary.main", fontSize: 20 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", lineHeight: 1.2 }}>
                {user.fullName}
              </Typography>
              <Typography variant="caption" color="text.secondary">{user.role} Â· {user.office}</Typography>
            </Box>
            <Stack direction="row" spacing={0.75}>
              <Chip icon={<WorkOutlineOutlined sx={{ fontSize: 13 }} />}
                label={`${myActive.length} active`} size="small"
                color={myActive.length > 0 ? "primary" : "default"} variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }} />
              <Chip label={`${myPaused.length} paused`} size="small"
                color={myPaused.length > 0 ? "warning" : "default"} variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }} />
              <Chip label={`${myQueued.length} queued`} size="small"
                color="default" variant="outlined" sx={{ height: 22, fontSize: "0.7rem" }} />
              {myBlocking.length > 0 && (
                <Chip icon={<ErrorOutlineOutlined sx={{ fontSize: 13 }} />}
                  label={`${myBlocking.length} blocking`} size="small"
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
              {myAssets.length === 0 ? (
                <Typography variant="caption" color="text.disabled">No assets currently assigned to you.</Typography>
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
                              {a.jobNumber} â€” {displayRunState(a)}
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
                        +{myAssets.length - 6} more assets â€” <Box component="span" sx={{ cursor: "pointer", color: "primary.main" }} onClick={() => navigate("/installations/assets")}>view all</Box>
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* â•â• INSTALLER / TECHNICIAN VIEW â•â• */}
      {isInstaller && (
        <>
          {/* My Jobs Today */}
          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <WorkOutlineOutlined sx={{ color: "primary.main", fontSize: 20 }} />
              <Typography variant="h6" sx={{ fontFamily: "Sora" }}>My Jobs Today</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              Sorted by activity â€” tap to open
            </Typography>
            {myAssets.length === 0 ? (
              <Typography variant="caption" color="text.disabled">No jobs assigned to you.</Typography>
            ) : (
              <>
                <Grid container spacing={1.5}>
                  {myAssets.slice(0, 6).map((a) => {
                    const isActive = isInProgressAsset(a.runStatus) || isInProgressAsset(a.status);
                    const isPaused = isPausedAsset(a.runStatus);
                    return (
                      <Grid item xs={12} sm={6} md={4} key={a.id}>
                        <Paper elevation={0} onClick={() => navigate("/installations/assets")}
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
                                    {a.completedSteps}/{a.totalSteps} steps{a.missingItems > 0 ? ` · ${a.missingItems} missing` : ""}
                                  </Typography>
                                )}
                              </Box>
                              <Chip label={isPaused ? "Paused" : isActive ? "Active" : "Queued"} size="small"
                                color={isPaused ? "warning" : isActive ? "primary" : "default"} variant="outlined"
                                sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }} />
                            </Stack>
                            <Button size="small" variant="outlined"
                              color={isActive ? "primary" : "inherit"}
                              onClick={(e) => { e.stopPropagation(); navigate("/installations/assets"); }}
                              sx={{ alignSelf: "flex-start", height: 22, fontSize: "0.68rem", py: 0 }}>
                              {isActive ? "Resume" : "Start"}
                            </Button>
                          </Stack>
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
                {myAssets.length > 6 && (
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: "block" }}>
                    +{myAssets.length - 6} more â€”{" "}
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
                    {r.sentByName} requested photos for: {r.assetTag} â€” {r.workflowName}
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
                Your completed runs with missing photo or video evidence â€” tap to upload missing media
              </Typography>
              <Stack spacing={0.5}>
                {missingMediaFlags.filter(f => f.technicianUserId === user.id).map((f) => (
                  <Stack key={f.id} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                        {f.jobNumber ? `${f.jobNumber}: ` : ""}{f.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {f.workflowName} Â· {fmtDate(f.completedAt)}
                      </Typography>
                      {"totalExpected" in f && (
                        <Typography variant="caption" color="warning.main" display="block">
                          {(f as MissingMediaFlag).totalCaptured} of {(f as MissingMediaFlag).totalExpected} media steps done
                        </Typography>
                      )}
                    </Box>
                    <Button size="small" variant="outlined" color="warning" sx={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                      onClick={() => { setPhotoUploadMode("installer"); setPhotoUploadTarget(f as MissingMediaFlag); }}>
                      Upload Media
                    </Button>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => {
                        const updated = missingMediaFlags.filter((x) => x.id !== f.id);
                        localStorage.setItem("pm_missing_media_flags", JSON.stringify(updated));
                        setMissingMediaFlags(updated);
                      }}>
                      âœ•
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* My Blocking Issues + My Pending Signatures */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <ErrorOutlineOutlined sx={{ fontSize: 18, color: myBlocking.length > 0 ? "error.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>My Blocking Issues</Typography>
                  <Chip label={myBlocking.length} size="small"
                    color={myBlocking.length > 0 ? "error" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                {myBlocking.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">No blocking issues on your jobs</Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {myBlocking.map((iss) => (
                      <ItemRow key={iss.issueId}
                        label={`${iss.jobNumber}: ${iss.assetTag}`}
                        sub={iss.description.slice(0, 60) + (iss.description.length > 60 ? "â€¦" : "")}
                        onClick={() => navigate("/issues")} />
                    ))}
                  </Stack>
                )}
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <PendingActionsOutlined sx={{ fontSize: 18, color: myPendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>My Pending Signatures</Typography>
                  <Chip label={myPendingSigs.length} size="small"
                    color={myPendingSigs.length > 0 ? "warning" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                {myPendingSigs.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">No signatures waiting</Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {myPendingSigs.map((s) => (
                      <ItemRow key={s.runId}
                        label={`${s.jobNumber}: ${s.assetTag}`}
                        sub={`Completed ${fmtDate(s.completedAt)}`}
                        onClick={() => navigate(`/projects/${s.projectId}`)} />
                    ))}
                  </Stack>
                )}
              </Box>
            </Grid>
          </Grid>
        </>
      )}

      {/* â•â• SUPERVISOR VIEW â•â• */}
      {isSupervisor && (
        <>
          {/* Needs Attention â€” team issues */}
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
                        sub={[a.jobNumber, a.assignedUserId ? `Assigned: ${a.assignedUserId}` : undefined].filter(Boolean).join(" Â· ")}
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
        </>
      )}

      {/* â•â• ENGINEER VIEW â•â• */}
      {isEngineer && (
        <>
          {/* Needs Attention â€” scoped */}
          {NeedsAttentionSection}

          {/* Quality Focus: Sign-offs + Draft Configs */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <PendingActionsOutlined sx={{ fontSize: 18, color: pendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>Sign-offs Waiting on Me</Typography>
                  <Chip label={pendingSigs.length} size="small"
                    color={pendingSigs.length > 0 ? "warning" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                {pendingSigs.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">No pending sign-offs</Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {pendingSigs.slice(0, 5).map((s) => (
                      <ItemRow key={s.runId}
                        label={`${s.jobNumber}: ${s.assetTag}`}
                        sub={`Completed ${fmtDate(s.completedAt)}`}
                        onClick={() => navigate(`/projects/${s.projectId}`)} />
                    ))}
                    {pendingSigs.length > 5 && (
                      <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                        +{pendingSigs.length - 5} more
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
                  Not yet published â€” review and publish
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

      {/* â•â• PROJECT MANAGER / ADMIN VIEW â•â• */}
      {isManager && (
        <>
          {/* Needs Attention â€” company-wide */}
          {NeedsAttentionSection}

          {/* Pending Approvals strip â€” if any */}
          {pendingApprovals.length > 0 && (
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
          {(inspectionRunsDue > 0 || inspectionImportsWaiting > 0 || inspectionImportsFailed > 0) && (
            <Box className="glass-card" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <AssignmentLateOutlined sx={{ fontSize: 18, color: "info.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  Inspections
                </Typography>
              </Stack>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                {inspectionRunsDue > 0 && (
                  <Chip
                    label={inspectionRunsDue + (inspectionRunsDue === 1 ? " run" : " runs") + " in progress"}
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
          )}

          {/* Auto-assignment flags â€” installer self-assigned */}
          {autoAssignFlags.length > 0 && (
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
                        sub={`Assigned to ${f.assignedBy} Â· ${fmtDate(f.assignedAt)}`}
                        onClick={() => navigate("/installations")}
                      />
                    </Box>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => {
                        const updated = autoAssignFlags.filter((x) => x.id !== f.id);
                        localStorage.setItem("pm_auto_assign_flags", JSON.stringify(updated));
                        setAutoAssignFlags(updated);
                      }}>
                      âœ•
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Installer media updates â€” PM notification when installers upload missing media */}
          {photoUpdateNotifications.length > 0 && (
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
                        {n.workflowName} Â· {fmtDate(n.updatedAt)}
                      </Typography>
                      <Typography variant="caption" display="block" color={n.wasComplete ? "success.main" : "warning.main"}>
                        {n.wasComplete ? "All media added âœ“" : `${n.stillMissing} step${n.stillMissing !== 1 ? "s" : ""} still missing`}
                      </Typography>
                    </Box>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => {
                        const updated = photoUpdateNotifications.filter((x) => x.id !== n.id);
                        localStorage.setItem("pm_photo_update_notifications", JSON.stringify(updated));
                        setPhotoUpdateNotifications(updated);
                      }}>
                      âœ•
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Missing media flags â€” PM sees all runs without required media */}
          {missingMediaFlags.length > 0 && (
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
                        {f.workflowName} Â· {f.technicianName} Â· {fmtDate(f.completedAt)}
                      </Typography>
                      {"totalExpected" in f && (
                        <>
                          <Typography variant="caption" color="warning.main" display="block">
                            {(f as MissingMediaFlag).totalCaptured}/{(f as MissingMediaFlag).totalExpected} media steps captured
                          </Typography>
                          {(f as MissingMediaFlag).missingSteps?.slice(0, 3).map((ms) => (
                            <Typography key={`${ms.stepId}-${ms.inputId}`} variant="caption" color="text.disabled" display="block" sx={{ pl: 1 }}>
                              Â· {ms.stepTitle} â€” {ms.inputLabel}: {ms.captured} captured
                            </Typography>
                          ))}
                          {((f as MissingMediaFlag).missingSteps?.length ?? 0) > 3 && (
                            <Typography variant="caption" color="text.disabled" display="block" sx={{ pl: 1 }}>
                              +{((f as MissingMediaFlag).missingSteps?.length ?? 0) - 3} moreâ€¦
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
                        onClick={() => { setPhotoUploadMode("pm"); setPhotoUploadTarget(f); }}
                      >
                        Preview
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
                        {reminderSentId === f.id ? "Sent âœ“" : "Remind Installer"}
                      </Button>
                      <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                        onClick={() => {
                          const updated = missingMediaFlags.filter((x) => x.id !== f.id);
                          localStorage.setItem("pm_missing_media_flags", JSON.stringify(updated));
                          setMissingMediaFlags(updated);
                        }}>
                        âœ•
                      </Button>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Regional Snapshot */}
          {RegionalSnapshotSection}

          {/* Project Status + Lifecycle */}
          {ProjectStatusGrid}

          {/* Evidence + Health */}
          {EvidenceHealthGrid}

          {/* Workload */}
          {WorkloadPanel}
        </>
      )}

      {/* â•â• VIEWER VIEW â•â• */}
      {isViewer && (
        <>
          {/* Needs Attention â€” read-only */}
          {NeedsAttentionSection}

          {/* Regional Snapshot â€” read only */}
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
                    {filteredProjects.filter(p => p.status === "Completed").length} of {projectCount} completed
                  </Typography>
                </Stack>
              </Box>
            </Grid>
          </Grid>
        </>
      )}

      {/* Photo upload dialog â€” installer adds missing photos to a completed run */}
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

    </Stack>
  );
};

export default Dashboard;

