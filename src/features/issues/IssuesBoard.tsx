import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  MenuItem,
  Paper,
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
  CheckCircleOutlineOutlined,
  ErrorOutlineOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  FilterListOutlined,
  OpenInNewOutlined,
  RefreshOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { Link } from "react-router-dom";
import { assetWorkflowRunService, type OpenIssueRecord } from "../../services/assetWorkflowRunService";
import { projectAssetService } from "../../services/projectAssetService";
import type { RunIssue } from "../../types/assetWorkflowRun";
import type { AssetIssue } from "../../types/projectAsset";
import MediaCapture from "../../components/ui/MediaCapture";

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
            ? { ...ai, resolved: true, resolutionNote: note, resolutionMedia: media, resolvedAt: now }
            : ai
        );
        const anyOpen = assetIssues.some(ai => !ai.resolved);
        await projectAssetService.update(iss.assetId, {
          issuesJson: JSON.stringify(assetIssues),
          // Reset status to Complete if no open issues remain
          ...(anyOpen ? {} : { status: "Complete" as const }),
        });
      } else {
        // Issue lives on a workflow run
        const run = await assetWorkflowRunService.getById(iss.runId);
        if (!run) throw new Error("Run not found");
        let runIssues: RunIssue[] = [];
        try { runIssues = JSON.parse(run.issuesJson ?? "[]"); } catch { /* empty */ }
        runIssues = runIssues.map(ri =>
          ri.id === iss.issueId
            ? { ...ri, resolved: true, resolutionNote: note, resolutionMedia: media, resolvedAt: now }
            : ri
        );
        await assetWorkflowRunService.patchIssues(iss.runId, JSON.stringify(runIssues));
      }
      // Optimistic remove from list
      setIssues(prev => prev.filter(i => !(i.assetId === iss.assetId && i.issueId === iss.issueId)));
      setExpandedKey(null);
    } catch (e) {
      console.error("Failed to close issue", e);
    } finally {
      setClosingKey(null);
    }
  }

  function toggleExpand(key: string) {
    setExpandedKey(prev => prev === key ? null : key);
  }

  return (
    <Stack spacing={3}>
      {/* ── Header ── */}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" spacing={1}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>Issues Board</Typography>
          <Typography variant="body2" color="text.secondary">
            All open unresolved issues across every project and workflow run.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={load} disabled={loading}>
            {loading ? <CircularProgress size={18} /> : <RefreshOutlined />}
          </IconButton>
        </Tooltip>
      </Stack>

      {/* ── KPI strip ── */}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <Box className="glass-card" sx={{ px: 2.5, py: 1.5, minWidth: 130, textAlign: "center" }}>
          <Typography variant="h4" fontWeight={700} color="error.main">{blockingCount}</Typography>
          <Typography variant="caption" color="text.secondary">Blocking Issues</Typography>
        </Box>
        <Box className="glass-card" sx={{ px: 2.5, py: 1.5, minWidth: 130, textAlign: "center" }}>
          <Typography variant="h4" fontWeight={700} color="warning.main">{mediumCount}</Typography>
          <Typography variant="caption" color="text.secondary">Medium Severity</Typography>
        </Box>
        <Box className="glass-card" sx={{ px: 2.5, py: 1.5, minWidth: 130, textAlign: "center" }}>
          <Typography variant="h4" fontWeight={700}>{issues.length}</Typography>
          <Typography variant="caption" color="text.secondary">Total Open</Typography>
        </Box>
        <Box className="glass-card" sx={{ px: 2.5, py: 1.5, minWidth: 130, textAlign: "center" }}>
          <Typography variant="h4" fontWeight={700}>{projectsAffected}</Typography>
          <Typography variant="caption" color="text.secondary">Projects Affected</Typography>
        </Box>
      </Stack>

      {/* ── Filters ── */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
        <FilterListOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
        <TextField
          size="small"
          placeholder="Search description, asset, project…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        <Select
          size="small"
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
          sx={{ minWidth: 200 }}
          displayEmpty
        >
          <MenuItem value="__all__">All Projects</MenuItem>
          {projectOptions.map(([id, label]) => (
            <MenuItem key={id} value={id}>{label}</MenuItem>
          ))}
        </Select>
        <Select
          size="small"
          value={filterSeverity}
          onChange={e => setFilterSeverity(e.target.value)}
          sx={{ minWidth: 130 }}
          displayEmpty
        >
          <MenuItem value="__all__">All Severities</MenuItem>
          <MenuItem value="high">High</MenuItem>
          <MenuItem value="medium">Medium</MenuItem>
          <MenuItem value="low">Low</MenuItem>
        </Select>
        <Select
          size="small"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          sx={{ minWidth: 160 }}
          displayEmpty
        >
          <MenuItem value="__all__">All Types</MenuItem>
          <MenuItem value="blocking">Blocking</MenuItem>
          <MenuItem value="observation">Observation</MenuItem>
          <MenuItem value="scope-deviation">Scope Deviation</MenuItem>
        </Select>
        {(filterProject !== "__all__" || filterSeverity !== "__all__" || filterType !== "__all__" || searchText) && (
          <Button
            size="small"
            variant="text"
            onClick={() => { setFilterProject("__all__"); setFilterSeverity("__all__"); setFilterType("__all__"); setSearchText(""); }}
          >
            Clear
          </Button>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
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
              {filtered.map((iss) => {
                const key = `${iss.source}-${iss.assetId}-${iss.issueId}`;
                const isExpanded = expandedKey === key;
                const isClosing  = closingKey === key;
                const noteVal    = resolutionNotes[key] ?? "";
                const mediaVal   = resolutionMedia[key] ?? [];

                return (
                  <React.Fragment key={key}>
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
                                    qrLinkedTo={iss.id}
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
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Box>
    </Stack>
  );
};

export default IssuesBoard;
