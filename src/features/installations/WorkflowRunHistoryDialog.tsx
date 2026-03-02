import React, { useEffect, useState } from "react";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  ErrorOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  HourglassEmptyOutlined,
  LockOutlined,
  ReplayOutlined,
  ReportProblemOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
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
import { brandSettingsService } from "../../services/brandSettingsService";
import { generateWorkflowReport, resolveImageToDataUrl } from "../../utils/generateWorkflowReport";
import type { AssetWorkflowRun, RunIssue, StepResult } from "../../types/assetWorkflowRun";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowStep, StepInput } from "../../types/workflow";
import type { ProjectAsset } from "../../types/projectAsset";

interface Props {
  open: boolean;
  onClose: () => void;
  asset: ProjectAsset;
  workflowConfigId: string;
  workflowConfigName: string;
  currentUserName: string;
  onRerun: (
    prefillValues: Record<string, Record<string, string>>,
    latestRun: AssetWorkflowRun
  ) => void;
  /** Customer / project context forwarded from the parent page for the PDF report. */
  project?: { customerName: string; jobNumber: string; siteName?: string };
  customerLogoBase64?: string | null;
  assignedTechnician?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function parseSnapshot(snapshotJson: string): WorkflowConfig | null {
  try { return JSON.parse(snapshotJson) as WorkflowConfig; } catch { return null; }
}

function parseStepsFromSnapshot(snapshotJson: string): WorkflowStep[] {
  const snapshot = parseSnapshot(snapshotJson);
  if (!snapshot?.stepsJson) return [];
  try {
    const parsed = JSON.parse(snapshot.stepsJson);
    if (Array.isArray(parsed)) return parsed as WorkflowStep[];
    if (parsed?.steps && Array.isArray(parsed.steps)) return parsed.steps as WorkflowStep[];
    return [];
  } catch { return []; }
}

function buildStepMap(snapshotJson: string): Record<string, WorkflowStep> {
  const steps = parseStepsFromSnapshot(snapshotJson);
  const map: Record<string, WorkflowStep> = {};
  for (const step of steps) map[step.id] = step;
  return map;
}

function parseStepResults(json: string): StepResult[] {
  try {
    const results = JSON.parse(json) as StepResult[];
    return results.filter((r) => r.stepId !== "__nav__");
  } catch { return []; }
}

function parseIssues(json: string): RunIssue[] {
  try { return JSON.parse(json) as RunIssue[]; } catch { return []; }
}

function buildPrefillValues(run: AssetWorkflowRun): Record<string, Record<string, string>> {
  const results = parseStepResults(run.stepResultsJson);
  const prefill: Record<string, Record<string, string>> = {};
  for (const sr of results) {
    const vals = sr.values ?? {};
    if (Object.keys(vals).length > 0) prefill[sr.stepId] = { ...vals };
  }
  return prefill;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkflowRunHistoryDialog({
  open,
  onClose,
  asset,
  workflowConfigId,
  workflowConfigName,
  onRerun,
  project,
  customerLogoBase64,
  assignedTechnician,
}: Props) {
  const [runs, setRuns] = useState<AssetWorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [rerunConfirmOpen, setRerunConfirmOpen] = useState(false);
  const [reportGenerating, setReportGenerating] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setExpandedRunId(null);
    assetWorkflowRunService
      .listByAsset(asset.id)
      .then((all) => {
        const filtered = all
          .filter((r) => r.workflowConfigId === workflowConfigId)
          .sort(
            (a, b) =>
              (b.runNumber ?? 0) - (a.runNumber ?? 0) ||
              new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
          );
        setRuns(filtered);
        if (filtered.length > 0) setExpandedRunId(filtered[0].id);
      })
      .finally(() => setLoading(false));
  }, [open, asset.id, workflowConfigId]);

  const latestLockedRun = runs.find((r) => r.isLocked) ?? null;

