import React, { useEffect, useState } from "react";
import {
  CheckCircleOutlined,
  ErrorOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  HourglassEmptyOutlined,
  LockOutlined,
  RadioButtonUncheckedOutlined,
  ReportProblemOutlined,
  TuneOutlined,
  VisibilityOffOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import type { AssetWorkflowRun, RunIssue, StepResult } from "../../types/assetWorkflowRun";
import type { BomActualItem } from "../../types/workflow";
import type { WorkflowAssignment } from "../../types/workflowType";
import type { ProjectAsset } from "../../types/projectAsset";

interface Props {
  open: boolean;
  onClose: () => void;
  asset: ProjectAsset;
  assignment: WorkflowAssignment;
}

const STATUS_COLOR: Record<string, "primary" | "success" | "error" | "default"> = {
  InProgress: "primary",
  Complete: "success",
  Issue: "error",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  InProgress: <HourglassEmptyOutlined sx={{ fontSize: "0.85rem !important" }} />,
  Complete: <CheckCircleOutlined sx={{ fontSize: "0.85rem !important" }} />,
  Issue: <ErrorOutlined sx={{ fontSize: "0.85rem !important" }} />,
};

const SEVERITY_COLOR: Record<string, string> = {
  low: "#2196f3",
  medium: "#ff9800",
  high: "#f44336",
};

export default function AssetWorkflowRunHistoryDialog({ open, onClose, asset, assignment }: Props) {
  const [runs, setRuns] = useState<AssetWorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Issue action state — keyed by issueId
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({});
  const [pendingInternal, setPendingInternal] = useState<Record<string, boolean>>({});
  const [savingIssueId, setSavingIssueId] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);

  // Mutable local copy of issues per run (so changes are reflected instantly)
  const [runIssueMap, setRunIssueMap] = useState<Record<string, RunIssue[]>>({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    assetWorkflowRunService.listByAsset(asset.id)
      .then((all) => {
        const filtered = all
          .filter((r) => r.workflowConfigId === assignment.workflowConfigId)
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        setRuns(filtered);
        // Seed local issue map
        const map: Record<string, RunIssue[]> = {};
        for (const r of filtered) map[r.id] = parseIssues(r.issuesJson);
        setRunIssueMap(map);
      })
      .finally(() => setLoading(false));
  }, [open, asset.id, assignment.workflowConfigId]);

  function parseStepResults(json: string): StepResult[] {
    try { return JSON.parse(json) as StepResult[]; } catch { return []; }
  }

  /** Render a single captured input value — handles photos, signatures, and plain text */
  function renderValue(val: string): React.ReactNode {
    if (!val) return <Typography variant="caption" color="text.disabled">—</Typography>;

    // Signature: single base64 image
    if (val.startsWith("data:image/")) {
      return (
        <Box component="img" src={val}
          sx={{ maxHeight: 48, maxWidth: 120, borderRadius: 0.5, border: "1px solid rgba(255,255,255,0.12)", display: "block" }} />
      );
    }

    // Photo array: JSON array of base64 images
    if (val.startsWith("[")) {
      try {
        const imgs = JSON.parse(val) as string[];
        const photos = imgs.filter((s) => typeof s === "string" && s.startsWith("data:image/"));
        if (photos.length > 0) {
          return (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {photos.slice(0, 6).map((src, i) => (
                <Box key={i} component="img" src={src}
                  sx={{ width: 48, height: 36, objectFit: "cover", borderRadius: 0.5, border: "1px solid rgba(255,255,255,0.12)" }} />
              ))}
              {photos.length > 6 && (
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
                  +{photos.length - 6} more
                </Typography>
              )}
            </Stack>
          );
        }
      } catch { /* fall through */ }
    }

    // Plain text (including booleans)
    const display = val === "true" ? "✓ Yes" : val === "false" ? "✗ No" : val;
    return <Typography variant="caption">{display}</Typography>;
  }

  function parseIssues(json: string): RunIssue[] {
    try { return JSON.parse(json) as RunIssue[]; } catch { return []; }
  }

  function stepCount(run: AssetWorkflowRun): number {
    return parseStepResults(run.stepResultsJson).length;
  }

  function openIssueCount(runId: string): number {
    return (runIssueMap[runId] ?? []).filter((i) => !i.resolved).length;
  }

  function toggleActionPanel(issueId: string, issue: RunIssue) {
    if (activeIssueId === issueId) {
      setActiveIssueId(null);
    } else {
      setActiveIssueId(issueId);
      // Seed pending edits from current values
      setPendingNotes((prev) => ({ ...prev, [issueId]: issue.resolvedNote ?? "" }));
      setPendingInternal((prev) => ({ ...prev, [issueId]: issue.internalOnly ?? false }));
      setIssueError(null);
    }
  }

  async function saveIssueAction(runId: string, issueId: string, patch: Partial<RunIssue>) {
    setSavingIssueId(issueId);
    setIssueError(null);
    try {
      const updated = (runIssueMap[runId] ?? []).map((i) =>
        i.id === issueId ? { ...i, ...patch } : i,
      );
      const result = await assetWorkflowRunService.patchIssues(runId, JSON.stringify(updated));
      // Refresh local map from server response
      setRunIssueMap((prev) => ({ ...prev, [runId]: parseIssues(result.issuesJson) }));
      // Update the run status in the runs list
      setRuns((prev) => prev.map((r) => (r.id === runId ? { ...r, status: result.status, issuesJson: result.issuesJson } : r)));
      setActiveIssueId(null);
    } catch {
      setIssueError("Failed to save — check your connection and try again.");
    } finally {
      setSavingIssueId(null);
    }
  }

  function handleToggleResolved(runId: string, issue: RunIssue) {
    const note = pendingNotes[issue.id] ?? issue.resolvedNote ?? "";
    const internal = pendingInternal[issue.id] ?? issue.internalOnly ?? false;
    saveIssueAction(runId, issue.id, {
      resolved: !issue.resolved,
      resolvedNote: note || undefined,
      internalOnly: internal,
    });
  }

  function handleSaveNote(runId: string, issue: RunIssue) {
    const note = pendingNotes[issue.id] ?? "";
    const internal = pendingInternal[issue.id] ?? issue.internalOnly ?? false;
    saveIssueAction(runId, issue.id, {
      resolvedNote: note || undefined,
      internalOnly: internal,
    });
  }

  function renderIssueCard(runId: string, issue: RunIssue) {
    const isActive = activeIssueId === issue.id;
    const isSaving = savingIssueId === issue.id;
    const dotColor = issue.resolved ? "#4caf50" : (SEVERITY_COLOR[issue.severity] ?? "#999");

    return (
      <Stack key={issue.id}>
        {/* Issue summary row */}
        <Stack
          direction="row"
          alignItems="flex-start"
          spacing={1}
          sx={{
            p: 0.75,
            borderRadius: 1,
            border: "1px solid",
            borderColor: isActive ? "primary.main" : "divider",
            opacity: issue.resolved ? 0.75 : 1,
            bgcolor: issue.isBlocking && !issue.resolved
              ? "rgba(244,67,54,0.04)"
              : isActive
              ? "action.selected"
              : undefined,
            transition: "border-color 0.15s",
          }}
        >
          {/* Severity dot */}
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: dotColor, mt: 0.65, flexShrink: 0 }} />

          {/* Issue body */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Typography
                variant="caption"
                sx={{ textDecoration: issue.resolved ? "line-through" : "none", fontWeight: issue.isBlocking && !issue.resolved ? 600 : 400 }}
              >
                {issue.description}
              </Typography>
              {issue.resolved
                ? <Chip size="small" label="Resolved" color="success" sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.4 } }} />
                : issue.isBlocking
                ? <Chip size="small" label="Blocking" color="error" sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.4 } }} />
                : null
              }
              {issue.internalOnly && (
                <Chip
                  size="small"
                  icon={<VisibilityOffOutlined sx={{ fontSize: "0.65rem !important" }} />}
                  label="Internal"
                  variant="outlined"
                  sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.4 } }}
                />
              )}
            </Stack>
            {issue.stepTitle && (
              <Typography variant="caption" color="text.secondary" display="block">Step: {issue.stepTitle}</Typography>
            )}
            <Typography variant="caption" color="text.disabled" display="block">
              {new Date(issue.reportedAt).toLocaleString()} · {issue.severity}
              {issue.createdBy ? ` · ${issue.createdBy}` : ""}
            </Typography>
            {issue.resolved && issue.resolvedNote && (
              <Typography variant="caption" color="success.main" display="block" sx={{ mt: 0.25 }}>
                ✓ {issue.resolvedNote}
              </Typography>
            )}
          </Box>

          {/* Action toggle button */}
          <Tooltip title={isActive ? "Close actions" : "Manage issue"}>
            <IconButton
              size="small"
              sx={{ p: 0.25, flexShrink: 0, color: isActive ? "primary.main" : "text.secondary" }}
              onClick={() => toggleActionPanel(issue.id, issue)}
            >
              <TuneOutlined sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Inline action panel */}
        <Collapse in={isActive} timeout="auto" unmountOnExit>
          <Box
            sx={{
              ml: 2,
              mt: 0.5,
              mb: 0.5,
              pl: 1.5,
              borderLeft: "2px solid",
              borderColor: "primary.main",
            }}
          >
            <Stack spacing={1.25} sx={{ py: 1 }}>
              <TextField
                size="small"
                fullWidth
                multiline
                rows={2}
                label="Resolution note"
                placeholder="Describe how this was resolved or add context…"
                value={pendingNotes[issue.id] ?? ""}
                onChange={(e) => setPendingNotes((prev) => ({ ...prev, [issue.id]: e.target.value }))}
              />
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={pendingInternal[issue.id] ?? false}
                      onChange={(e) => setPendingInternal((prev) => ({ ...prev, [issue.id]: e.target.checked }))}
                    />
                  }
                  label={
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <VisibilityOffOutlined sx={{ fontSize: 13, color: "text.secondary" }} />
                      <Typography variant="caption" color="text.secondary">
                        Internal only — hidden from customer reports
                      </Typography>
                    </Stack>
                  }
                />
                <Box sx={{ flex: 1 }} />
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  disabled={isSaving}
                  onClick={() => setActiveIssueId(null)}
                  sx={{ fontSize: 11 }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={isSaving}
                  onClick={() => handleSaveNote(runId, issue)}
                  sx={{ fontSize: 11 }}
                >
                  {isSaving ? <CircularProgress size={12} /> : "Save note"}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color={issue.resolved ? "warning" : "success"}
                  disabled={isSaving}
                  startIcon={
                    isSaving
                      ? <CircularProgress size={12} />
                      : issue.resolved
                      ? <RadioButtonUncheckedOutlined fontSize="small" />
                      : <CheckCircleOutlined fontSize="small" />
                  }
                  onClick={() => handleToggleResolved(runId, issue)}
                >
                  {issue.resolved ? "Reopen issue" : "Issue resolved"}
                </Button>
              </Stack>
              {issueError && <Alert severity="error" sx={{ fontSize: 11 }}>{issueError}</Alert>}
            </Stack>
          </Box>
        </Collapse>
      </Stack>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Run History — {asset.assetTag}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {assignment.workflowTypeName} · {assignment.workflowConfigName}
            </Typography>
          </Box>
          {runs.length > 0 && (
            <Chip
              size="small"
              label={`${runs.length} run${runs.length !== 1 ? "s" : ""}`}
              variant="outlined"
              sx={{ ml: "auto !important" }}
            />
          )}
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ px: 0, pb: 2 }}>
        {loading ? (
          <Stack alignItems="center" sx={{ p: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : runs.length === 0 ? (
          <Box sx={{ px: 3, py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No runs found for this workflow assignment.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={0}>
            {runs.map((run, idx) => {
              const isExpanded = expandedRunId === run.id;
              const stepResults = parseStepResults(run.stepResultsJson);
              const issues = runIssueMap[run.id] ?? [];
              const openIssues = openIssueCount(run.id);

              return (
                <Box key={run.id}>
                  {idx > 0 && <Divider />}
                  {/* Run summary row */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{
                      px: 3,
                      py: 1.25,
                      cursor: "pointer",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                  >
                    <IconButton size="small" sx={{ flexShrink: 0 }}>
                      {isExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
                    </IconButton>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                        <Typography variant="body2" fontWeight={600}>
                          {new Date(run.startedAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(run.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </Typography>
                        {run.completedAt && (
                          <Typography variant="caption" color="text.secondary">
                            · completed {new Date(run.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </Typography>
                        )}
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={0.75} mt={0.25}>
                        <Typography variant="caption" color="text.secondary">
                          v{run.workflowVersion} · {stepCount(run)} step{stepCount(run) !== 1 ? "s" : ""} captured
                        </Typography>
                        {openIssues > 0 && (
                          <Chip
                            size="small"
                            icon={<ReportProblemOutlined sx={{ fontSize: "0.75rem !important" }} />}
                            label={`${openIssues} issue${openIssues !== 1 ? "s" : ""}`}
                            color="error"
                            variant="outlined"
                            sx={{ height: 16, fontSize: 10, "& .MuiChip-label": { px: 0.5 } }}
                          />
                        )}
                      </Stack>
                    </Box>

                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0 }}>
                      <Chip
                        size="small"
                        label={run.status}
                        color={STATUS_COLOR[run.status] ?? "default"}
                        icon={STATUS_ICON[run.status] as React.ReactElement ?? undefined}
                      />
                      {run.isLocked && (
                        <Tooltip title="Run is locked (completed)">
                          <LockOutlined sx={{ fontSize: "0.9rem", color: "text.secondary" }} />
                        </Tooltip>
                      )}
                    </Stack>
                  </Stack>

                  {/* Expanded step results + issues */}
                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <Box sx={{ px: 4, pb: 2, bgcolor: "rgba(255,255,255,0.02)" }}>
                      {/* Step results */}
                      {stepResults.length > 0 ? (
                        <>
                          <Typography variant="caption" fontWeight={700} color="text.secondary"
                            sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1, mt: 1 }}>
                            Step Results
                          </Typography>
                          <Table size="small" sx={{ mb: 1.5 }}>
                            <TableHead>
                              <TableRow sx={{ bgcolor: "rgba(255,255,255,0.04)" }}>
                                <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Step</TableCell>
                                <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Captured Values</TableCell>
                                <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Completed</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {stepResults.map((sr) => {
                                const entries = Object.entries(sr.values ?? {}).filter(([, v]) => v);
                                return (
                                  <TableRow key={sr.stepId} sx={{ verticalAlign: "top" }}>
                                    <TableCell sx={{ fontSize: 12, py: 0.75, color: "text.secondary", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                                      {sr.stepId.slice(0, 8)}…
                                    </TableCell>
                                    <TableCell sx={{ py: 0.75 }}>
                                      {entries.length > 0 ? (
                                        <Stack spacing={0.75}>
                                          {entries.map(([k, v]) => (
                                            <Stack key={k} direction="row" spacing={1} alignItems="flex-start">
                                              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, flexShrink: 0, pt: 0.2 }}>
                                                {k}
                                              </Typography>
                                              {renderValue(v)}
                                            </Stack>
                                          ))}
                                        </Stack>
                                      ) : (
                                        <Typography variant="caption" color="text.disabled">—</Typography>
                                      )}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: 11, py: 0.75, color: "text.secondary", whiteSpace: "nowrap" }}>
                                      {sr.completedAt
                                        ? new Date(sr.completedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                                        : "—"
                                      }
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </>
                      ) : (
                        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1, mb: 1 }}>
                          No step data captured.
                        </Typography>
                      )}

                      {/* BOM — Parts installed */}
                      {(() => {
                        let bomItems: BomActualItem[] = [];
                        try { bomItems = JSON.parse(run.bomActualJson ?? "[]") as BomActualItem[]; } catch { /* ignore */ }
                        const inventoryItems = bomItems.filter((b) => b.isInventory && (b.unitCaptures ?? []).some((uc) => Object.values(uc).some(Boolean)));
                        if (inventoryItems.length === 0) return null;
                        return (
                          <>
                            <Typography variant="caption" fontWeight={700} color="text.secondary"
                              sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.75, mt: 0.5 }}>
                              Parts Installed — Inventory Capture
                            </Typography>
                            <Table size="small" sx={{ mb: 1.5 }}>
                              <TableHead>
                                <TableRow sx={{ bgcolor: "rgba(255,255,255,0.04)" }}>
                                  <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Item</TableCell>
                                  <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Unit</TableCell>
                                  <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Captured Data</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {inventoryItems.flatMap((item) =>
                                  (item.unitCaptures ?? []).map((fields, i) => (
                                    <TableRow key={`${item.bomItemId}-${i}`}>
                                      {i === 0 && (
                                        <TableCell rowSpan={(item.unitCaptures ?? []).length}
                                          sx={{ fontSize: 12, py: 0.5, verticalAlign: "top" }}>
                                          {item.description}
                                        </TableCell>
                                      )}
                                      <TableCell sx={{ fontSize: 11, py: 0.5, color: "text.secondary" }}>
                                        Unit {i + 1}
                                      </TableCell>
                                      <TableCell sx={{ fontSize: 12, py: 0.5 }}>
                                        {Object.entries(fields).filter(([, v]) => v)
                                          .map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </>
                        );
                      })()}

                      {/* Issues */}
                      {issues.length > 0 && (
                        <>
                          <Typography variant="caption" fontWeight={700} color="text.secondary"
                            sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.75 }}>
                            Issues ({issues.filter((i) => !i.resolved).length} open · {issues.filter((i) => i.resolved).length} resolved)
                          </Typography>
                          <Stack spacing={0.5}>
                            {issues.map((issue) => renderIssueCard(run.id, issue))}
                          </Stack>
                        </>
                      )}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
