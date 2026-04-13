import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, FormControlLabel, Grid, IconButton, InputLabel, LinearProgress,
  MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import {
  AssessmentOutlined, AssignmentLateOutlined, CheckCircleOutlineOutlined, EditOutlined,
  ErrorOutlineOutlined, ExpandLessOutlined, ExpandMoreOutlined, ForwardToInboxOutlined,
  FactCheckOutlined, OpenInNewOutlined, PendingActionsOutlined, PersonOutlined,
  PhotoCameraOutlined, ReportOutlined, TrendingDownOutlined, TrendingFlatOutlined, TrendingUpOutlined,
  WarningAmberOutlined, WorkOutlineOutlined,
} from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import StatusStepper from "../../components/ui/StatusStepper";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { useNotificationInbox } from "../../contexts/NotificationInboxContext";
import { useAccessMode } from "../../contexts/AccessModeContext";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProjects } from "../../store/projectSlice";
import { officesService } from "../../services/officesService";
import { assetWorkflowRunService, type OpenIssueRecord, type PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import { projectAssetService, type OpenAssetItem, type WorkloadSummaryItem } from "../../services/projectAssetService";
import { dashboardService, type DashboardScope, type EvidenceCompleteness, type WorkflowHealth } from "../../services/dashboardService";
import { userService } from "../../services/userService";
import { generateTechnicianReport, type TechnicianReportData } from "../../utils/generateTechnicianReport";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import { workflowConfigService } from "../../services/workflowConfigService";
import { notificationService } from "../../services/notificationService";
import { signatureService } from "../../services/signatureService";
import { projectContactService } from "../../services/projectContactService";
import type { ProjectContact } from "../../types/projectContact";
import type { AppNotification } from "../../types/notification";
import type { ProjectStatus } from "../../types/project";
import type { User } from "../../types/user";
import PhotoUploadDialog, { type MissingMediaFlag as PhotoMissingMediaFlag } from "./PhotoUploadDialog";

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

function parseMissingMediaNotification(notification: AppNotification) {
  const assetTag = notification.title.replace(/^Missing media:\s*/i, "").trim();
  const [workflowName = "Workflow", jobNumber = "", captureText = "0/0 media steps captured"] =
    notification.message.split("|").map((part) => part.trim());
  return { assetTag, workflowName, jobNumber, captureText };
}

function parseWorkflowStepsFromSnapshot(snapshotJson: string) {
  try {
    const snapshot = JSON.parse(snapshotJson ?? "{}");
    const stepsRaw = typeof snapshot.stepsJson === "string" ? snapshot.stepsJson : "[]";
    const parsed = JSON.parse(stepsRaw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.steps)) return parsed.steps;
  } catch {}
  return [] as Array<{ id: string; order?: number; title?: string; description?: string; inputs?: Array<{ id: string; label?: string; type?: string }>; }>;
}

function parseStepResults(stepResultsJson: string) {
  try {
    const parsed = JSON.parse(stepResultsJson ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as Array<{ stepId: string; values?: Record<string, string>; iterationIndex?: number }>;
  }
}

function countCaptures(raw: string | undefined) {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).length : 0;
  } catch {
    return 0;
  }
}

