import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ErrorOutlineOutlined,
  FilterListOutlined,
  OpenInNewOutlined,
  RefreshOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { Link } from "react-router-dom";
import { assetWorkflowRunService, type OpenIssueRecord } from "../../services/assetWorkflowRunService";

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

// ─── component ────────────────────────────────────────────────────────────────

const IssuesBoard = () => {
  const [issues,   setIssues]   = useState<OpenIssueRecord[]>([]);
  const [loading,  setLoading]  = useState(false);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterProject,  setFilterProject]  = useState("__all__");
  const [filterSeverity, setFilterSeverity] = useState("__all__");
  const [filterType,     setFilterType]     = useState("__all__");
  const [searchText,     setSearchText]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setIssues(await assetWorkflowRunService.listOpenIssues()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const blockingCount  = issues.filter(i => i.isBlocking).length;
  const highCount      = issues.filter(i => i.severity === "high").length;
  const projectsAffected = new Set(issues.map(i => i.projectId)).size;

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

      {/* ── KPI strip — 4 columns always ── */}
      <Grid container spacing={1}>
        {[
          { label: "Blocking",  value: blockingCount,    color: "error.main"   },
          { label: "High",      value: highCount,        color: "warning.main" },
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

      {/* ── Filters ── */}
      <Stack spacing={1}>
        {/* Search — full width */}
        <TextField
          size="small"
          placeholder="Search description, asset, project…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          fullWidth
        />
        {/* Project + Severity + Type — one row */}
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
            {projectOptions.map(([id, label]) => (
              <MenuItem key={id} value={id} sx={{ fontSize: "0.8rem" }}>{label}</MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            displayEmpty
            sx={{ flex: 1, minWidth: 0, fontSize: { xs: "0.72rem", md: "0.875rem" } }}
          >
            <MenuItem value="__all__">Severity</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="low">Low</MenuItem>
          </Select>
          <Select
            size="small"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            displayEmpty
            sx={{ flex: 1, minWidth: 0, fontSize: { xs: "0.72rem", md: "0.875rem" } }}
          >
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
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {filtered.length} of {issues.length} issues
        </Typography>
      </Stack>

      {/* ── Table ── */}
      <Box className="glass-card" sx={{ padding: 2, paddingBottom: 0, overflowX: "auto" }}>
        {loading && issues.length === 0 ? (
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
        ) : (
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 36, py: 1 }}></TableCell>
                <TableCell sx={{ py: 1, fontWeight: 700, fontSize: "0.75rem" }}>Type</TableCell>
                <TableCell sx={{ py: 1, fontWeight: 700, fontSize: "0.75rem" }}>Severity</TableCell>
                <TableCell sx={{ py: 1, fontWeight: 700, fontSize: "0.75rem" }}>Description</TableCell>
                <TableCell sx={{ py: 1, fontWeight: 700, fontSize: "0.75rem" }}>Step</TableCell>
                <TableCell sx={{ py: 1, fontWeight: 700, fontSize: "0.75rem" }}>Asset</TableCell>
                <TableCell sx={{ py: 1, fontWeight: 700, fontSize: "0.75rem" }}>Project</TableCell>
                <TableCell sx={{ py: 1, fontWeight: 700, fontSize: "0.75rem" }}>Reported</TableCell>
                <TableCell sx={{ py: 1, fontWeight: 700, fontSize: "0.75rem" }}>By</TableCell>
                <TableCell sx={{ py: 1, width: 36 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((iss) => (
                <TableRow
                  key={`${iss.runId}-${iss.issueId}`}
                  hover
                  sx={{
                    borderLeft: iss.isBlocking ? "3px solid" : "3px solid transparent",
                    borderLeftColor: iss.isBlocking ? "error.main" : "transparent",
                  }}
                >
                  <TableCell sx={{ py: 0.75, pl: 1 }}>
                    {iss.isBlocking ? (
                      <ErrorOutlineOutlined sx={{ fontSize: 16, color: "error.main" }} />
                    ) : iss.severity === "high" ? (
                      <WarningAmberOutlined sx={{ fontSize: 16, color: "warning.main" }} />
                    ) : null}
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
                  </TableCell>
                  <TableCell sx={{ py: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">{iss.stepTitle || "—"}</Typography>
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
                    >
                      <Stack>
                        <Typography variant="caption" fontWeight={700}>{iss.jobNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">{iss.customerName}</Typography>
                      </Stack>
                    </Button>
                  </TableCell>
                  <TableCell sx={{ py: 0.75 }}>
                    <Typography variant="caption">{fmtDate(iss.reportedAt)}</Typography>
                  </TableCell>
                  <TableCell sx={{ py: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">{iss.createdBy || "—"}</Typography>
                  </TableCell>
                  <TableCell sx={{ py: 0.75, pr: 1 }}>
                    <Tooltip title="Go to asset installations">
                      <IconButton
                        size="small"
                        component={Link}
                        to={`/installations/assets?project=${encodeURIComponent(iss.projectId)}`}
                      >
                        <OpenInNewOutlined sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>
    </Stack>
  );
};

export default IssuesBoard;
