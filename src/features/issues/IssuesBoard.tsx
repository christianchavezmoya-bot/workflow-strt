import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Grid,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  ArrowDropDown,
  CheckCircleOutlineOutlined,
  CheckCircleOutlined,
  ErrorOutlineOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  FileDownloadOutlined,
  FilterListOutlined,
  HistoryOutlined,
  OpenInNewOutlined,
  RefreshOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { Link } from "react-router-dom";
import { assetWorkflowRunService, type OpenIssueRecord, type ClosedIssueRecord } from "../../services/assetWorkflowRunService";
import { projectAssetService } from "../../services/projectAssetService";
import type { RunIssue } from "../../types/assetWorkflowRun";
import type { AssetIssue } from "../../types/projectAsset";
import MediaCapture from "../../components/ui/MediaCapture";
import { useAuth } from "../../hooks/useAuth";
import { isMobileNativePlatform } from "../../utils/platform";
import { exportIssuesExcel, exportIssuesPdf } from "../../utils/exportIssuesBoard";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function severityColor(s: string): "error" | "warning" | "default" {
  if (s === "high")   return "error";
  if (s === "medium") return "warning";
  return "default";
}

function typeLabel(t: string): string {
  if (t === "blocking")        return "Blocking";
  if (t === "scope-deviation") return "Scope";
  return "Obs";
}

function typeColor(t: string): "error" | "warning" | "info" {
  if (t === "blocking")        return "error";
  if (t === "scope-deviation") return "warning";
  return "info";
}

function buildIssueRepairPath(issue: Pick<OpenIssueRecord | ClosedIssueRecord, "projectId" | "assetId" | "runId" | "issueId" | "source">) {
  const query = new URLSearchParams({
    project: issue.projectId,
    asset: issue.assetId,
    action: "issue",
    run: issue.runId,
    issue: issue.issueId,
    issueSource: issue.source,
  });
  return `/installations/assets?${query.toString()}`;
}

// ─── component ────────────────────────────────────────────────────────────────