  async function handleDownloadReport(run: AssetWorkflowRun) {
    setReportGenerating(run.id);
    try {
      const [brandSettings, resolvedCustLogo] = await Promise.all([
        brandSettingsService.get(),
        customerLogoBase64 ? resolveImageToDataUrl(customerLogoBase64) : Promise.resolve(null),
      ]);
      const bizLogoResolved = brandSettings.logoBase64
        ? await resolveImageToDataUrl(brandSettings.logoBase64)
        : null;
      await generateWorkflowReport({
        run,
        asset,
        workflowConfigName,
        businessLogoBase64: bizLogoResolved,
        customerLogoBase64: resolvedCustLogo,
        customerName: project?.customerName,
        jobNumber: project?.jobNumber,
        siteName: project?.siteName,
        siteLocation: asset.location ?? undefined,
        assignedTechnician,
      });
    } catch (err) {
      console.error("[WorkflowRunHistoryDialog] Report generation failed", err);
      alert("Failed to generate PDF report.");
    } finally {
      setReportGenerating(null);
    }
  }

  function handleRerunConfirm() {
    if (!latestLockedRun) return;
    const prefill = buildPrefillValues(latestLockedRun);
    setRerunConfirmOpen(false);
    onRerun(prefill, latestLockedRun);
  }

