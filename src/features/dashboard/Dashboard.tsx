import { Box, Button, Chip, CircularProgress, Divider, Grid, IconButton, LinearProgress, Paper, Stack, Tooltip, Typography } from "@mui/material";
import {
  AssessmentOutlined,
  AssignmentLateOutlined,
  CheckCircleOutlineOutlined,
  ErrorOutlineOutlined,
  OpenInNewOutlined,
  PendingActionsOutlined,
  TrendingUpOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SummaryCard from "../../components/ui/SummaryCard";
import StatusStepper from "../../components/ui/StatusStepper";
import { demoProducts } from "../../data/demo";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchInstallations } from "../../store/installationSlice";
import { fetchProducts } from "../../store/productsSlice";
import { fetchProjects } from "../../store/projectSlice";
import { officesService } from "../../services/officesService";
import { assetWorkflowRunService, type OpenIssueRecord, type PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import { projectAssetService, type WorkloadSummaryItem } from "../../services/projectAssetService";
import { generateTechnicianReport, type TechnicianReportData } from "../../utils/generateTechnicianReport";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const dispatch = useAppDispatch();
  const projectsState     = useAppSelector((state) => state.projects);
  const installationsState = useAppSelector((state) => state.installations);
  const productsState     = useAppSelector((state) => state.products);
  const products          = productsState.items.length ? productsState.items : demoProducts;
  const projects          = projectsState.items;
  const installations     = installationsState.items;

  const [globalOffices,       setGlobalOffices]       = useState<Office[]>([]);
  const [availableCountries,  setAvailableCountries]  = useState<string[]>([]);
  const [openIssues,          setOpenIssues]          = useState<OpenIssueRecord[]>([]);
  const [pendingSigs,         setPendingSigs]         = useState<PendingSignatureRecord[]>([]);
  const [attentionLoading,    setAttentionLoading]    = useState(false);
  const [workload,            setWorkload]            = useState<WorkloadSummaryItem[]>([]);
  const [workloadLoading,     setWorkloadLoading]     = useState(false);
  const [reportingTechId,     setReportingTechId]     = useState<string | null>(null);

  const countryForOffice = useMemo(() => createCountryResolver(globalOffices), [globalOffices]);

  async function handleGenerateTechReport(w: WorkloadSummaryItem) {
    setReportingTechId(w.userId);
    try {
      const exportDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      const reportData: TechnicianReportData = {
        technicianName: w.fullName,
        reportPeriod: exportDate,
        runs: [],
        assets: [],
        exportDate,
      };
      await generateTechnicianReport(reportData);
    } finally {
      setReportingTechId(null);
    }
  }

  useEffect(() => {
    officesService.getAll().then((offices) => {
      setGlobalOffices(offices);
      const countries = Array.from(new Set(offices.map((o) => o.country).filter(Boolean)));
      setAvailableCountries(countries.sort());
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
    dispatch(fetchProducts());
    dispatch(fetchProjects());
    dispatch(fetchInstallations());
    loadAttention();
    setWorkloadLoading(true);
    projectAssetService.workloadSummary().then(setWorkload).finally(() => setWorkloadLoading(false));
  }, [dispatch, loadAttention]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const filteredProjects = useMemo(() => {
    if (activeOffice === "All") return projects;
    return projects.filter((p) => {
      const c = countryForOffice(p.office);
      return c === activeOffice || p.office === activeOffice;
    });
  }, [activeOffice, projects, countryForOffice]);

  const filteredInstallations = useMemo(() => {
    if (activeOffice === "All") return installations;
    return installations.filter((i) => {
      const c = countryForOffice(i.office);
      return c === activeOffice || i.office === activeOffice;
    });
  }, [activeOffice, installations, countryForOffice]);

  const productCount            = products.length;
  const projectCount            = filteredProjects.length;
  const activeInstallationsCount = filteredInstallations.filter((i) => ["Scheduled", "In Progress"].includes(i.status)).length;
  const pendingApprovalCount    = filteredProjects.filter((p) => p.status === "Pending Approval").length;
  const inProgressCount         = filteredProjects.filter((p) => p.status === "In Progress").length;

  // Needs Attention derived
  const blockingIssues  = openIssues.filter((i) => i.isBlocking);
  const highIssues      = openIssues.filter((i) => !i.isBlocking && i.severity === "high");
  const overdueProjects = filteredProjects.filter((p) => {
    if (!p.finishDate || p.status === "Completed" || p.status === "Cancelled") return false;
    return new Date(p.finishDate) < new Date();
  });

  const attentionCount = blockingIssues.length + pendingSigs.length + overdueProjects.length;

  // ── Project status breakdown ────────────────────────────────────────────────
  const statusGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of filteredProjects) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredProjects]);

  const statusColor: Record<string, string> = {
    "In Progress": "primary",
    "Completed":   "success",
    "Pending Approval": "warning",
    "Cancelled":   "error",
    "Draft":       "default",
    "Approved":    "info",
    "On Hold":     "warning",
  };

  return (
    <Stack spacing={3}>

      {/* ── Row 1: Top KPI summary cards (existing, unchanged) ── */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} flexWrap="wrap" useFlexGap>
        <SummaryCard title="Total Projects"       value={String(projectCount)}             trend={`${inProgressCount} in progress`} />
        <SummaryCard title="Active Installations" value={String(activeInstallationsCount)} trend="Scheduled + In Progress" />
        <SummaryCard title="Pending Approvals"    value={String(pendingApprovalCount)}     trend="Awaiting review" />
        <SummaryCard title="Products"             value={String(productCount)}             trend="Catalog size" />
      </Stack>

      {/* ── Row 2: Needs Attention (NEW) ── */}
      <Box className="glass-card" sx={{ padding: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <WarningAmberOutlined sx={{ color: attentionCount > 0 ? "warning.main" : "success.main", fontSize: 20 }} />
          <Typography variant="h6" sx={{ fontFamily: "Sora" }}>
            Needs Attention
          </Typography>
          {attentionLoading && <CircularProgress size={14} sx={{ ml: 1 }} />}
          {attentionCount === 0 && !attentionLoading && (
            <Chip label="All clear" size="small" color="success" variant="outlined" sx={{ ml: 1, height: 20, fontSize: "0.7rem" }} />
          )}
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="text" component={Link} to="/issues" endIcon={<OpenInNewOutlined sx={{ fontSize: 13 }} />}
            sx={{ fontSize: "0.72rem" }}>
            Issues Board
          </Button>
        </Stack>

        <Grid container spacing={2}>
          {/* Blocking Issues */}
          <Grid item xs={12} md={4}>
            <Box
              onClick={() => navigate("/issues")}
              sx={{
                p: 2, borderRadius: 2, cursor: "pointer", transition: "all 0.2s",
                border: "1px solid",
                borderColor: blockingIssues.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
                background:  blockingIssues.length > 0 ? "rgba(211,47,47,0.07)" : "rgba(255,255,255,0.03)",
                "&:hover": { background: blockingIssues.length > 0 ? "rgba(211,47,47,0.12)" : "rgba(255,255,255,0.06)" },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <ErrorOutlineOutlined sx={{ fontSize: 18, color: blockingIssues.length > 0 ? "error.main" : "text.disabled" }} />
                <Typography variant="subtitle2" fontWeight={700}>Blocking Issues</Typography>
              </Stack>
              <Typography variant="h4" fontWeight={700} color={blockingIssues.length > 0 ? "error.main" : "text.secondary"}>
                {blockingIssues.length}
              </Typography>
              {blockingIssues.length > 0 ? (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  {blockingIssues.slice(0, 3).map((iss) => (
                    <Typography key={iss.issueId} variant="caption" color="text.secondary" noWrap>
                      • {iss.jobNumber}: {iss.assetTag} — {iss.description.slice(0, 50)}{iss.description.length > 50 ? "…" : ""}
                    </Typography>
                  ))}
                  {blockingIssues.length > 3 && (
                    <Typography variant="caption" color="text.disabled">+{blockingIssues.length - 3} more</Typography>
                  )}
                </Stack>
              ) : (
                <Typography variant="caption" color="success.main">No blocking issues</Typography>
              )}
              {highIssues.length > 0 && (
                <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 0.5 }}>
                  +{highIssues.length} high-severity observations
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Pending Signatures */}
          <Grid item xs={12} md={4}>
            <Box
              onClick={() => navigate("/projects")}
              sx={{
                p: 2, borderRadius: 2, cursor: "pointer", transition: "all 0.2s",
                border: "1px solid",
                borderColor: pendingSigs.length > 0 ? "warning.main" : "rgba(255,255,255,0.08)",
                background:  pendingSigs.length > 0 ? "rgba(230,119,0,0.07)" : "rgba(255,255,255,0.03)",
                "&:hover": { background: pendingSigs.length > 0 ? "rgba(230,119,0,0.12)" : "rgba(255,255,255,0.06)" },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <PendingActionsOutlined sx={{ fontSize: 18, color: pendingSigs.length > 0 ? "warning.main" : "text.disabled" }} />
                <Typography variant="subtitle2" fontWeight={700}>Pending Signatures</Typography>
              </Stack>
              <Typography variant="h4" fontWeight={700} color={pendingSigs.length > 0 ? "warning.main" : "text.secondary"}>
                {pendingSigs.length}
              </Typography>
              {pendingSigs.length > 0 ? (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  {pendingSigs.slice(0, 3).map((s) => (
                    <Typography key={s.runId} variant="caption" color="text.secondary" noWrap>
                      • {s.jobNumber}: {s.assetTag} — completed {fmtDate(s.completedAt)}
                    </Typography>
                  ))}
                  {pendingSigs.length > 3 && (
                    <Typography variant="caption" color="text.disabled">+{pendingSigs.length - 3} more</Typography>
                  )}
                </Stack>
              ) : (
                <Typography variant="caption" color="success.main">All signatures collected</Typography>
              )}
            </Box>
          </Grid>

          {/* Overdue Projects */}
          <Grid item xs={12} md={4}>
            <Box
              onClick={() => navigate("/projects")}
              sx={{
                p: 2, borderRadius: 2, cursor: "pointer", transition: "all 0.2s",
                border: "1px solid",
                borderColor: overdueProjects.length > 0 ? "error.main" : "rgba(255,255,255,0.08)",
                background:  overdueProjects.length > 0 ? "rgba(211,47,47,0.07)" : "rgba(255,255,255,0.03)",
                "&:hover": { background: overdueProjects.length > 0 ? "rgba(211,47,47,0.12)" : "rgba(255,255,255,0.06)" },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <AssignmentLateOutlined sx={{ fontSize: 18, color: overdueProjects.length > 0 ? "error.main" : "text.disabled" }} />
                <Typography variant="subtitle2" fontWeight={700}>Overdue Projects</Typography>
              </Stack>
              <Typography variant="h4" fontWeight={700} color={overdueProjects.length > 0 ? "error.main" : "text.secondary"}>
                {overdueProjects.length}
              </Typography>
              {overdueProjects.length > 0 ? (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  {overdueProjects.slice(0, 3).map((p) => (
                    <Typography key={p.id} variant="caption" color="text.secondary" noWrap>
                      • {p.jobNumber} — due {fmtDate(p.finishDate)}
                    </Typography>
                  ))}
                  {overdueProjects.length > 3 && (
                    <Typography variant="caption" color="text.disabled">+{overdueProjects.length - 3} more</Typography>
                  )}
                </Stack>
              ) : (
                <Typography variant="caption" color="success.main">No overdue projects</Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Box>

      {/* ── Row 3: Project pipeline + Status breakdown ── */}
      <Grid container spacing={2}>
        {/* Project status breakdown (left) */}
        <Grid item xs={12} md={4}>
          <Box className="glass-card" sx={{ padding: 2.5, height: "100%" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <TrendingUpOutlined sx={{ fontSize: 18, color: "primary.main" }} />
              <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem" }}>Project Status</Typography>
            </Stack>
            <Stack spacing={1.25}>
              {statusGroups.map(([status, count]) => (
                <Stack key={status} direction="row" alignItems="center" spacing={1.5}>
                  <Chip
                    label={status}
                    size="small"
                    color={(statusColor[status] ?? "default") as "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"}
                    variant="outlined"
                    sx={{ fontSize: "0.68rem", height: 20, minWidth: 100 }}
                  />
                  <Box sx={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <Box sx={{
                      height: "100%", borderRadius: 3,
                      width: `${Math.round((count / projectCount) * 100)}%`,
                      background: status === "Completed" ? "#2e7d32" :
                                  status === "In Progress" ? "#1976d2" :
                                  status === "Pending Approval" ? "#ed6c02" :
                                  status === "Cancelled" ? "#d32f2f" : "#555",
                    }} />
                  </Box>
                  <Typography variant="caption" fontWeight={700} sx={{ minWidth: 24, textAlign: "right" }}>{count}</Typography>
                </Stack>
              ))}
              {statusGroups.length === 0 && (
                <Typography variant="caption" color="text.disabled">No projects loaded yet.</Typography>
              )}
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={1}>
              <CheckCircleOutlineOutlined sx={{ fontSize: 14, color: "success.main", mt: 0.25 }} />
              <Typography variant="caption" color="text.secondary">
                {filteredProjects.filter(p => p.status === "Completed").length} of {projectCount} projects completed
              </Typography>
            </Stack>
          </Box>
        </Grid>

        {/* Status stepper (right) — existing widget, unchanged */}
        <Grid item xs={12} md={8}>
          <Box className="glass-card" sx={{ padding: 2.5, height: "100%" }}>
            <Typography variant="h6" sx={{ fontFamily: "Sora", fontSize: "1rem", mb: 2 }}>Project Lifecycle</Typography>
            <StatusStepper type="External" status="Pending Approval" />
          </Box>
        </Grid>
      </Grid>

      {/* ── Row 4: Regional Snapshot (existing, unchanged) ── */}
      <Box className="glass-card" sx={{ padding: 3 }}>
        <Typography variant="h6" gutterBottom>
          Regional snapshot ({activeOffice})
        </Typography>
        <Grid container spacing={2}>
          {(activeOffice === "All" ? availableCountries : [activeOffice]).map((region) => {
            const regionProjects = projects.filter((p) => {
              const c = countryForOffice(p.office);
              return c === region || p.office === region;
            });
            const regionInstallations = installations.filter((i) => {
              const c = countryForOffice(i.office);
              return c === region || i.office === region;
            });
            const regionActiveInstalls = regionInstallations.filter((i) =>
              ["Scheduled", "In Progress"].includes(i.status)
            ).length;
            const regionInProgress = regionProjects.filter(p => p.status === "In Progress").length;
            return (
              <Grid key={region} item xs={12} md={4}>
                <Box
                  onClick={() => { updateActiveOffice(region); navigate("/projects"); }}
                  sx={{
                    padding: 2, borderRadius: 2,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    cursor: "pointer", transition: "all 0.2s",
                    "&:hover": { background: "rgba(45,212,191,0.1)", borderColor: "rgba(45,212,191,0.3)", transform: "translateY(-2px)" }
                  }}
                >
                  <Typography variant="subtitle1" sx={{ fontFamily: "Sora" }}>{region}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {regionProjects.length} projects · {regionInProgress} in progress
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {regionActiveInstalls} active installations
                  </Typography>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </Box>

      {/* ── Technician Workload Panel ── */}
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
        {workloadLoading ? (
          <LinearProgress />
        ) : workload.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No open assets currently assigned to technicians.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {workload.map((w) => {
              const inPct  = w.totalAssigned > 0 ? (w.inProgress  / w.totalAssigned) * 100 : 0;
              const notPct = w.totalAssigned > 0 ? (w.notStarted  / w.totalAssigned) * 100 : 0;
              const load   = w.totalAssigned >= 10 ? "error" : w.totalAssigned >= 5 ? "warning" : "success";
              const loadLabel = w.totalAssigned >= 10 ? "Heavy" : w.totalAssigned >= 5 ? "Moderate" : "Light";
              return (
                <Paper
                  key={w.userId}
                  elevation={0}
                  onClick={() => navigate("/installations/assets")}
                  sx={{
                    p: 1.5, border: "1px solid var(--stroke)", borderRadius: 1.5,
                    cursor: "pointer", transition: "all 0.15s",
                    "&:hover": { borderColor: "primary.main", background: "rgba(45,212,191,0.04)" },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{ flex: "0 0 160px", minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="body2" fontWeight={600} noWrap>{w.fullName}</Typography>
                        <Chip label={loadLabel} size="small" color={load} variant="outlined" sx={{ height: 16, fontSize: "0.6rem", flexShrink: 0 }} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {w.inProgress} active · {w.notStarted} queued · {w.totalAssigned} total
                      </Typography>
                    </Box>
                    <Tooltip title={`${w.inProgress} in progress · ${w.notStarted} not started`} arrow>
                      <Box sx={{ flex: 1, height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "flex" }}>
                        {inPct > 0 && (
                          <Box sx={{ width: `${inPct}%`, bgcolor: "primary.main", transition: "width 0.4s" }} />
                        )}
                        {notPct > 0 && (
                          <Box sx={{ width: `${notPct}%`, bgcolor: "action.disabled", transition: "width 0.4s" }} />
                        )}
                      </Box>
                    </Tooltip>
                    <Chip
                      label={w.totalAssigned}
                      size="small"
                      color={load}
                      sx={{ fontWeight: 700, minWidth: 40 }}
                    />
                    <Tooltip title="Generate technician report">
                      <span>
                        <IconButton
                          size="small"
                          disabled={reportingTechId === w.userId}
                          onClick={(e) => { e.stopPropagation(); void handleGenerateTechReport(w); }}
                          sx={{ color: "text.secondary", flexShrink: 0 }}
                        >
                          {reportingTechId === w.userId
                            ? <CircularProgress size={14} />
                            : <AssessmentOutlined sx={{ fontSize: 16 }} />
                          }
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>

    </Stack>
  );
};

export default Dashboard;
