import {
  Box, Button, Chip, CircularProgress, Collapse, Divider, Grid,
  IconButton, LinearProgress, MenuItem, Paper, Select, Stack, Tooltip, Typography,
} from "@mui/material";
import {
  AssessmentOutlined, AssignmentLateOutlined, CheckCircleOutlineOutlined,
  ErrorOutlineOutlined, ExpandLessOutlined, ExpandMoreOutlined,
  FactCheckOutlined, OpenInNewOutlined, PendingActionsOutlined, PersonOutlined,
  ReportOutlined, TrendingDownOutlined, TrendingFlatOutlined, TrendingUpOutlined,
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

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
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
  const isManager  = user.role === "Admin" || user.role === "Project Manager";
  const isEngineer = user.role === "Engineer";
  const isViewer   = user.role === "Viewer";

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

  // Phase 4 — evidence
  const [evidenceData,    setEvidenceData]    = useState<EvidenceCompleteness | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceWindow,  setEvidenceWindow]  = useState(90);

  // Phase 5 — health
  const [healthData,    setHealthData]    = useState<WorkflowHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthWindow,  setHealthWindow]  = useState(90);

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
  }, [dispatch, loadAttention]);

  // Phase 4 — evidence completeness
  useEffect(() => {
    if (!isManager) return;
    setEvidenceLoading(true);
    dashboardService.evidenceCompleteness(evidenceWindow)
      .then(setEvidenceData)
      .catch(() => setEvidenceData(null))
      .finally(() => setEvidenceLoading(false));
  }, [isManager, evidenceWindow]);

  // Phase 5 — workflow health
  useEffect(() => {
    if (!isManager) return;
    setHealthLoading(true);
    dashboardService.workflowHealth(healthWindow)
      .then(setHealthData)
      .catch(() => setHealthData(null))
      .finally(() => setHealthLoading(false));
  }, [isManager, healthWindow]);

  // ── Derived ──────────────────────────────────────────────────────────────
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

  // Phase 1 — personal workspace
  const myAssets   = useMemo(() => openAssets.filter((a) => a.assignedUserId === user.id), [openAssets, user.id]);
  const myBlocking = useMemo(() => openIssues.filter((i) => i.isBlocking && myAssets.some((a) => a.id === i.assetId)), [openIssues, myAssets]);
  const myActive   = useMemo(() => myAssets.filter((a) => a.status === "InProgress" || a.status === "In Progress"), [myAssets]);
  const myQueued   = useMemo(() => myAssets.filter((a) => a.status === "NotStarted" || a.status === "Not Started"), [myAssets]);

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

  // ── Reusable: individual clickable item row ───────────────────────────────
  const ItemRow = ({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) => (
    <Box onClick={(e) => { e.stopPropagation(); onClick(); }}
      sx={{
        px: 1, py: 0.5, borderRadius: 1, cursor: "pointer",
        "&:hover": { background: "rgba(255,255,255,0.07)" },
        transition: "background 0.15s",
      }}>
      <Typography variant="caption" color="text.secondary" noWrap display="block">
        • {label}
      </Typography>
      {sub && <Typography variant="caption" color="text.disabled" noWrap display="block" sx={{ pl: 1.5, fontSize: "0.65rem" }}>{sub}</Typography>}
    </Box>
  );

  return (
    <Stack spacing={3}>

      {/* ══ Phase 1: Personal Workspace Strip ══════════════════════════════ */}
      {!isViewer && (
        <Box className="glass-card" sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <PersonOutlined sx={{ color: "primary.main", fontSize: 20 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", lineHeight: 1.2 }}>
                {user.fullName}
              </Typography>
              <Typography variant="caption" color="text.secondary">{user.role} · {user.office}</Typography>
            </Box>
            <Stack direction="row" spacing={0.75}>
              <Chip icon={<WorkOutlineOutlined sx={{ fontSize: 13 }} />}
                label={`${myActive.length} active`} size="small"
                color={myActive.length > 0 ? "primary" : "default"} variant="outlined"
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
                              {a.jobNumber} — {a.status}
                            </Typography>
                          </Box>
                          <Chip label={a.status === "InProgress" || a.status === "In Progress" ? "Active" : "Queued"}
                            size="small"
                            color={a.status === "InProgress" || a.status === "In Progress" ? "primary" : "default"}
                            variant="outlined"
                            sx={{ height: 16, fontSize: "0.58rem", flexShrink: 0 }} />
                        </Stack>
                      </Paper>
                    </Grid>
                  ))}
                  {myAssets.length > 6 && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.disabled">
                        +{myAssets.length - 6} more assets — <Box component="span" sx={{ cursor: "pointer", color: "primary.main" }} onClick={() => navigate("/installations/assets")}>view all</Box>
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* ══ Phase 2: Needs Attention (4 boxes, every item clickable) ═══════ */}
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
                      sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "…" : "")}
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
                      label={`${p.jobNumber} — ${p.customerName || ""}`}
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
                      sub={iss.description.slice(0, 50) + (iss.description.length > 50 ? "…" : "")}
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

      {/* ══ Phase 3: Regional snapshot + Project Status — hidden for Engineers ══ */}
      {!isEngineer && (
        <>
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
                        {rp.length} projects · {rp.filter(p => p.status === "In Progress").length} in progress
                      </Typography>
                      <Typography variant="body2" color="text.secondary">{rAssets} active installations</Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </Box>

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
        </>
      )}

      {/* ══ Phase 4 & 5: Evidence + Health — Managers only ════════════════ */}
      {isManager && (
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
                  <Typography variant="caption" color="text.disabled">{healthData.totalRuns} runs in last {healthWindow} days · prev score {healthData.previousScore}%</Typography>
                </Stack>
              ) : (
                <Typography variant="caption" color="text.disabled">No data available for selected window.</Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      )}

      {/* ══ Technician Workload — Managers only ════════════════════════════ */}
      {isManager && (
        <Box className="glass-card" sx={{ p: 3 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontFamily: "Sora" }}>Technician Workload</Typography>
              <Typography variant="caption" color="text.secondary">Open assets — click to view in installations</Typography>
            </Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "primary.main" }} />
                <Typography variant="caption" color="text.secondary">In progress</Typography>
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
                              {w.inProgress} active · {w.notStarted} queued
                            </Typography>
                            {startLabel && (
                              <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                                · since {startLabel}
                              </Typography>
                            )}
                          </Stack>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Tooltip title={
                            w.totalSteps > 0
                              ? `${w.completedSteps} / ${w.totalSteps} steps · ${w.inProgress} in-progress · ${w.notStarted} queued`
                              : `${w.inProgress} in progress · ${w.notStarted} not started`
                          } arrow>
                            <Box sx={{ position: "relative", height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "flex" }}>
                              {w.totalSteps > 0 ? (
                                // Step-based progress bar
                                <Box sx={{ width: `${stepPct}%`, bgcolor: barColor, transition: "width 0.4s" }} />
                              ) : (
                                // Asset-based progress bar
                                <>
                                  {inPct > 0 && <Box sx={{ width: `${inPct}%`, bgcolor: barColor, transition: "width 0.4s" }} />}
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
      )}

    </Stack>
  );
};

export default Dashboard;