const IssuesBoard = () => {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { user } = useAuth();
  const currentUserName = user?.fullName ?? user?.email ?? "Unknown";

  const [activeTab,      setActiveTab]      = useState<"open" | "history">("open");
  const [issues,         setIssues]         = useState<OpenIssueRecord[]>([]);
  const [closedIssues,   setClosedIssues]   = useState<ClosedIssueRecord[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterProject,  setFilterProject]  = useState("__all__");
  const [filterSeverity, setFilterSeverity] = useState("__all__");
  const [filterType,     setFilterType]     = useState("__all__");
  const [searchText,     setSearchText]     = useState("");

  // ── Expanded row state ─────────────────────────────────────────────────────
  const [expandedKey,       setExpandedKey]       = useState<string | null>(null);
  const [resolutionNotes,   setResolutionNotes]   = useState<Record<string, string>>({});
  const [resolutionMedia,   setResolutionMedia]   = useState<Record<string, string[]>>({});
  const [closingKey,        setClosingKey]        = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setIssues(await assetWorkflowRunService.listOpenIssues()); }
    finally { setLoading(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try { setClosedIssues(await assetWorkflowRunService.listClosedIssues()); }
    finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    void assetWorkflowRunService.listOpenIssues()
      .then(setIssues)
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab, loadHistory]);

  // ── Listen for local issue changes so Issues Board refreshes live, offline or online.
  //    Mirrors the pattern already used by the Assets page for asset updates.
  useEffect(() => {
    const h = () => void load();
    window.addEventListener("repo:issues:updated", h);
    return () => window.removeEventListener("repo:issues:updated", h);
  }, [load]);


  // ── Derived filter options ─────────────────────────────────────────────────
  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of issues) if (!seen.has(i.projectId)) seen.set(i.projectId, `${i.jobNumber} — ${i.customerName}`);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [issues]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchText.toLowerCase();
    return issues.filter(i => {
      if (filterProject  !== "__all__" && i.projectId  !== filterProject)  return false;
      if (filterSeverity !== "__all__" && i.severity   !== filterSeverity) return false;
      if (filterType     !== "__all__" && i.issueType  !== filterType)     return false;
      if (q && !i.description.toLowerCase().includes(q) &&
               !i.assetTag.toLowerCase().includes(q) &&
               !i.jobNumber.toLowerCase().includes(q) &&
               !i.customerName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [issues, filterProject, filterSeverity, filterType, searchText]);

  // ── History filters ───────────────────────────────────────────────────────
  const filteredHistory = useMemo(() => {
    const q = searchText.toLowerCase();
    return closedIssues.filter(i => {
      if (filterProject  !== "__all__" && i.projectId  !== filterProject)  return false;
      if (filterSeverity !== "__all__" && i.severity   !== filterSeverity) return false;
      if (filterType     !== "__all__" && i.issueType  !== filterType)     return false;
      if (q && !i.description.toLowerCase().includes(q) &&
               !i.assetTag.toLowerCase().includes(q) &&
               !i.jobNumber.toLowerCase().includes(q) &&
               !i.customerName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [closedIssues, filterProject, filterSeverity, filterType, searchText]);

  const historyProjectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of closedIssues) if (!seen.has(i.projectId)) seen.set(i.projectId, `${i.jobNumber} — ${i.customerName}`);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [closedIssues]);

  // ── Column sort / filter ─────────────────────────────────────────────────
  const [autoSort,    setAutoSort]    = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [autoFilters, setAutoFilters] = useState<Record<string, Set<string>>>({});
  const [autoMenu,    setAutoMenu]    = useState<{ anchorEl: HTMLElement | null; key: string }>({ anchorEl: null, key: "" });
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);

  const n = (v: string | null | undefined) => String(v ?? "");

  const issueAccessors = useMemo(() => ({
    type:        (i: OpenIssueRecord) => n(i.issueType),
    severity:    (i: OpenIssueRecord) => n(i.severity),
    description: (i: OpenIssueRecord) => n(i.description),
    step:        (i: OpenIssueRecord) => n(i.stepTitle),
    asset:       (i: OpenIssueRecord) => n(i.assetTag),
    project:     (i: OpenIssueRecord) => n(i.jobNumber),
    reported:    (i: OpenIssueRecord) => n(i.reportedAt),
    by:          (i: OpenIssueRecord) => n(i.createdBy),
  }), []);

  const historyAccessors = useMemo(() => ({
    type:             (i: ClosedIssueRecord) => n(i.issueType),
    severity:         (i: ClosedIssueRecord) => n(i.severity),
    description:      (i: ClosedIssueRecord) => n(i.description),
    step:             (i: ClosedIssueRecord) => n(i.stepTitle),
    asset:            (i: ClosedIssueRecord) => n(i.assetTag),
    project:          (i: ClosedIssueRecord) => n(i.jobNumber),
    reported:         (i: ClosedIssueRecord) => n(i.reportedAt),
    closedBy:         (i: ClosedIssueRecord) => n(i.resolvedBy),
    closed:           (i: ClosedIssueRecord) => n(i.resolvedAt),
    correctiveAction: (i: ClosedIssueRecord) => n(i.resolutionNote),
  }), []);

  const issueFilterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    (["type","severity","asset","project","by"] as const).forEach((k) => {
      opts[k] = Array.from(new Set(filtered.map((i) => issueAccessors[k](i)))).sort();
    });
    return opts;
  }, [filtered, issueAccessors]);

  const historyFilterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    (["type","severity","asset","project","closedBy"] as const).forEach((k) => {
      opts[k] = Array.from(new Set(filteredHistory.map((i) => historyAccessors[k](i)))).sort();
    });
    return opts;
  }, [filteredHistory, historyAccessors]);

  const applyColFilter = <T,>(rows: T[], accessors: Record<string, (r: T) => string>) =>
    rows.filter((r) => Object.entries(autoFilters).every(([k, sel]) => !sel?.size || sel.has(accessors[k]?.(r) ?? "")));

  const applyColSort = <T,>(rows: T[], accessors: Record<string, (r: T) => string>) => {
    if (!autoSort.key || !accessors[autoSort.key]) return rows;
    const acc = accessors[autoSort.key];
    return [...rows].sort((a, b) => {
      const av = acc(a).toLowerCase(), bv = acc(b).toLowerCase();
      return av < bv ? (autoSort.dir === "asc" ? -1 : 1) : av > bv ? (autoSort.dir === "asc" ? 1 : -1) : 0;
    });
  };

  const sortedFiltered = useMemo(
    () => applyColSort(applyColFilter(filtered, issueAccessors), issueAccessors),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, autoFilters, autoSort, issueAccessors]
  );

  const sortedHistory = useMemo(
    () => applyColSort(applyColFilter(filteredHistory, historyAccessors), historyAccessors),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredHistory, autoFilters, autoSort, historyAccessors]
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const blockingCount    = issues.filter(i => i.isBlocking).length;
  const mediumCount      = issues.filter(i => i.severity === "medium").length;
  const projectsAffected = new Set(issues.map(i => i.projectId)).size;

  // ── Close issue ───────────────────────────────────────────────────────────
  async function handleCloseIssue(iss: OpenIssueRecord) {
    const key  = `${iss.source}-${iss.assetId}-${iss.issueId}`;
    const note = (resolutionNotes[key] ?? "").trim();
    if (!note) return;
    setClosingKey(key);
    const now = new Date().toISOString();
    const media = (resolutionMedia[key] ?? []).length > 0 ? resolutionMedia[key] : undefined;
    try {
      if (iss.source === "asset") {
        // Manually-added issue lives on the asset record
        const asset = await projectAssetService.getById(iss.assetId);
        if (!asset) throw new Error("Asset not found");
        let assetIssues: AssetIssue[] = [];
        try { assetIssues = JSON.parse(asset.issuesJson ?? "[]"); } catch { /* empty */ }
        assetIssues = assetIssues.map(ai =>
          ai.id === iss.issueId
            ? { ...ai, resolved: true, resolutionNote: note, resolutionMedia: media, resolvedAt: now, resolvedBy: currentUserName }
            : ai
        );
        const anyOpen = assetIssues.some(ai => !ai.resolved);
        await projectAssetService.patchIssues(iss.assetId, JSON.stringify(assetIssues));
        if (!anyOpen) {
          try {
            await projectAssetService.update(iss.assetId, { status: "Complete" });
          } catch {
            // Non-fatal — issue close is queued; status may refresh on sync.
          }
        }
      } else {
        // Issue lives on a workflow run
        const run = await assetWorkflowRunService.getById(iss.runId);
        if (!run) throw new Error("Run not found");
        let runIssues: RunIssue[] = [];
        try { runIssues = JSON.parse(run.issuesJson ?? "[]"); } catch { /* empty */ }
        runIssues = runIssues.map(ri =>
          ri.id === iss.issueId
            ? { ...ri, resolved: true, resolutionNote: note, resolutionMedia: media, resolvedAt: now, resolvedBy: currentUserName }
            : ri
        );
        await assetWorkflowRunService.patchIssues(iss.runId, JSON.stringify(runIssues));
      }
      // Optimistic remove from list + refresh history
      setIssues(prev => prev.filter(i => !(i.assetId === iss.assetId && i.issueId === iss.issueId)));
      setExpandedKey(null);
      void loadHistory();
    } catch (e) {
      console.error("Failed to close issue", e);
      alert(e instanceof Error ? e.message : "Failed to close issue. Try again when back online.");
    } finally {
      setClosingKey(null);
    }
  }

  function toggleExpand(key: string) {
    setExpandedKey(prev => prev === key ? null : key);
  }

  const exportRows = activeTab === "history" ? sortedHistory : sortedFiltered;
  const exportDateLabel = new Date().toLocaleDateString();

  const handleExportPdf = () => {
    setExportAnchor(null);
    exportIssuesPdf({
      mode: activeTab === "history" ? "history" : "open",
      exportDate: exportDateLabel,
      rows: exportRows,
    });
  };

  const handleExportExcel = () => {
    setExportAnchor(null);
    exportIssuesExcel({
      mode: activeTab === "history" ? "history" : "open",
      exportDate: exportDateLabel,
      rows: exportRows,
    });
  };

  return (
    <Stack spacing={3}>
      {/* ── Header ── */}
      <Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>Issues Board</Typography>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={loading}>
              {loading ? <CircularProgress size={16} /> : <RefreshOutlined fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }}>
          All open unresolved issues across every project and workflow run.
        </Typography>
      </Box>

      {/* ── Tabs ── */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", minHeight: 36 }}
        TabIndicatorProps={{ sx: { height: 2 } }}
      >
        <Tab
          value="open"
          label={
            <Stack direction="row" spacing={0.75} alignItems="center">
              <WarningAmberOutlined sx={{ fontSize: 15 }} />
              <span>Open Issues</span>
              {issues.length > 0 && (
                <Chip label={issues.length} size="small" color="error" sx={{ height: 16, fontSize: "0.65rem", "& .MuiChip-label": { px: 0.75 } }} />
              )}
            </Stack>
          }
          sx={{ minHeight: 36, fontSize: "0.8rem", textTransform: "none" }}
        />
        <Tab
          value="history"
          label={
            <Stack direction="row" spacing={0.75} alignItems="center">
              <HistoryOutlined sx={{ fontSize: 15 }} />
              <span>History</span>
            </Stack>
          }
          sx={{ minHeight: 36, fontSize: "0.8rem", textTransform: "none" }}
        />
      </Tabs>

      {/* ── KPI strip (open only) ── */}
      {activeTab === "open" && (
        <Grid container spacing={1}>
          {[
            { label: "Blocking",  value: blockingCount,    color: "error.main"   },
            { label: "Medium",    value: mediumCount,      color: "warning.main" },
            { label: "Total Open",value: issues.length,    color: "text.primary" },
            { label: "Projects",  value: projectsAffected, color: "text.primary" },
          ].map(({ label, value, color }) => (
            <Grid item xs={3} key={label}>
              <Box className="glass-card" sx={{ py: { xs: 1, md: 1.5 }, px: { xs: 0.5, md: 2 }, textAlign: "center" }}>
                <Typography variant="h5" fontWeight={700} color={color} sx={{ fontSize: { xs: "1.2rem", md: "2rem" } }}>
                  {value}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: "0.58rem", md: "0.75rem" }, lineHeight: 1.2, display: "block" }}>
                  {label}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── Filters ── */}
      <Stack spacing={1}>
        <TextField
          size="small"
          placeholder="Search description, asset, project…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          fullWidth
        />
        <Stack direction="row" spacing={1} alignItems="center">
          <FilterListOutlined sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }} />
          <Select
            size="small"
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            displayEmpty
            sx={{ flex: 1, minWidth: 0, fontSize: { xs: "0.72rem", md: "0.875rem" } }}
          >
            <MenuItem value="__all__">Project</MenuItem>
            {(activeTab === "history" ? historyProjectOptions : projectOptions).map(([id, label]) => (
              <MenuItem key={id} value={id} sx={{ fontSize: "0.8rem" }}>{label}</MenuItem>
            ))}
          </Select>
          <Select size="small" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} displayEmpty
            sx={{ flex: 1, minWidth: 0, fontSize: { xs: "0.72rem", md: "0.875rem" } }}>
            <MenuItem value="__all__">Severity</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="low">Low</MenuItem>
          </Select>
          <Select size="small" value={filterType} onChange={e => setFilterType(e.target.value)} displayEmpty
            sx={{ flex: 1, minWidth: 0, fontSize: { xs: "0.72rem", md: "0.875rem" } }}>
            <MenuItem value="__all__">Type</MenuItem>
            <MenuItem value="blocking">Blocking</MenuItem>
            <MenuItem value="observation">Observation</MenuItem>
            <MenuItem value="scope-deviation">Scope Dev.</MenuItem>
          </Select>
          {(filterProject !== "__all__" || filterSeverity !== "__all__" || filterType !== "__all__" || searchText) && (
            <Button size="small" variant="text" sx={{ flexShrink: 0, px: 0.5, minWidth: "auto" }}
              onClick={() => { setFilterProject("__all__"); setFilterSeverity("__all__"); setFilterType("__all__"); setSearchText(""); }}>
              Clear
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileDownloadOutlined sx={{ fontSize: 16 }} />}
            endIcon={<ArrowDropDown sx={{ fontSize: 18 }} />}
            onClick={(e) => setExportAnchor(e.currentTarget)}
            disabled={exportRows.length === 0}
            sx={{ flexShrink: 0, ml: "auto" }}
          >
            Export
          </Button>
          <Menu
            anchorEl={exportAnchor}
            open={Boolean(exportAnchor)}
            onClose={() => setExportAnchor(null)}
          >
            <MenuItem onClick={handleExportPdf}>
              <ListItemText primary="Export PDF" secondary={`${exportRows.length} visible issue${exportRows.length === 1 ? "" : "s"}`} />
            </MenuItem>
            <MenuItem onClick={handleExportExcel}>
              <ListItemText primary="Export Excel" secondary={`${exportRows.length} visible issue${exportRows.length === 1 ? "" : "s"}`} />
            </MenuItem>
          </Menu>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {activeTab === "history"
            ? `${filteredHistory.length} of ${closedIssues.length} resolved`
            : `${filtered.length} of ${issues.length} issues`}
        </Typography>
      </Stack>

      {/* ══ HISTORY TAB ══════════════════════════════════════════════════════ */}
      {activeTab === "history" && (
        loadingHistory && closedIssues.length === 0 ? (
          <Stack alignItems="center" py={6}>
            <CircularProgress size={28} />
            <Typography variant="caption" color="text.secondary" mt={1}>Loading history…</Typography>
          </Stack>
        ) : filteredHistory.length === 0 ? (
          <Stack alignItems="center" py={6} spacing={1}>
            <CheckCircleOutlined sx={{ fontSize: 40, color: "success.main" }} />
            <Typography variant="body2" color="text.secondary">
              {closedIssues.length === 0 ? "No resolved issues yet." : "No resolved issues match the current filters."}
            </Typography>
            <Button size="small" startIcon={loadingHistory ? <CircularProgress size={14} /> : <RefreshOutlined />} onClick={loadHistory} disabled={loadingHistory}>
              Refresh
            </Button>
          </Stack>
        ) : isMobile ? (
          /* ── History mobile cards ── */
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="flex-end">
              <Tooltip title="Refresh history">
                <IconButton size="small" onClick={loadHistory} disabled={loadingHistory}>
                  {loadingHistory ? <CircularProgress size={16} /> : <RefreshOutlined fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Stack>
            {filteredHistory.map((iss) => (
              <Paper
                key={`${iss.runId}-${iss.issueId}`}
                className="glass-card"
                sx={{
                  p: 1.5,
                  borderLeft: "3px solid",
                  borderLeftColor: "success.main",
                }}
              >
                {/* Row 1: chips + status + open button */}
                <Stack direction="row" alignItems="center" spacing={0.75} mb={0.75}>
                  <Chip label={typeLabel(iss.issueType)} size="small" color={typeColor(iss.issueType)} variant="outlined" sx={{ fontSize: "0.68rem", height: 20 }} />
                  <Chip label={iss.severity.charAt(0).toUpperCase() + iss.severity.slice(1)} size="small" color={severityColor(iss.severity)} sx={{ fontSize: "0.68rem", height: 20 }} />
                  <Chip label="Closed" size="small" color="success" icon={<CheckCircleOutlined sx={{ fontSize: "12px !important" }} />} sx={{ fontSize: "0.68rem", height: 20 }} />
                  <Box sx={{ flex: 1 }} />
                      <Tooltip title="Open exact asset issue repair">
                        <IconButton size="small" component={Link} to={buildIssueRepairPath(iss)} sx={{ p: 0.5 }}>
                          <OpenInNewOutlined sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                </Stack>

                {/* Row 2: description */}
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, lineHeight: 1.3 }}>
                  {iss.description}
                </Typography>

                <Divider sx={{ my: 0.75 }} />

                {/* Row 3: asset + step */}
                <Stack direction="row" spacing={1} alignItems="flex-start" mb={0.5}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.disabled" display="block">Asset</Typography>
                    <Typography variant="caption" fontWeight={700}>{iss.assetTag}</Typography>
                    {iss.assetLocation && <Typography variant="caption" color="text.disabled" display="block">{iss.assetLocation}</Typography>}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.disabled" display="block">Step</Typography>
                    <Typography variant="caption">{iss.stepTitle || "—"}</Typography>
                  </Box>
                </Stack>

                {/* Row 4: project + reported date */}
                <Stack direction="row" spacing={1} alignItems="flex-start" mb={0.75}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.disabled" display="block">Project</Typography>
                    <Button component={Link} to={`/projects?open=${encodeURIComponent(iss.projectId)}`} size="small"
                      sx={{ p: 0, minWidth: "auto", textAlign: "left", textTransform: "none" }}>
                      <Stack>
                        <Typography variant="caption" fontWeight={700}>{iss.jobNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">{iss.customerName}</Typography>
                      </Stack>
                    </Button>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.disabled" display="block">Reported</Typography>
                    <Typography variant="caption">{fmtDate(iss.reportedAt)}</Typography>
                    {iss.createdBy && <Typography variant="caption" color="text.disabled" display="block">{iss.createdBy}</Typography>}
                  </Box>
                </Stack>

                {/* Resolution info */}
                <Box sx={{ bgcolor: "rgba(76,175,80,0.07)", borderRadius: 1, p: 1, border: "1px solid rgba(76,175,80,0.2)" }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start" mb={iss.resolutionNote ? 0.5 : 0}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="success.main" fontWeight={700} display="block">Closed by</Typography>
                      <Typography variant="caption">{iss.resolvedBy || "—"}</Typography>
                    </Box>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="caption" color="text.disabled" display="block">Closed</Typography>
                      <Typography variant="caption">{fmtDate(iss.resolvedAt)}</Typography>
                    </Box>
                  </Stack>
                  {iss.resolutionNote && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic", display: "block", mt: 0.5 }}>
                      "{iss.resolutionNote}"
                    </Typography>
                  )}
                </Box>
              </Paper>
            ))}
          </Stack>
        ) : (
          /* ── History desktop table ── */
          <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="flex-end">
            <Tooltip title="Refresh history">
              <IconButton size="small" onClick={loadHistory} disabled={loadingHistory}>
                {loadingHistory ? <CircularProgress size={16} /> : <RefreshOutlined fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>
          <Box className="glass-card" sx={{ padding: 2, paddingBottom: 0, overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  {(["type","severity","description","step","asset","project","reported","closedBy","closed","correctiveAction"] as const).map((k) => {
                    const labels: Record<string, string> = { type:"Type", severity:"Sev.", description:"Description", step:"Step", asset:"Asset", project:"Project", reported:"Reported", closedBy:"Closed By", closed:"Closed", correctiveAction:"Corrective Action" };
                    const isSuccess = ["closedBy","closed","correctiveAction"].includes(k);
                    return (
                      <TableCell key={k} sx={{ py: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.25}>
                          <Typography sx={{ fontWeight: 700, fontSize: "0.75rem", color: isSuccess ? "success.main" : undefined }}>{labels[k]}</Typography>
                          <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setAutoMenu({ anchorEl: e.currentTarget, key: k })}>
                            <ArrowDropDown fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    );
                  })}
                  <TableCell sx={{ py: 1, width: 36 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedHistory.map((iss) => (
                  <TableRow key={`${iss.runId}-${iss.issueId}`} hover sx={{ borderLeft: "3px solid", borderLeftColor: "success.main" }}>
                    <TableCell sx={{ py: 0.75 }}>
                      <Chip label={typeLabel(iss.issueType)} size="small" color={typeColor(iss.issueType)} variant="outlined" sx={{ fontSize: "0.65rem", height: 18 }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.75 }}>
                      <Chip label={iss.severity.charAt(0).toUpperCase() + iss.severity.slice(1)} size="small" color={severityColor(iss.severity)} sx={{ fontSize: "0.65rem", height: 18 }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.75, maxWidth: 260 }}>
                      <Typography variant="body2" sx={{ wordBreak: "break-word" }}>{iss.description}</Typography>
                      <Chip label={iss.source === "asset" ? "Manual" : "Workflow"} size="small" variant="outlined" sx={{ fontSize: "0.6rem", height: 16, mt: 0.25, opacity: 0.7 }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.75 }}>
                      <Typography variant="caption" color="text.secondary">{iss.stepTitle || "—"}</Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.75 }}>
                      <Typography variant="body2" fontWeight={600}>{iss.assetTag}</Typography>
                      {iss.assetLocation && <Typography variant="caption" color="text.disabled" display="block">{iss.assetLocation}</Typography>}
                    </TableCell>
                    <TableCell sx={{ py: 0.75 }}>
                      <Button component={Link} to={`/projects?open=${encodeURIComponent(iss.projectId)}`} size="small"
                        sx={{ p: 0, minWidth: "auto", textAlign: "left", textTransform: "none" }}>
                        <Stack>
                          <Typography variant="caption" fontWeight={700}>{iss.jobNumber}</Typography>
                          <Typography variant="caption" color="text.secondary">{iss.customerName}</Typography>
                        </Stack>
                      </Button>
                    </TableCell>
                    <TableCell sx={{ py: 0.75 }}>
                      <Typography variant="caption">{fmtDate(iss.reportedAt)}</Typography>
                      {iss.createdBy && <Typography variant="caption" color="text.disabled" display="block">{iss.createdBy}</Typography>}
                    </TableCell>
                    <TableCell sx={{ py: 0.75 }}>
                      <Typography variant="caption" color="success.main" fontWeight={600}>{iss.resolvedBy || "—"}</Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.75 }}>
                      <Typography variant="caption">{fmtDate(iss.resolvedAt)}</Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.75, maxWidth: 260 }}>
                      <Typography variant="caption" sx={{ fontStyle: "italic" }}>{iss.resolutionNote || "—"}</Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.75, pr: 1 }}>
                      <Tooltip title="Open exact asset issue repair">
                        <IconButton size="small" component={Link} to={buildIssueRepairPath(iss)}>
                          <OpenInNewOutlined sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Box sx={{ height: 12 }} />
          </Box>
          </Stack>
        )
      )}

      {/* ══ OPEN TAB ═════════════════════════════════════════════════════════ */}
      {activeTab === "open" && (
      /* ── Empty / loading state (shared) ── */
      (loading && issues.length === 0) ? (
        <Stack alignItems="center" py={6}>
          <CircularProgress size={28} />
          <Typography variant="caption" color="text.secondary" mt={1}>Loading issues…</Typography>
        </Stack>
      ) : filtered.length === 0 ? (
        <Stack alignItems="center" py={6} spacing={1}>
          {issues.length === 0
            ? <ErrorOutlineOutlined sx={{ fontSize: 40, color: "success.main" }} />
            : <WarningAmberOutlined sx={{ fontSize: 40, color: "text.disabled" }} />}
          <Typography variant="body2" color="text.secondary">
            {issues.length === 0 ? "No open issues — great work!" : "No issues match the current filters."}
          </Typography>
        </Stack>
      ) : isMobile ? (

        /* ── Mobile card list ── */
        <Stack spacing={1.5}>
          {filtered.map((iss) => (
            <Paper
              key={`${iss.runId}-${iss.issueId}`}
              className="glass-card"
              sx={{
                p: 1.5,
                borderLeft: "3px solid",
                borderLeftColor: iss.isBlocking ? "error.main" : "transparent",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                },
              }}
            >
              {/* Row 1: chips + open button */}
              <Stack direction="row" alignItems="center" spacing={0.75} mb={0.75}>
                <Chip
                  label={typeLabel(iss.issueType)}
                  size="small"
                  color={typeColor(iss.issueType)}
                  variant="outlined"
                  sx={{ fontSize: "0.68rem", height: 20 }}
                />
                <Chip
                  label={iss.severity.charAt(0).toUpperCase() + iss.severity.slice(1)}
                  size="small"
                  color={severityColor(iss.severity)}
                  sx={{ fontSize: "0.68rem", height: 20 }}
                />
                {iss.isBlocking && (
                  <ErrorOutlineOutlined sx={{ fontSize: 15, color: "error.main" }} />
                )}
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Open exact asset issue repair">
                  <IconButton
                    size="small"
                    component={Link}
                    to={buildIssueRepairPath(iss)}
                    sx={{ p: 0.5 }}
                  >
                    <OpenInNewOutlined sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              </Stack>

              {/* Row 2: description */}
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, lineHeight: 1.3 }}>
                {iss.description}
              </Typography>

              <Divider sx={{ my: 0.75 }} />

              {/* Row 3: asset + step */}
              <Stack direction="row" spacing={1} alignItems="flex-start" mb={0.5}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.disabled" display="block">Asset</Typography>
                  <Typography variant="caption" fontWeight={700}>{iss.assetTag}</Typography>
                  {iss.assetLocation && (
                    <Typography variant="caption" color="text.disabled" display="block">{iss.assetLocation}</Typography>
                  )}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.disabled" display="block">Step</Typography>
                  <Typography variant="caption">{iss.stepTitle || "—"}</Typography>
                </Box>
              </Stack>

              {/* Row 4: project + reported */}
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.disabled" display="block">Project</Typography>
                  <Button
                    component={Link}
                    to={`/projects?open=${encodeURIComponent(iss.projectId)}`}
                    size="small"
                    sx={{ p: 0, minWidth: "auto", textAlign: "left", textTransform: "none" }}
                  >
                    <Stack>
                      <Typography variant="caption" fontWeight={700}>{iss.jobNumber}</Typography>
                      <Typography variant="caption" color="text.secondary">{iss.customerName}</Typography>
                    </Stack>
                  </Button>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="caption" color="text.disabled" display="block">Reported</Typography>
                  <Typography variant="caption">{fmtDate(iss.reportedAt)}</Typography>
                  {iss.createdBy && (
                    <Typography variant="caption" color="text.disabled" display="block">{iss.createdBy}</Typography>
                  )}
                </Box>
              </Stack>
            </Paper>
          ))}
        </Stack>

      ) : (

        /* ── Desktop table (unchanged) ── */
        <Box className="glass-card" sx={{ padding: 2, paddingBottom: 0, overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 36, py: 1 }}></TableCell>
                <TableCell sx={{ width: 36, py: 1 }}></TableCell>
                {(["asset","project","type","severity","description","step","reported","by"] as const).map((k) => (
                  <TableCell key={k} sx={{ py: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.25}>
                      <Typography sx={{ fontWeight: 700, fontSize: "0.75rem" }}>
                        {k === "type" ? "Type" : k === "severity" ? "Severity" : k === "description" ? "Description" : k === "step" ? "Step" : k === "asset" ? "Asset" : k === "project" ? "Project" : k === "reported" ? "Reported" : "By"}
                      </Typography>
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setAutoMenu({ anchorEl: e.currentTarget, key: k })}>
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                ))}
                <TableCell sx={{ py: 1, width: 36 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedFiltered.map((iss) => {
                const key = `${iss.source}-${iss.assetId}-${iss.issueId}`;
                const isExpanded = expandedKey === key;
                const isClosing  = closingKey === key;
                const noteVal    = resolutionNotes[key] ?? "";
                const mediaVal   = resolutionMedia[key] ?? [];

                return (
                  <Fragment key={key}>
                    <TableRow
                      hover
                      sx={{
                        borderLeft: iss.isBlocking ? "3px solid" : "3px solid transparent",
                        borderLeftColor: iss.isBlocking ? "error.main" : "transparent",
                        cursor: "pointer",
                        bgcolor: isExpanded ? "action.selected" : undefined,
                      }}
                      onClick={() => toggleExpand(key)}
                    >
                      {/* Chevron */}
                      <TableCell sx={{ py: 0.5, pl: 1, pr: 0 }}>
                        <IconButton size="small" sx={{ p: 0.25 }} onClick={e => { e.stopPropagation(); toggleExpand(key); }}>
                          {isExpanded ? <ExpandLessOutlined sx={{ fontSize: 16 }} /> : <ExpandMoreOutlined sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ py: 0.75, pl: 1 }}>
                        {iss.isBlocking ? (
                          <ErrorOutlineOutlined sx={{ fontSize: 16, color: "error.main" }} />
                        ) : iss.severity === "high" ? (
                          <WarningAmberOutlined sx={{ fontSize: 16, color: "warning.main" }} />
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Typography variant="body2" fontWeight={600}>{iss.assetTag}</Typography>
                        {iss.assetLocation && (
                          <Typography variant="caption" color="text.disabled" display="block">{iss.assetLocation}</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Button
                          component={Link}
                          to={`/projects?open=${encodeURIComponent(iss.projectId)}`}
                          size="small"
                          sx={{ p: 0, minWidth: "auto", textAlign: "left", textTransform: "none" }}
                          onClick={e => e.stopPropagation()}
                        >
                          <Stack>
                            <Typography variant="caption" fontWeight={700}>{iss.jobNumber}</Typography>
                            <Typography variant="caption" color="text.secondary">{iss.customerName}</Typography>
                          </Stack>
                        </Button>
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Chip
                          label={typeLabel(iss.issueType)}
                          size="small"
                          color={typeColor(iss.issueType)}
                          variant="outlined"
                          sx={{ fontSize: "0.65rem", height: 18 }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Chip
                          label={iss.severity.charAt(0).toUpperCase() + iss.severity.slice(1)}
                          size="small"
                          color={severityColor(iss.severity)}
                          variant="filled"
                          sx={{ fontSize: "0.65rem", height: 18 }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.75, maxWidth: 300 }}>
                        <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                          {iss.description}
                        </Typography>
                        <Chip
                          label={iss.source === "asset" ? "Manual" : "Workflow"}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: "0.6rem", height: 16, mt: 0.25, opacity: 0.7 }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Typography variant="caption" color="text.secondary">{iss.stepTitle || "—"}</Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Typography variant="caption">{fmtDate(iss.reportedAt)}</Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Typography variant="caption" color="text.secondary">{iss.createdBy || "—"}</Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.75, pr: 1 }}>
                        <Tooltip title="Open exact asset issue repair">
                          <IconButton
                            size="small"
                            component={Link}
                            to={buildIssueRepairPath(iss)}
                            onClick={e => e.stopPropagation()}
                          >
                            <OpenInNewOutlined sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>

                    {/* Expanded close-issue panel */}
                    <TableRow sx={{ bgcolor: "action.hover" }}>
                      <TableCell colSpan={11} sx={{ py: 0, px: 0, border: 0 }}>
                        <Collapse in={isExpanded} unmountOnExit>
                          <Paper
                            variant="outlined"
                            sx={{
                              m: 1.5,
                              p: 2,
                              borderColor: "divider",
                              bgcolor: "background.paper",
                            }}
                          >
                            <Stack spacing={2}>
                              <Typography variant="subtitle2" fontWeight={700}>
                                Close Issue — <span style={{ fontWeight: 400 }}>{iss.description}</span>
                              </Typography>
                              <Divider />
                              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                {/* Resolution note */}
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="caption" fontWeight={700} color="text.secondary"
                                    sx={{ textTransform: "uppercase", letterSpacing: 0.6 }} display="block" mb={0.75}>
                                    Corrective Action (required)
                                  </Typography>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    multiline
                                    rows={3}
                                    placeholder="Describe what was done to resolve this issue…"
                                    value={noteVal}
                                    onChange={e => setResolutionNotes(p => ({ ...p, [key]: e.target.value }))}
                                  />
                                </Box>
                                {/* Resolution media */}
                                <Box sx={{ flex: 1 }}>
                                  <MediaCapture
                                    media={mediaVal}
                                    onChange={m => setResolutionMedia(p => ({ ...p, [key]: m }))}
                                    label="Resolution Evidence — Photo / Video (optional)"
                                    qrDocType="issue-photo"
                                    qrLinkedTo={iss.issueId}
                                  />
                                </Box>
                              </Stack>
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  size="small"
                                  color="inherit"
                                  onClick={() => setExpandedKey(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="success"
                                  startIcon={isClosing ? <CircularProgress size={14} color="inherit" /> : <CheckCircleOutlineOutlined />}
                                  disabled={!noteVal.trim() || isClosing}
                                  onClick={e => { e.stopPropagation(); void handleCloseIssue(iss); }}
                                >
                                  {isClosing ? "Closing…" : "Close Issue"}
                                </Button>
                              </Stack>
                            </Stack>
                          </Paper>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      ))}

      {/* Column sort / filter menu — shared between open and history tables */}
      <Menu anchorEl={autoMenu.anchorEl} open={Boolean(autoMenu.anchorEl)} onClose={() => setAutoMenu({ anchorEl: null, key: "" })}>
        <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "asc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort A → Z</MenuItem>
        <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "desc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort Z → A</MenuItem>
        <MenuItem onClick={() => { setAutoSort({ key: "", dir: "asc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Clear sort</MenuItem>
        {((activeTab === "history" ? historyFilterOptions : issueFilterOptions)[autoMenu.key] ?? []).map((option) => {
          const label = option || "(Blank)";
          const selected = !!autoFilters[autoMenu.key]?.has(option);
          return (
            <MenuItem key={`${autoMenu.key}-${option}`} onClick={() => {
              if (!autoMenu.key) return;
              setAutoFilters((prev) => {
                const cur = new Set(prev[autoMenu.key] ?? []);
                if (cur.has(option)) cur.delete(option); else cur.add(option);
                return { ...prev, [autoMenu.key]: cur };
              });
            }}>
              <Checkbox checked={selected} size="small" />
              <ListItemText primary={label} />
            </MenuItem>
          );
        })}
      </Menu>
    </Stack>
  );
};

export default IssuesBoard;