function roleFlags(role: string | undefined) {
  return {
    isManager: role === "Admin" || role === "Project Manager",
    isSupervisor: role === "Supervisor",
    isEngineer: role === "Engineer" || role === "QA Inspector",
    isInstaller: role === "Installer" || role === "Technician",
    isViewer: role === "Viewer" || role === "Client",
  };
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeProjectStatus(status: string | undefined) {
  return (status ?? "").trim().toLowerCase();
}

function deriveLifecycleStatus(projects: Array<{ status: string }>): ProjectStatus {
  if (projects.length === 0) return "Draft";

  const priority = [
    "In Progress",
    "Pending Approval",
    "Approved",
    "In Planning",
    "Draft",
    "On Hold",
    "Completed",
    "Cancelled",
  ];

  for (const candidate of priority) {
    if (projects.some((project) => normalizeProjectStatus(project.status) === normalizeProjectStatus(candidate))) {
      return candidate as ProjectStatus;
    }
  }

  return (projects[0]?.status as ProjectStatus) ?? "Draft";
}

const ALL_DASHBOARDS_VALUE = "__all__";
type PmDashboardTab = "pm-projects" | "my-installs";

// ── Send-to-Customer widget ───────────────────────────────────────────────────
// Self-contained per pending-signature row.
// Tooltip on hover → full "Request Customer Signature" dialog on click,
// identical to the one in WorkflowRunHistoryDialog.
const DEFAULT_SIG_MESSAGE =
  "We are pleased to inform you that the installation work has been completed. " +
  "Please use the link below to review the completed workflow documentation and provide your sign-off.";

function SendToCustomerWidget({ sig }: { sig: PendingSignatureRecord }) {
  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [contacts,      setContacts]      = useState<ProjectContact[]>([]);
  const [autoContact,   setAutoContact]   = useState<ProjectContact | null>(null);
  const [editMode,      setEditMode]      = useState(false);
  const [saveAsNew,     setSaveAsNew]     = useState(false);
  const [email,         setEmail]         = useState("");
  const [name,          setName]          = useState("");
  const [message,       setMessage]       = useState(DEFAULT_SIG_MESSAGE);
  const [sending,       setSending]       = useState(false);
  const [tokenLink,     setTokenLink]     = useState<string | null>(null);
  const [sent,          setSent]          = useState(false);

  const openDialog = async () => {
    // Reset state
    setTokenLink(null);
    setEditMode(false);
    setSaveAsNew(false);
    setMessage(DEFAULT_SIG_MESSAGE);
    try {
      const list = await projectContactService.listContacts(sig.projectId);
      setContacts(list);
      const primary = list.find((c) => c.isPrimarySigner) ?? list[0] ?? null;
      setAutoContact(primary);
      setEmail(primary?.email ?? "");
      setName(primary?.name ?? "");
    } catch {
      setContacts([]);
      setAutoContact(null);
      setEmail("");
      setName("");
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setTokenLink(null);
    setEditMode(false);
    setSaveAsNew(false);
  };

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      const isUsingAutoContact = !editMode && autoContact != null;
      const token = await signatureService.createToken({
        runId:          sig.runId,
        contactId:      isUsingAutoContact ? autoContact!.id : undefined,
        recipientEmail: email.trim(),
        recipientName:  name.trim() || undefined,
        expiresInHours: 72,
        customMessage:  message.trim() || undefined,
      });
      setTokenLink(`${window.location.origin}/sign/${token.id}`);
      setSent(true);

      // Save as new contact (Customer 2) if checkbox ticked
      if (saveAsNew && email.trim()) {
        try {
          await projectContactService.createContact(sig.projectId, {
            name: name || email, email, phone: "", title: "",
            preferredSignMethod: "email", isPrimarySigner: false, ccReports: false, address: "",
          });
        } catch { /* silently fail — token already created */ }
      }

      // No contacts existed → save as Customer 1
      if (contacts.length === 0 && email.trim()) {
        try {
          const saved = await projectContactService.createContact(sig.projectId, {
            name: name || email, email, phone: "", title: "",
            preferredSignMethod: "email", isPrimarySigner: true, ccReports: false, address: "",
          });
          setContacts([saved]);
          setAutoContact(saved);
        } catch { /* silently fail */ }
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  return (
    <>
      <Tooltip title={sent ? "Signature request sent" : "Send Sign Request to Customer"}
        componentsProps={{ tooltip: { sx: sent ? { color: "success.main", bgcolor: "rgba(46,125,50,0.15)", border: "1px solid", borderColor: "success.main" } : {} } }}>
        <IconButton
          size="small"
          onClick={openDialog}
          sx={{
            color: sent ? "success.main" : "warning.main",
            border: "1px solid",
            borderColor: sent ? "success.main" : "warning.main",
            borderRadius: 1,
            p: 0.5,
            transition: "all 0.15s",
            "&:hover": { background: sent ? "rgba(46,125,50,0.12)" : "rgba(237,108,2,0.12)" },
          }}
        >
          <ForwardToInboxOutlined sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>

      {/* ── Request Customer Signature dialog — identical to WorkflowRunHistoryDialog ── */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Request Customer Signature</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {tokenLink ? (
              <>
                <Alert severity="success">
                  Secure link generated and email sent to {email}.
                </Alert>
                <Box sx={{ p: 1.5, background: "rgba(0,0,0,0.2)", borderRadius: 1, wordBreak: "break-all" }}>
                  <Typography variant="caption" fontFamily="monospace">{tokenLink}</Typography>
                </Box>
                <Button variant="outlined" onClick={() => { navigator.clipboard.writeText(tokenLink!); }}>
                  Copy link
                </Button>
              </>
            ) : (
              <>
                {/* ── Recipient ── */}
                <Typography variant="subtitle2">Recipient</Typography>
                {autoContact && !editMode ? (
                  <Box sx={{
                    display: "flex", alignItems: "center", gap: 1,
                    p: 1, borderRadius: 1,
                    background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.25)",
                  }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight="bold">{name || autoContact.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{email || autoContact.email}</Typography>
                      {autoContact.address && (
                        <Typography variant="caption" color="text.disabled" display="block">{autoContact.address}</Typography>
                      )}
                    </Box>
                    <Tooltip title="Send to a different person">
                      <IconButton size="small" onClick={() => setEditMode(true)}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <>
                    {contacts.length === 0 && (
                      <Alert severity="info" sx={{ py: 0.5, fontSize: "0.8rem" }}>
                        No contacts on file for this project. Enter details below — they will be saved as Customer 1.
                      </Alert>
                    )}
                    {editMode && autoContact && (
                      <Alert severity="info" sx={{ py: 0.5, fontSize: "0.8rem" }}>
                        Sending to a different person. Check the box below to save them as a project contact.
                      </Alert>
                    )}
                    <TextField label="Customer name" value={name}
                      onChange={(e) => setName(e.target.value)} size="small" fullWidth />
                    <TextField label="Customer email *" value={email}
                      onChange={(e) => setEmail(e.target.value)} size="small" fullWidth type="email" />
                    {editMode && autoContact && (
                      <FormControlLabel
                        control={
                          <Checkbox size="small" checked={saveAsNew}
                            onChange={(e) => setSaveAsNew(e.target.checked)} />
                        }
                        label={<Typography variant="body2">Save as Customer 2 in project contacts</Typography>}
                      />
                    )}
                  </>
                )}

                <Divider />

                {/* ── Message ── */}
                <Typography variant="subtitle2">Message to customer</Typography>
                <TextField
                  label="Invitation message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  size="small" fullWidth multiline minRows={4}
                  helperText="Included in the email sent to the customer. Leave as default or customise."
                />
                <Typography variant="caption" color="text.disabled">
                  A one-time secure link valid for 72 hours will be generated and sent automatically.
                </Typography>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{tokenLink ? "Done" : "Cancel"}</Button>
          {!tokenLink && (
            <Button variant="contained" onClick={handleSend}
              disabled={!email.trim() || sending}>
              {sending ? <CircularProgress size={18} /> : "Send to customer"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}

const Dashboard = () => {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const { setAccessMode } = useAccessMode();
  const { unreadNotifications, acknowledge, refresh: refreshNotifications } = useNotificationInbox();
  const defaultDashboardUserId = user.id;

  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const dispatch      = useAppDispatch();
  const projects      = useAppSelector((s) => s.projects.items);

  const [dashboardUsers,      setDashboardUsers]      = useState<User[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState(defaultDashboardUserId);
  const [globalOffices,      setGlobalOffices]      = useState<Office[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [openIssues,         setOpenIssues]         = useState<OpenIssueRecord[]>([]);
  const [pendingSigs,        setPendingSigs]        = useState<PendingSignatureRecord[]>([]);
  const [attentionLoading,   setAttentionLoading]   = useState(false);
  const [openAssets,         setOpenAssets]         = useState<OpenAssetItem[]>([]);
  const [workload,           setWorkload]           = useState<WorkloadSummaryItem[]>([]);
  const [workloadLoading,    setWorkloadLoading]    = useState(false);
  const [reportingTechId,    setReportingTechId]    = useState<string | null>(null);
  const [pmDashboardTab,     setPmDashboardTab]     = useState<PmDashboardTab>("pm-projects");
  const [showAllStatusProjects, setShowAllStatusProjects] = useState(false);

  const availableDashboardUsers = useMemo(() => {
    const uniqueUsers = new Map<string, User>();
    [user, ...dashboardUsers].forEach((candidate) => {
      if (candidate?.id && candidate.isActive !== false) {
        uniqueUsers.set(candidate.id, candidate);
      }
    });
    return Array.from(uniqueUsers.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [dashboardUsers, user]);

  const selectedDashboardUser = useMemo(() => {
    if (selectedDashboardId === ALL_DASHBOARDS_VALUE) return null;
    return availableDashboardUsers.find((candidate) => candidate.id === selectedDashboardId) ?? user;
  }, [availableDashboardUsers, selectedDashboardId, user]);

  const viewedDashboardName = selectedDashboardUser?.fullName ?? "All Users";
  const viewedDashboardRole = selectedDashboardUser?.role ?? user.role;
  const viewedDashboardOffice = selectedDashboardUser?.office ?? "All Offices";
  const viewedDashboardUserId = selectedDashboardUser?.id ?? null;
  const viewingOwnDashboard = viewedDashboardUserId === user.id;
  const showPmTabs = viewingOwnDashboard && user.role === "Project Manager";
  const activeDashboardScope: DashboardScope = showPmTabs
    ? (pmDashboardTab === "pm-projects" ? "pm-owned" : "participant")
    : "default";
  const { isManager, isSupervisor, isEngineer, isInstaller, isViewer } = roleFlags(viewedDashboardRole);
  const canShowOwnNotifications = viewingOwnDashboard || selectedDashboardId === ALL_DASHBOARDS_VALUE;

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

  // Missing media flags â€” runs completed without photos/videos (uses shared type from PhotoUploadDialog)
  type MissingMediaFlag = PhotoMissingMediaFlag;
  const [photoUploadTarget, setPhotoUploadTarget] = useState<MissingMediaFlag | null>(null);
  const [photoUploadMode, setPhotoUploadMode] = useState<"installer" | "pm">("installer");
  const [reminderSentId, setReminderSentId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDashboardId(defaultDashboardUserId);
  }, [defaultDashboardUserId]);

  useEffect(() => {
    userService.getUsers().then(setDashboardUsers).catch(() => setDashboardUsers([user]));
  }, [user]);

  useEffect(() => {
    if (selectedDashboardId !== ALL_DASHBOARDS_VALUE && !availableDashboardUsers.some((candidate) => candidate.id === selectedDashboardId)) {
      setSelectedDashboardId(defaultDashboardUserId);
    }
  }, [availableDashboardUsers, defaultDashboardUserId, selectedDashboardId]);

  useEffect(() => {
    if (selectedDashboardId === user.id) {
      setAccessMode("normal");
      return;
    }

    setAccessMode("view-only");
  }, [selectedDashboardId, setAccessMode, user.id]);

  useEffect(() => {
    if (isEngineer) {
      setWorkspaceExpanded(true);
    }
  }, [isEngineer]);

  useEffect(() => {
    if (!showPmTabs) {
      setPmDashboardTab("pm-projects");
    }
  }, [showPmTabs]);

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
        assetWorkflowRunService.listOpenIssues(activeDashboardScope),
        assetWorkflowRunService.listPendingSignatures(activeDashboardScope),
      ]);
      setOpenIssues(iss);
      setPendingSigs(sigs);
    } finally {
      setAttentionLoading(false);
    }
  }, [activeDashboardScope]);

  useEffect(() => {
    dispatch(fetchProjects(showPmTabs ? { scope: activeDashboardScope } : undefined));
    loadAttention();
    setWorkloadLoading(true);
    projectAssetService.workloadSummary(activeDashboardScope).then(setWorkload).finally(() => setWorkloadLoading(false));
    projectAssetService.listOpen(activeDashboardScope).then(setOpenAssets);
    if (isEngineer) {
      workflowConfigService.getAll().then((configs) => {
        setDraftConfigs(configs.filter((c: any) => c.status === "Draft" || c.status === "draft"));
      }).catch(() => {});
    } else {
      setDraftConfigs([]);
    }
  }, [activeDashboardScope, dispatch, loadAttention, isEngineer, showPmTabs]);

  // Phase 4 â€” evidence completeness
  useEffect(() => {
    if (!isManager) return;
    setEvidenceLoading(true);
    dashboardService.evidenceCompleteness(evidenceWindow, activeDashboardScope)
      .then(setEvidenceData)
      .catch(() => setEvidenceData(null))
      .finally(() => setEvidenceLoading(false));
  }, [activeDashboardScope, evidenceWindow, isManager]);

  // Phase 5 â€” workflow health
  useEffect(() => {
    if (!isManager) return;
    setHealthLoading(true);
    dashboardService.workflowHealth(healthWindow, activeDashboardScope)
      .then(setHealthData)
      .catch(() => setHealthData(null))
      .finally(() => setHealthLoading(false));
  }, [activeDashboardScope, healthWindow, isManager]);

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
  const myAssets   = useMemo(() => {
    if (!viewedDashboardUserId) return openAssets;
    return openAssets.filter((a) => a.assignedUserId === viewedDashboardUserId);
  }, [openAssets, viewedDashboardUserId]);
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

  // Installer: my pending sigs
  const myPendingSigs = useMemo(() =>
    pendingSigs.filter(s => myAssets.some(a => a.id === s.assetId || a.jobNumber === s.jobNumber)),
    [pendingSigs, myAssets]);
  const scopedWorkload = useMemo(() => {
    const workloadProjectIds = new Set<string>();
    const normalizedViewedName = normalizeName(viewedDashboardName);

    const scopedAssets = openAssets.filter((asset) => {
      if (!asset.assignedUserId) return false;
      if (showPmTabs && pmDashboardTab === "my-installs") {
        return !!viewedDashboardUserId && asset.assignedUserId === viewedDashboardUserId;
      }
      if (selectedDashboardId === ALL_DASHBOARDS_VALUE) return true;
      if (viewedDashboardRole === "Project Manager") {
        const project = projects.find((candidate) => candidate.id === asset.projectId);
        return normalizeName(project?.projectManager) === normalizedViewedName;
      }
      if (!viewedDashboardUserId) return true;
      return asset.assignedUserId === viewedDashboardUserId;
    });

    scopedAssets.forEach((asset) => workloadProjectIds.add(asset.projectId));
    const issueAssetIds = new Set(
      openIssues
        .filter((issue) => scopedAssets.some((asset) => asset.id === issue.assetId))
        .map((issue) => issue.assetId)
    );

    const summaryMap = new Map<string, WorkloadSummaryItem>();
    scopedAssets.forEach((asset) => {
      const userId = asset.assignedUserId!;
      const fullName =
        availableDashboardUsers.find((candidate) => candidate.id === userId)?.fullName
        ?? workload.find((item) => item.userId === userId)?.fullName
        ?? "Unknown";
      const existing = summaryMap.get(userId) ?? {
        userId,
        fullName,
        notStarted: 0,
        inProgress: 0,
        paused: 0,
        totalAssigned: 0,
        jobNumbers: [],
        hasIssues: false,
        completedSteps: 0,
        totalSteps: 0,
        startedAt: undefined,
      };

      existing.totalAssigned += 1;
      existing.completedSteps += asset.completedSteps ?? 0;
      existing.totalSteps += asset.totalSteps ?? 0;
      if (isPausedAsset(asset.runStatus)) {
        existing.paused += 1;
      } else if (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status)) {
        existing.inProgress += 1;
      } else {
        existing.notStarted += 1;
      }
      if (asset.jobNumber && !existing.jobNumbers.includes(asset.jobNumber)) {
        existing.jobNumbers.push(asset.jobNumber);
      }
      if (issueAssetIds.has(asset.id)) {
        existing.hasIssues = true;
      }

      const apiWorkload = workload.find((item) => item.userId === userId);
      if (!existing.startedAt && apiWorkload?.startedAt) {
        existing.startedAt = apiWorkload.startedAt;
      }

      summaryMap.set(userId, existing);
    });

    return Array.from(summaryMap.values()).sort((a, b) => {
      if (b.totalAssigned !== a.totalAssigned) return b.totalAssigned - a.totalAssigned;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [
    availableDashboardUsers,
    openAssets,
    openIssues,
    projects,
    selectedDashboardId,
    viewedDashboardName,
    viewedDashboardRole,
    viewedDashboardUserId,
    workload,
    showPmTabs,
    pmDashboardTab,
  ]);

  const assignmentUpdateNotifications = useMemo(
    () => unreadNotifications.filter((n) =>
      ["manager-assigned", "asset-self-assigned", "asset-takeover", "asset-assignment-updated"].includes(n.eventType)),
    [unreadNotifications]
  );
  const mediaUpdateNotifications = useMemo(
    () => unreadNotifications.filter((n) => n.eventType === "workflow-media-updated"),
    [unreadNotifications]
  );
  const photoReminderNotifications = useMemo(
    () => unreadNotifications.filter((n) => n.eventType === "missing-media-reminder"),
    [unreadNotifications]
  );
  const missingMediaNotifications = useMemo(
    () => unreadNotifications.filter((n) => n.eventType === "workflow-missing-media"),
    [unreadNotifications]
  );
  const scopedInstallerMissingMediaNotifications = useMemo(() => {
    if (!viewedDashboardUserId) return missingMediaNotifications;
    return missingMediaNotifications.filter((n) => n.triggeredByUserId === viewedDashboardUserId || !n.triggeredByUserId);
  }, [missingMediaNotifications, viewedDashboardUserId]);

  const handleDashboardChange = useCallback((event: SelectChangeEvent<string>) => {
    setSelectedDashboardId(event.target.value);
  }, []);

  const resetToOwnDashboard = useCallback(() => {
    setSelectedDashboardId(user.id);
  }, [user.id]);

  const openPhotoUploadFromNotification = useCallback(async (notification: AppNotification, mode: "installer" | "pm") => {
    if (!notification.runId || !notification.assetId) return;
    const run = await assetWorkflowRunService.getById(notification.runId);
    if (!run) return;

    const steps = parseWorkflowStepsFromSnapshot(run.workflowSnapshotJson ?? "{}");
    const results = parseStepResults(run.stepResultsJson ?? "[]");
    const { assetTag, workflowName, jobNumber } = parseMissingMediaNotification(notification);
    const missingSteps: MissingMediaFlag["missingSteps"] = [];
    let totalExpected = 0;
    let totalCaptured = 0;

    for (const step of steps) {
      const resultEntries = results.filter((entry) => entry.stepId === step.id);
      for (const input of step.inputs ?? []) {
        if (input.type !== "photo" && input.type !== "video") continue;
        totalExpected += 1;
        const captured = Math.max(0, ...resultEntries.map((entry) => countCaptures(entry.values?.[input.id])));
        if (captured > 0) {
          totalCaptured += 1;
        } else {
          missingSteps.push({
            stepId: step.id,
            stepOrder: step.order ?? totalExpected,
            stepTitle: step.title ?? step.id,
            stepDescription: step.description,
            inputId: input.id,
            inputLabel: input.label ?? (input.type === "video" ? "Video" : "Photo"),
            inputType: input.type,
            captured,
          });
        }
      }
    }

    setPhotoUploadMode(mode);
    setPhotoUploadTarget({
      id: notification.id,
      runId: notification.runId,
      assetId: notification.assetId,
      assetTag,
      jobNumber,
      workflowName,
      technicianUserId: notification.triggeredByUserId ?? "",
      technicianName: notification.triggeredByName ?? "",
      completedAt: notification.createdAtUtc,
      missingSteps,
      totalExpected,
      totalCaptured,
    });
  }, []);

  // Project status chart
  const statusGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of filteredProjects) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredProjects]);

  const lifecycleStatus = useMemo(() => deriveLifecycleStatus(filteredProjects), [filteredProjects]);
  const lifecycleCount = useMemo(
    () => filteredProjects.filter((project) => normalizeProjectStatus(project.status) === normalizeProjectStatus(lifecycleStatus)).length,
    [filteredProjects, lifecycleStatus]
  );

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
        * {label}
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
                    sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "..." : "")}
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
                    label={`${p.jobNumber} - ${p.customerName || ""}`}
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
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {pendingSigs.slice(0, 4).map((s) => (
                  <Stack key={s.runId} direction="row" alignItems="center" spacing={1}
                    sx={{ px: 1, py: 0.5, borderRadius: 1, "&:hover": { background: "rgba(255,255,255,0.04)" } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" fontWeight={600} noWrap display="block">
                        {s.jobNumber}: {s.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" display="block">
                        Completed {fmtDate(s.completedAt)}
                      </Typography>
                    </Box>
                    <SendToCustomerWidget sig={s} />
                  </Stack>
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

        {/* Job Variation */}
        <Grid item xs={12} sm={6} md={3}>
          <Box sx={{
            p: 2, borderRadius: 2, height: "100%",
            border: "1px solid", transition: "all 0.2s",
            borderColor: highIssues.length > 0 ? "warning.dark" : "rgba(255,255,255,0.08)",
            background:  highIssues.length > 0 ? "rgba(249,168,37,0.07)" : "rgba(255,255,255,0.03)",
          }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <ReportOutlined sx={{ fontSize: 18, color: highIssues.length > 0 ? "warning.main" : "text.disabled" }} />
              <Typography variant="subtitle2" fontWeight={700}>Job Variation</Typography>
            </Stack>
            <Typography variant="h4" fontWeight={700} color={highIssues.length > 0 ? "warning.main" : "text.secondary"}>
              {highIssues.length}
            </Typography>
            {highIssues.length > 0 ? (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                {highIssues.slice(0, 4).map((iss) => (
                  <ItemRow key={iss.issueId}
                    label={`${iss.jobNumber}: ${iss.assetTag}`}
                    sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "..." : "")}
                    onClick={() => navigate("/issues")} />
                ))}
                {highIssues.length > 4 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                    +{highIssues.length - 4} more
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="caption" color="success.main">No job variations</Typography>
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
                  {rp.length} projects | {rp.filter(p => p.status === "In Progress").length} in progress
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
            <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", flex: 1 }}>Project Status</Typography>
            <Typography variant="caption" color="text.disabled">{projectCount} total</Typography>
          </Stack>
          <Stack spacing={1.5}>
            {(showAllStatusProjects ? filteredProjects : filteredProjects.slice(0, 4)).map((project) => {
              const projAssets = openAssets.filter((a) => a.jobNumber === project.jobNumber);
              const total      = project.assetCount ?? projAssets.length;
              const notStarted = projAssets.filter((a) => isNotStartedAsset(a.status)).length;
              const issues     = openIssues.filter((i) => i.jobNumber === project.jobNumber).length;
              const completed  = Math.max(0, total - projAssets.length);
              const pct        = total > 0 ? Math.round((completed / total) * 100) : 0;
              return (
                <Box key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  sx={{ cursor: "pointer", "&:hover": { "& .proj-row": { background: "rgba(255,255,255,0.04)" } } }}>
                  <Stack className="proj-row" direction="row" alignItems="center" spacing={1}
                    sx={{ px: 1, py: 0.5, borderRadius: 1, transition: "background 0.15s" }}>
                    <Typography variant="caption" fontWeight={700} noWrap sx={{ flex: 1 }}>
                      {project.jobNumber}
                    </Typography>
                    <Chip
                      label={project.status}
                      size="small"
                      color={(statusColor[project.status] ?? "default") as "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"}
                      variant="outlined"
                      sx={{ fontSize: "0.62rem", height: 18 }}
                    />
                  </Stack>
                  {total > 0 && (
                    <Box sx={{ px: 1, pb: 0.5 }}>
                      <Stack direction="row" spacing={0.75} sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6rem" }}>
                          {total} total
                        </Typography>
                        {completed > 0 && (
                          <Typography variant="caption" color="success.main" sx={{ fontSize: "0.6rem" }}>
                            {completed} completed
                          </Typography>
                        )}
                        {issues > 0 && (
                          <Typography variant="caption" color="error.main" sx={{ fontSize: "0.6rem" }}>
                            {issues} issues
                          </Typography>
                        )}
                        {notStarted > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem" }}>
                            {notStarted} not started
                          </Typography>
                        )}
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <Box sx={{
                            height: "100%", borderRadius: 3,
                            width: `${pct}%`,
                            background: issues > 0 ? "#d32f2f" : pct === 100 ? "#2e7d32" : "#1976d2",
                            transition: "width 0.3s",
                          }} />
                        </Box>
                        <Typography variant="caption" fontWeight={700} sx={{ minWidth: 28, textAlign: "right", fontSize: "0.65rem" }}>
                          {pct}%
                        </Typography>
                      </Stack>
                    </Box>
                  )}
                </Box>
              );
            })}
            {filteredProjects.length === 0 && (
              <Typography variant="caption" color="text.disabled">No projects loaded.</Typography>
            )}
          </Stack>
          {filteredProjects.length >= 5 && (
            <Box sx={{ mt: 1.5, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="primary.main"
                sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                onClick={() => setShowAllStatusProjects((v) => !v)}
              >
                {showAllStatusProjects ? "Show less" : `See more (${filteredProjects.length - 4} more)`}
              </Typography>
            </Box>
          )}
        </Box>
      </Grid>
      <Grid item xs={12} md={8}>
        <Box className="glass-card" sx={{ p: 2.5, height: "100%" }}>
          <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", mb: 2 }}>Project Lifecycle</Typography>
          <StatusStepper type="External" status={lifecycleStatus} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
            {lifecycleCount} of {projectCount} visible projects currently in {lifecycleStatus}.
          </Typography>
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
              <Typography variant="caption" color="text.disabled">{healthData.totalRuns} runs in last {healthWindow} days | prev score {healthData.previousScore}%</Typography>
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
          <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
            {showPmTabs && pmDashboardTab === "my-installs"
              ? "My Install Workload"
              : selectedDashboardId === ALL_DASHBOARDS_VALUE || viewedDashboardRole === "Project Manager"
              ? "Assigned Workload"
              : `${viewedDashboardName} Workload`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {showPmTabs && pmDashboardTab === "my-installs"
              ? "Your assigned installation assets and workflow load across projects you participate in"
              : selectedDashboardId === ALL_DASHBOARDS_VALUE
              ? "Open assigned assets across all users - click to view in installations"
              : viewedDashboardRole === "Project Manager"
              ? `Open assigned assets on ${viewedDashboardName}'s projects - click to view in installations`
              : "Open assets for the selected dashboard - click to view in installations"}
          </Typography>
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
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "success.main" }} />
            <Typography variant="caption" color="text.secondary">Step progress</Typography>
          </Stack>
        </Stack>
      </Stack>
      {workloadLoading ? <LinearProgress /> : scopedWorkload.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {showPmTabs && pmDashboardTab === "my-installs"
            ? "No open assets are currently assigned to you."
            : selectedDashboardId === ALL_DASHBOARDS_VALUE ? "No open assets are currently assigned to users." : `No open assets currently assigned to ${viewedDashboardName}.`}
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {scopedWorkload.map((w) => {
            const inPct    = w.totalAssigned > 0 ? (w.inProgress / w.totalAssigned) * 100 : 0;
            const pausedPct = w.totalAssigned > 0 ? (w.paused / w.totalAssigned) * 100 : 0;
            const notPct   = w.totalAssigned > 0 ? (w.notStarted / w.totalAssigned) * 100 : 0;
            const stepPct  = w.totalSteps > 0 ? Math.min(100, (w.completedSteps / w.totalSteps) * 100) : 0;
            const load     = w.totalAssigned >= 10 ? "error" : w.totalAssigned >= 5 ? "warning" : "success";
            const loadLabel = w.totalAssigned >= 10 ? "Heavy" : w.totalAssigned >= 5 ? "Moderate" : "Light";
            const progressColor = w.hasIssues ? "warning.main" : stepPct >= 100 ? "success.main" : "success.light";
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
                          {w.inProgress} active | {w.paused} paused | {w.notStarted} queued
                        </Typography>
                        {startLabel && (
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                            | since {startLabel}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Tooltip title={
                        w.totalSteps > 0
                          ? `${w.completedSteps} / ${w.totalSteps} steps | ${w.inProgress} in-progress | ${w.paused} paused | ${w.notStarted} queued`
                          : `${w.inProgress} in progress | ${w.paused} paused | ${w.notStarted} not started`
                      } arrow>
                        <Stack spacing={0.5}>
                          <Box sx={{ position: "relative", height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "flex" }}>
                            {inPct > 0 && <Box sx={{ width: `${inPct}%`, bgcolor: "primary.main", transition: "width 0.4s" }} />}
                            {pausedPct > 0 && <Box sx={{ width: `${pausedPct}%`, bgcolor: "warning.main", transition: "width 0.4s" }} />}
                            {notPct > 0 && <Box sx={{ width: `${notPct}%`, bgcolor: "action.disabled", transition: "width 0.4s" }} />}
                          </Box>
                          {w.totalSteps > 0 && (
                            <Box sx={{ position: "relative", height: 6, borderRadius: 4, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
                              <Box sx={{ width: `${stepPct}%`, bgcolor: progressColor, height: "100%", transition: "width 0.4s" }} />
                            </Box>
                          )}
                        </Stack>
                      </Tooltip>
                      {w.totalSteps > 0 && (
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                            {w.completedSteps}/{w.totalSteps} steps
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                            {Math.round(stepPct)}%
                          </Typography>
                        </Stack>
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

      {selectedDashboardId !== user.id && (
        <Alert
          severity="info"
          onClose={resetToOwnDashboard}
          sx={{ border: "1px solid", borderColor: "info.main" }}
        >
          {selectedDashboardId === ALL_DASHBOARDS_VALUE
            ? "You are viewing the all-users dashboard, not your personal dashboard. Close this banner to return to your dashboard."
            : `You are viewing ${viewedDashboardName}'s dashboard, not your personal dashboard. Close this banner to return to your dashboard.`}
        </Alert>
      )}

      {/* â”€â”€ PERSONAL WORKSPACE STRIP â€” dashboard selector + scoped workload â”€â”€ */}
      <Box className="glass-card" sx={{ p: 2.5 }}>
        <Stack direction={{ xs: "column", lg: "row" }} alignItems={{ xs: "stretch", lg: "center" }} spacing={1.5}>
          <PersonOutlined sx={{ color: "primary.main", fontSize: 20 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", lineHeight: 1.2 }}>
              {viewedDashboardName}
            </Typography>
            <Typography variant="caption" color="text.secondary">{viewedDashboardRole} | {viewedDashboardOffice}</Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 260 } }}>
            <InputLabel id="dashboard-user-select-label">View Other User Dashboard</InputLabel>
            <Select
              labelId="dashboard-user-select-label"
              value={selectedDashboardId}
              label="View Other User Dashboard"
              onChange={handleDashboardChange}
            >
              <MenuItem value={user.id}>My Dashboard</MenuItem>
              <MenuItem value={ALL_DASHBOARDS_VALUE}>All Users</MenuItem>
              {availableDashboardUsers.filter((candidate) => candidate.id !== user.id).map((candidate) => (
                <MenuItem key={candidate.id} value={candidate.id}>
                  {candidate.fullName} | {candidate.role}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {viewingOwnDashboard ? "Dedicated dashboard" : "Alternate dashboard view"}
            </Typography>
            <Typography variant="caption" color="text.disabled" display="block">
              {selectedDashboardId === ALL_DASHBOARDS_VALUE ? "Aggregated across all users" : "Scoped to the selected user"}
            </Typography>
          </Box>
          {!isViewer && (
            <>
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
            </>
          )}
        </Stack>

        {showPmTabs && (
          <Box sx={{ mt: 1.5, borderTop: "1px solid rgba(255,255,255,0.08)", pt: 1.25 }}>
            <Tabs
              value={pmDashboardTab}
              onChange={(_, value: PmDashboardTab) => setPmDashboardTab(value)}
              variant="fullWidth"
              sx={{ minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none", fontSize: "0.85rem" } }}
            >
              <Tab value="pm-projects" label="My PM Projects" />
              <Tab value="my-installs" label="My Installs" />
            </Tabs>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
              {pmDashboardTab === "pm-projects"
                ? "Management metrics for projects where you are the assigned PM."
                : "Your assigned asset work across projects where you participate."}
            </Typography>
          </Box>
        )}

        {!isViewer && (
          <Collapse in={workspaceExpanded || isEngineer}>
            <Box sx={{ mt: 1.5 }}>
              {myAssets.length === 0 ? (
                <Typography variant="caption" color="text.disabled">
                  {selectedDashboardId === ALL_DASHBOARDS_VALUE
                    ? "No open assets found."
                    : `No assets currently assigned to ${viewingOwnDashboard ? "you" : viewedDashboardName}.`}
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
        )}
      </Box>

      {/* â•â• INSTALLER / TECHNICIAN VIEW â•â• */}
      {isInstaller && (
        <>
          {/* My Jobs Today */}
          <Box className="glass-card" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <WorkOutlineOutlined sx={{ color: "primary.main", fontSize: 20 }} />
              <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
                {viewingOwnDashboard ? "My Jobs Today" : `${viewedDashboardName}'s Jobs`}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              {selectedDashboardId === ALL_DASHBOARDS_VALUE ? "Sorted by activity across all users" : "Sorted by activity - tap to open"}
            </Typography>
            {myAssets.length === 0 ? (
              <Typography variant="caption" color="text.disabled">
                {selectedDashboardId === ALL_DASHBOARDS_VALUE ? "No jobs found." : `No jobs assigned to ${viewingOwnDashboard ? "you" : viewedDashboardName}.`}
              </Typography>
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
                    +{myAssets.length - 6} more -{" "}
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
          {canShowOwnNotifications && photoReminderNotifications.length > 0 && (
            <Stack spacing={0.5}>
              {photoReminderNotifications.map((r) => {
                const { assetTag, workflowName } = parseMissingMediaNotification(r);
                return (
                <Alert
                  key={r.id}
                  severity="info"
                  onClose={() => { void acknowledge([r.id]); }}
                >
                  <Typography variant="caption" fontWeight={600}>
                    {r.triggeredByName ?? "PM"} requested photos for: {assetTag} — {workflowName}
                  </Typography>
                </Alert>
              )})}
            </Stack>
          )}

          {/* My runs missing media */}
          {canShowOwnNotifications && scopedInstallerMissingMediaNotifications.length > 0 && (
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "warning.dark", background: "rgba(237,108,2,0.07)" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <PhotoCameraOutlined sx={{ fontSize: 18, color: "warning.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  Runs Missing Media
                </Typography>
                <Chip label={scopedInstallerMissingMediaNotifications.length} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                {selectedDashboardId === ALL_DASHBOARDS_VALUE
                  ? "Completed runs with missing photo or video evidence - tap to upload missing media"
                  : `${viewingOwnDashboard ? "Your" : `${viewedDashboardName}'s`} completed runs with missing photo or video evidence - tap to upload missing media`}
              </Typography>
              <Stack spacing={0.5}>
                {scopedInstallerMissingMediaNotifications.map((f) => {
                  const parsed = parseMissingMediaNotification(f);
                  return (
                  <Stack key={f.id} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                        {parsed.jobNumber ? `${parsed.jobNumber}: ` : ""}{parsed.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {parsed.workflowName} | {fmtDate(f.createdAtUtc)}
                      </Typography>
                      <Typography variant="caption" color="warning.main" display="block">
                        {parsed.captureText}
                      </Typography>
                    </Box>
                    <Button size="small" variant="outlined" color="warning" sx={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                      onClick={() => { void openPhotoUploadFromNotification(f, "installer"); }}>
                      Upload Media
                    </Button>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => { void acknowledge([f.id]); }}>
                      Dismiss
                    </Button>
                  </Stack>
                )})}
              </Stack>
            </Box>
          )}

          {/* Blocking Issues + Pending Signatures */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Box className="glass-card" sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <ErrorOutlineOutlined sx={{ fontSize: 18, color: myBlocking.length > 0 ? "error.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                    {viewingOwnDashboard ? "My Blocking Issues" : `${viewedDashboardName}'s Blocking Issues`}
                  </Typography>
                  <Chip label={myBlocking.length} size="small"
                    color={myBlocking.length > 0 ? "error" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                {myBlocking.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    {viewingOwnDashboard ? "No blocking issues on your jobs" : `No blocking issues on ${viewedDashboardName}'s jobs`}
                  </Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {myBlocking.map((iss) => (
                      <ItemRow key={iss.issueId}
                        label={`${iss.jobNumber}: ${iss.assetTag}`}
                        sub={iss.description.slice(0, 60) + (iss.description.length > 60 ? "..." : "")}
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
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                    {viewingOwnDashboard ? "My Pending Signatures" : `${viewedDashboardName}'s Pending Signatures`}
                  </Typography>
                  <Chip label={myPendingSigs.length} size="small"
                    color={myPendingSigs.length > 0 ? "warning" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                {myPendingSigs.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">No signatures waiting</Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {myPendingSigs.map((s) => (
                      <Stack key={s.runId} direction="row" alignItems="center" spacing={1}
                        sx={{ px: 1, py: 0.5, borderRadius: 1, "&:hover": { background: "rgba(255,255,255,0.04)" } }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="caption" fontWeight={600} noWrap display="block">
                            {s.jobNumber}: {s.assetTag}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" display="block">
                            Completed {fmtDate(s.completedAt)}
                          </Typography>
                        </Box>
                        <SendToCustomerWidget sig={s} />
                      </Stack>
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
                        sub={[a.jobNumber, a.assignedUserId ? `Assigned: ${a.assignedUserId}` : undefined].filter(Boolean).join(" | ")}
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
                  <PendingActionsOutlined sx={{ fontSize: 18, color: myPendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                    {viewingOwnDashboard ? "Sign-offs Waiting on Me" : `Sign-offs Waiting on ${viewedDashboardName}`}
                  </Typography>
                  <Chip label={myPendingSigs.length} size="small"
                    color={myPendingSigs.length > 0 ? "warning" : "default"} variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }} />
                </Stack>
                {myPendingSigs.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">No pending sign-offs</Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {myPendingSigs.slice(0, 5).map((s) => (
                      <Stack key={s.runId} direction="row" alignItems="center" spacing={1}
                        sx={{ px: 1, py: 0.5, borderRadius: 1, "&:hover": { background: "rgba(255,255,255,0.04)" } }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="caption" fontWeight={600} noWrap display="block">
                            {s.jobNumber}: {s.assetTag}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" display="block">
                            Completed {fmtDate(s.completedAt)}
                          </Typography>
                        </Box>
                        <SendToCustomerWidget sig={s} />
                      </Stack>
                    ))}
                    {myPendingSigs.length > 5 && (
                      <Typography variant="caption" color="text.disabled" sx={{ pl: 1 }}>
                        +{myPendingSigs.length - 5} more
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
                  Not yet published - review and publish
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
          {(!showPmTabs || pmDashboardTab === "pm-projects") && pendingApprovals.length > 0 && (
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

          {(!showPmTabs || pmDashboardTab === "pm-projects") && (assignmentUpdateNotifications.length > 0 || missingMediaNotifications.length > 0 || mediaUpdateNotifications.length > 0) && (
            <Grid container spacing={2}>
          {/* Assignment updates â€” PM/Admin dispatch + field takeovers */}
          {assignmentUpdateNotifications.length > 0 && (
            <Grid item xs={12} md={6}>
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "info.dark", background: "rgba(2,136,209,0.07)", height: "100%" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <PersonOutlined sx={{ fontSize: 18, color: "info.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  Assignment Updates
                </Typography>
                <Chip label={assignmentUpdateNotifications.length} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                <Button size="small" variant="text" color="info" sx={{ fontSize: "0.72rem" }}
                  onClick={() => { void acknowledge(assignmentUpdateNotifications.map((n) => n.id)); }}>
                  Dismiss all
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Planned assignments from PM/Admin and field self-assignment or takeover events
              </Typography>
              <Stack spacing={0.25}>
                {assignmentUpdateNotifications.map((f) => (
                  <Stack key={f.id} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <ItemRow
                        label={f.title}
                        sub={`${f.message} · ${fmtDate(f.createdAtUtc)}`}
                        onClick={() => navigate("/installations")}
                      />
                    </Box>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => { void acknowledge([f.id]); }}>
                      Dismiss
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
            </Grid>
          )}

          {/* Installer media updates â€” PM notification when installers upload missing media */}
          {mediaUpdateNotifications.length > 0 && (
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "info.dark", background: "rgba(2,136,209,0.07)" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <PhotoCameraOutlined sx={{ fontSize: 18, color: "info.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  Installer Media Updates
                </Typography>
                <Chip label={mediaUpdateNotifications.length} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                <Button size="small" variant="text" color="info" sx={{ fontSize: "0.72rem" }}
                  onClick={() => { void acknowledge(mediaUpdateNotifications.map((n) => n.id)); }}>
                  Dismiss all
                </Button>
              </Stack>
              <Stack spacing={0.5} mt={1}>
                {mediaUpdateNotifications.map((n) => (
                  <Stack key={n.id} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                        {n.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fmtDate(n.createdAtUtc)}
                      </Typography>
                      <Typography variant="caption" display="block" color="info.main">
                        {n.message}
                      </Typography>
                    </Box>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                      onClick={() => { void acknowledge([n.id]); }}>
                      Dismiss
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Missing media flags â€” PM sees all runs without required media */}
          {missingMediaNotifications.length > 0 && (
            <Grid item xs={12} md={6}>
            <Box className="glass-card" sx={{ p: 2, border: "1px solid", borderColor: "warning.dark", background: "rgba(237,108,2,0.07)", height: "100%" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <PhotoCameraOutlined sx={{ fontSize: 18, color: "warning.main" }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
                  Runs Missing Media
                </Typography>
                <Chip label={missingMediaNotifications.length} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                <Button size="small" variant="text" color="warning" sx={{ fontSize: "0.72rem" }}
                  onClick={() => { void acknowledge(missingMediaNotifications.map((n) => n.id)); }}>
                  Dismiss all
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Workflow runs completed without all required photos or videos captured
              </Typography>
              <Stack spacing={0.75}>
                {missingMediaNotifications.map((f) => {
                  const parsed = parseMissingMediaNotification(f);
                  return (
                  <Stack key={f.id} direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                        {parsed.jobNumber ? `${parsed.jobNumber}: ` : ""}{parsed.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {parsed.workflowName} | {f.triggeredByName ?? "Installer"} | {fmtDate(f.createdAtUtc)}
                      </Typography>
                      <Typography variant="caption" color="warning.main" display="block">
                        {parsed.captureText}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="info"
                        sx={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                        onClick={() => { void openPhotoUploadFromNotification(f, "pm"); }}
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
                          void notificationService.create({
                            eventType: "missing-media-reminder",
                            severity: "warning",
                            title: `Reminder: upload media for ${parsed.assetTag}`,
                            message: `${parsed.workflowName} | ${parsed.jobNumber} | requested by ${user.fullName ?? "PM"}`,
                            recipientUserIds: f.triggeredByUserId ? [f.triggeredByUserId] : [],
                            assetId: f.assetId,
                            runId: f.runId,
                            entityType: "asset-workflow-run",
                            entityId: f.runId,
                            triggeredByUserId: user.id,
                            triggeredByName: user.fullName ?? "PM",
                          }).then(async () => {
                            setReminderSentId(f.id);
                            await refreshNotifications();
                            window.setTimeout(() => setReminderSentId(null), 2000);
                          });
                        }}
                      >
                        {reminderSentId === f.id ? "Sent" : "Remind Installer"}
                      </Button>
                      <Button size="small" variant="text" color="inherit" sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                        onClick={() => { void acknowledge([f.id]); }}>
                        Dismiss
                      </Button>
                    </Stack>
                  </Stack>
                )})}
              </Stack>
            </Box>
            </Grid>
          )}
            </Grid>
          )}

          {/* Regional Snapshot */}
          {(!showPmTabs || pmDashboardTab === "pm-projects") && RegionalSnapshotSection}

          {/* Project Status + Lifecycle */}
          {(!showPmTabs || pmDashboardTab === "pm-projects") && ProjectStatusGrid}

          {/* Evidence + Health */}
          {(!showPmTabs || pmDashboardTab === "pm-projects") && EvidenceHealthGrid}

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
          onUpdated={async () => {
            setPhotoUploadTarget(null);
            await refreshNotifications();
          }}
        />
      )}

    </Stack>
  );
};

export default Dashboard;