  return (
    <>
      {/* ── Main dialog ── */}
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="flex-start" spacing={1.5}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Run History — {asset.assetTag}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {workflowConfigName}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, pt: 0.25 }}>
              {runs.length > 0 && (
                <Chip
                  size="small"
                  label={`${runs.length} run${runs.length !== 1 ? "s" : ""}`}
                  variant="outlined"
                />
              )}
              <Tooltip
                title={
                  latestLockedRun
                    ? "Create a new run pre-filled with the latest completed run's values"
                    : "No completed runs to re-run from"
                }
              >
                <span>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<ReplayOutlined />}
                    disabled={!latestLockedRun}
                    onClick={() => setRerunConfirmOpen(true)}
                  >
                    Re-run
                  </Button>
                </span>
              </Tooltip>
            </Stack>
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
                No runs found for this workflow.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={0}>
              {runs.map((run, idx) => {
                const isExpanded = expandedRunId === run.id;
                const stepResults = parseStepResults(run.stepResultsJson);
                const issues = parseIssues(run.issuesJson);
                const openIssues = issues.filter((i) => !i.resolved).length;
                const stepMap = run.workflowSnapshotJson
                  ? buildStepMap(run.workflowSnapshotJson)
                  : {};

                return (
                  <Box key={run.id}>
                    {idx > 0 && <Divider />}

                    {/* ── Run summary row ── */}
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
                        {isExpanded ? (
                          <ExpandLessOutlined fontSize="small" />
                        ) : (
                          <ExpandMoreOutlined fontSize="small" />
                        )}
                      </IconButton>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                          <Typography variant="body2" fontWeight={700}>
                            Run #{run.runNumber ?? idx + 1}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            v{run.workflowVersion}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(run.startedAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            {new Date(run.startedAt).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Typography>
                          {run.completedByName && (
                            <Typography variant="caption" color="text.secondary">
                              · Completed by {run.completedByName}
                            </Typography>
                          )}
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.75} mt={0.25}>
                          <Typography variant="caption" color="text.secondary">
                            {stepResults.length} step
                            {stepResults.length !== 1 ? "s" : ""} captured
                          </Typography>
                          {openIssues > 0 && (
                            <Chip
                              size="small"
                              icon={
                                <ReportProblemOutlined
                                  sx={{ fontSize: "0.75rem !important" }}
                                />
                              }
                              label={`${openIssues} issue${openIssues !== 1 ? "s" : ""}`}
                              color="error"
                              variant="outlined"
                              sx={{
                                height: 16,
                                fontSize: 10,
                                "& .MuiChip-label": { px: 0.5 },
                              }}
                            />
                          )}
                        </Stack>
                      </Box>

                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={0.75}
                        sx={{ flexShrink: 0 }}
                      >
                        {run.isLocked && (
                          <Tooltip title="Download PDF report">
                            <IconButton
                              size="small"
                              disabled={reportGenerating === run.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDownloadReport(run);
                              }}
                            >
                              {reportGenerating === run.id
                                ? <CircularProgress size={14} />
                                : <DownloadOutlined fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        )}
                        <Chip
                          size="small"
                          label={run.status}
                          color={STATUS_COLOR[run.status] ?? "default"}
                          icon={
                            (STATUS_ICON[run.status] as React.ReactElement) ?? undefined
                          }
                        />
                        {run.isLocked && (
                          <Tooltip title="Run is locked (completed)">
                            <LockOutlined
                              sx={{ fontSize: "0.9rem", color: "text.secondary" }}
                            />
                          </Tooltip>
                        )}
                      </Stack>
                    </Stack>

                    {/* ── Expanded details ── */}
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ px: 4, pb: 2, bgcolor: "rgba(255,255,255,0.02)" }}>
                        {/* Download report CTA inside expanded section */}
                        {run.isLocked && (
                          <Stack direction="row" sx={{ mt: 1.25, mb: 1.5 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={reportGenerating === run.id ? <CircularProgress size={13} /> : <DownloadOutlined />}
                              disabled={reportGenerating === run.id}
                              onClick={() => void handleDownloadReport(run)}
                            >
                              {reportGenerating === run.id ? "Generating…" : "Download PDF Report"}
                            </Button>
                          </Stack>
                        )}

                        {/* Step results */}
                        {stepResults.length > 0 ? (
                          <>
                            <Typography
                              variant="caption"
                              fontWeight={700}
                              color="text.secondary"
                              sx={{
                                textTransform: "uppercase",
                                letterSpacing: 0.5,
                                display: "block",
                                mb: 1,
                                mt: run.isLocked ? 0 : 1,
                              }}
                            >
                              Step Results
                            </Typography>
                            <Table size="small" sx={{ mb: 1.5 }}>
                              <TableHead>
                                <TableRow sx={{ bgcolor: "rgba(255,255,255,0.04)" }}>
                                  <TableCell
                                    sx={{ fontSize: 11, py: 0.5, fontWeight: 700, width: "35%" }}
                                  >
                                    Step
                                  </TableCell>
                                  <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>
                                    Captured Values
                                  </TableCell>
                                  <TableCell
                                    sx={{
                                      fontSize: 11,
                                      py: 0.5,
                                      fontWeight: 700,
                                      width: 80,
                                    }}
                                  >
                                    Time
                                  </TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {stepResults.map((sr) => {
                                  const step: WorkflowStep | undefined = stepMap[sr.stepId];
                                  const stepTitle =
                                    step?.title ?? sr.stepId.slice(0, 8) + "…";
                                  const inputDefs: StepInput[] = step?.inputs ?? [];
                                  const entries = Object.entries(sr.values ?? {}).filter(
                                    ([, v]) => v
                                  );
                                  return (
                                    <TableRow key={sr.stepId}>
                                      <TableCell
                                        sx={{ fontSize: 12, py: 0.75, fontWeight: 500 }}
                                      >
                                        {stepTitle}
                                      </TableCell>
                                      <TableCell sx={{ fontSize: 12, py: 0.75 }}>
                                        {entries.length > 0 ? (
                                          <Stack spacing={0.25}>
                                            {entries.map(([inputId, val]) => {
                                              const inputDef = inputDefs.find(
                                                (inp) => inp.id === inputId
                                              );
                                              const label = inputDef?.label ?? inputId;

                                              // Component inputs: decode JSON sub-fields
                                              if (inputDef?.type === "component" && inputDef.subFields?.length && val) {
                                                try {
                                                  const sub: Record<string, string> = JSON.parse(val);
                                                  const parts = inputDef.subFields
                                                    .filter((sf) => sub[sf.id])
                                                    .map((sf) => ({ name: sf.name, value: sub[sf.id] }));
                                                  if (parts.length > 0) {
                                                    return (
                                                      <Box key={inputId}>
                                                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                                          {label}:
                                                        </Typography>
                                                        <Stack spacing={0} sx={{ pl: 1.5 }}>
                                                          {parts.map((p) => (
                                                            <Box key={p.name}>
                                                              <Typography component="span" variant="caption" color="text.secondary">↳ {p.name}: </Typography>
                                                              <Typography component="span" variant="caption">{p.value}</Typography>
                                                            </Box>
                                                          ))}
                                                        </Stack>
                                                      </Box>
                                                    );
                                                  }
                                                } catch { /* fall through */ }
                                              }

                                              return (
                                                <Box key={inputId}>
                                                  <Typography
                                                    component="span"
                                                    variant="caption"
                                                    color="text.secondary"
                                                  >
                                                    {label}:{" "}
                                                  </Typography>
                                                  <Typography
                                                    component="span"
                                                    variant="caption"
                                                  >
                                                    {val}
                                                  </Typography>
                                                </Box>
                                              );
                                            })}
                                          </Stack>
                                        ) : (
                                          <Typography
                                            variant="caption"
                                            color="text.disabled"
                                          >
                                            —
                                          </Typography>
                                        )}
                                      </TableCell>
                                      <TableCell
                                        sx={{
                                          fontSize: 11,
                                          py: 0.75,
                                          color: "text.secondary",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {sr.completedAt
                                          ? new Date(sr.completedAt).toLocaleTimeString(
                                              undefined,
                                              { hour: "2-digit", minute: "2-digit" }
                                            )
                                          : "—"}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </>
                        ) : (
                          <Typography
                            variant="caption"
                            color="text.disabled"
                            sx={{ display: "block", mt: 1, mb: 1 }}
                          >
                            No step data captured.
                          </Typography>
                        )}

                        {/* Issues */}
                        {issues.length > 0 && (
                          <>
                            <Typography
                              variant="caption"
                              fontWeight={700}
                              color="text.secondary"
                              sx={{
                                textTransform: "uppercase",
                                letterSpacing: 0.5,
                                display: "block",
                                mb: 0.75,
                              }}
                            >
                              Issues ({openIssues} open)
                            </Typography>
                            <Stack spacing={0.5}>
                              {issues.map((issue) => (
                                <Stack
                                  key={issue.id}
                                  direction="row"
                                  alignItems="flex-start"
                                  spacing={1}
                                  sx={{
                                    p: 0.75,
                                    borderRadius: 1,
                                    border: "1px solid",
                                    borderColor: "divider",
                                    opacity: issue.resolved ? 0.5 : 1,
                                    bgcolor:
                                      issue.isBlocking && !issue.resolved
                                        ? "rgba(244,67,54,0.04)"
                                        : undefined,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      width: 7,
                                      height: 7,
                                      borderRadius: "50%",
                                      bgcolor:
                                        SEVERITY_COLOR[issue.severity] ?? "#999",
                                      mt: 0.6,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Stack
                                      direction="row"
                                      alignItems="center"
                                      spacing={0.5}
                                    >
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          textDecoration: issue.resolved
                                            ? "line-through"
                                            : "none",
                                        }}
                                      >
                                        {issue.description}
                                      </Typography>
                                      {issue.isBlocking && (
                                        <Chip
                                          size="small"
                                          label="Blocking"
                                          color="error"
                                          sx={{
                                            height: 14,
                                            fontSize: 9,
                                            "& .MuiChip-label": { px: 0.4 },
                                          }}
                                        />
                                      )}
                                    </Stack>
                                    {issue.stepTitle && (
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        display="block"
                                      >
                                        Step: {issue.stepTitle}
                                      </Typography>
                                    )}
                                    <Typography
                                      variant="caption"
                                      color="text.disabled"
                                      display="block"
                                    >
                                      {new Date(issue.reportedAt).toLocaleString()} ·{" "}
                                      {issue.severity}
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

      {/* ── Re-run confirmation dialog ── */}
      <Dialog
        open={rerunConfirmOpen}
        onClose={() => setRerunConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Re-run Workflow</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2">
              This will create a new run for{" "}
              <strong>{workflowConfigName}</strong> on asset{" "}
              <strong>{asset.assetTag}</strong>.
            </Typography>
            <Alert severity="info" icon={false}>
              All previously captured values will be pre-loaded so your team can
              review and update them as needed before completing the new run.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRerunConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRerunConfirm}
            startIcon={<ReplayOutlined />}
          >
            Start Re-run →
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
