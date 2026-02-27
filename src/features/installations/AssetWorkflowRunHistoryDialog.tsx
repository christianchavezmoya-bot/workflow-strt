import React, { useEffect, useState } from "react";
import {
  CheckCircleOutlined,
  ErrorOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  HourglassEmptyOutlined,
  LockOutlined,
  ReportProblemOutlined,
} from "@mui/icons-material";
import {
  Box,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import type { AssetWorkflowRun, RunIssue, StepResult } from "../../types/assetWorkflowRun";
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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    assetWorkflowRunService.listByAsset(asset.id)
      .then((all) => {
        const filtered = all
          .filter((r) => r.workflowConfigId === assignment.workflowConfigId)
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        setRuns(filtered);
      })
      .finally(() => setLoading(false));
  }, [open, asset.id, assignment.workflowConfigId]);

  function parseStepResults(json: string): StepResult[] {
    try { return JSON.parse(json) as StepResult[]; } catch { return []; }
  }

  function parseIssues(json: string): RunIssue[] {
    try { return JSON.parse(json) as RunIssue[]; } catch { return []; }
  }

  function stepCount(run: AssetWorkflowRun): number {
    return parseStepResults(run.stepResultsJson).length;
  }

  function openIssueCount(run: AssetWorkflowRun): number {
    return parseIssues(run.issuesJson).filter((i) => !i.resolved).length;
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
              const issues = parseIssues(run.issuesJson);
              const openIssues = openIssueCount(run);

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
                                  <TableRow key={sr.stepId}>
                                    <TableCell sx={{ fontSize: 12, py: 0.5, color: "text.secondary", fontFamily: "monospace" }}>
                                      {sr.stepId.slice(0, 8)}…
                                    </TableCell>
                                    <TableCell sx={{ fontSize: 12, py: 0.5 }}>
                                      {entries.length > 0
                                        ? entries.map(([k, v]) => `${k}: ${v}`).join(", ")
                                        : <Typography variant="caption" color="text.disabled">—</Typography>
                                      }
                                    </TableCell>
                                    <TableCell sx={{ fontSize: 11, py: 0.5, color: "text.secondary" }}>
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

                      {/* Issues */}
                      {issues.length > 0 && (
                        <>
                          <Typography variant="caption" fontWeight={700} color="text.secondary"
                            sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.75 }}>
                            Issues ({issues.filter((i) => !i.resolved).length} open)
                          </Typography>
                          <Stack spacing={0.5}>
                            {issues.map((issue) => (
                              <Stack key={issue.id} direction="row" alignItems="flex-start" spacing={1}
                                sx={{
                                  p: 0.75,
                                  borderRadius: 1,
                                  border: "1px solid",
                                  borderColor: "divider",
                                  opacity: issue.resolved ? 0.5 : 1,
                                  bgcolor: issue.isBlocking && !issue.resolved ? "rgba(244,67,54,0.04)" : undefined,
                                }}>
                                <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: SEVERITY_COLOR[issue.severity] ?? "#999", mt: 0.6, flexShrink: 0 }} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Stack direction="row" alignItems="center" spacing={0.5}>
                                    <Typography variant="caption" sx={{ textDecoration: issue.resolved ? "line-through" : "none" }}>
                                      {issue.description}
                                    </Typography>
                                    {issue.isBlocking && (
                                      <Chip size="small" label="Blocking" color="error" sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.4 } }} />
                                    )}
                                  </Stack>
                                  {issue.stepTitle && (
                                    <Typography variant="caption" color="text.secondary" display="block">Step: {issue.stepTitle}</Typography>
                                  )}
                                  <Typography variant="caption" color="text.disabled" display="block">
                                    {new Date(issue.reportedAt).toLocaleString()} · {issue.severity}
                                    {issue.resolved ? " · resolved" : ""}
                                  </Typography>
                                </Box>
                              </Stack>
                            ))}
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
