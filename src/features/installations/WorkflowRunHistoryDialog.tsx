import React, { useEffect, useState } from "react";
import {
  AccessTimeOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  DrawOutlined,
  EditOutlined,
  ErrorOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  HourglassEmptyOutlined,
  LinkOutlined,
  LockOutlined,
  PhotoCameraOutlined,
  PlayArrowOutlined,
  ReplayOutlined,
  ReportProblemOutlined,
  VideocamOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import SignatureBadge from "../../components/ui/SignatureBadge";
import SignatureDialog from "../../components/ui/SignatureDialog";
import { signatureService, type CreateTokenPayload } from "../../services/signatureService";
import { projectContactService } from "../../services/projectContactService";
import type { ProjectContact } from "../../types/projectContact";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
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
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { brandSettingsService } from "../../services/brandSettingsService";
import { generateWorkflowReport, resolveImageToDataUrl } from "../../utils/generateWorkflowReport";
import { countMissingWorkflowItems, getMissingWorkflowItems } from "../../utils/workflowCompleteness";
import type { AssetWorkflowRun, RunIssue, RunTimeEntry, StepResult } from "../../types/assetWorkflowRun";
import TimeEntriesEditorDialog from "../../components/ui/TimeEntriesEditorDialog";
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
  onContinue?: (run: AssetWorkflowRun) => void;
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

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds || 0);
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function parseTimeEntries(json: string): RunTimeEntry[] {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>[];
    if (!Array.isArray(raw)) return [];
    return raw.map((e) => ({
      id: String(e.id ?? e.Id ?? ""),
      category: String(e.category ?? e.Category ?? "productive") as "productive" | "downtime",
      startedAtUtc: String(e.startedAtUtc ?? e.StartedAtUtc ?? ""),
      endedAtUtc: (e.endedAtUtc ?? e.EndedAtUtc ?? null) as string | null,
      reason: (e.reason ?? e.Reason ?? null) as string | null,
    }));
  } catch { return []; }
}

function timeEntryDuration(entry: RunTimeEntry, fallbackEndUtc?: string): number {
  const end = entry.endedAtUtc ?? fallbackEndUtc;
  if (!end) return 0;
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(entry.startedAtUtc).getTime()) / 1000));
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

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

function countStoredMediaItems(value: string): number {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean).length : 0;
  } catch {
    return 0;
  }
}

function formatStepResultValue(input?: StepInput, captureLabel?: string, inputId?: string, value?: string): string {
  if (!value) return "No";
  if (inputId === "pass") return value === "true" ? "Pass" : "Fail";
  if (input?.type === "checkbox") return value === "true" ? "Yes" : "No";
  if (input?.type === "photo" || input?.type === "video") {
    return countStoredMediaItems(value) > 0 ? "Yes" : "No";
  }
  if (input?.type === "signature") return "Yes";
  if (input?.type === "component") {
    try {
      const parsed = JSON.parse(value) as Record<string, string>;
      return Object.values(parsed ?? {}).some(Boolean) ? "Yes" : "No";
    } catch {
      return "Yes";
    }
  }
  if (captureLabel) return value.trim() ? "Yes" : "No";
  return value;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkflowRunHistoryDialog({
  open,
  onClose,
  asset,
  workflowConfigId,
  workflowConfigName,
  onRerun,
  onContinue,
  project,
  customerLogoBase64,
  assignedTechnician,
}: Props) {
  const [runs, setRuns] = useState<AssetWorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [rerunConfirmOpen, setRerunConfirmOpen] = useState(false);
  const [reportGenerating, setReportGenerating] = useState<string | null>(null);
  const [timeEditorRun, setTimeEditorRun] = useState<AssetWorkflowRun | null>(null);
  const [signDialogRun, setSignDialogRun] = useState<AssetWorkflowRun | null>(null);
  const [tokenDialogRun, setTokenDialogRun] = useState<AssetWorkflowRun | null>(null);
  const [tokenEmail, setTokenEmail] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenMessage, setTokenMessage] = useState("");
  const [tokenSending, setTokenSending] = useState(false);
  const [tokenLink, setTokenLink] = useState<string | null>(null);
  const [projectContacts, setProjectContacts] = useState<ProjectContact[]>([]);
  const [autoContact, setAutoContact] = useState<ProjectContact | null>(null);
  const [tokenEditMode, setTokenEditMode] = useState(false);
  const [tokenSaveAsNew, setTokenSaveAsNew] = useState(false);
  const [expandedStepResultIds, setExpandedStepResultIds] = useState<Record<string, boolean>>({});

  const DEFAULT_MESSAGE = "We are pleased to inform you that the installation work has been completed. Please use the link below to review the completed workflow documentation and provide your sign-off.";

  const openTokenDialog = async (run: AssetWorkflowRun) => {
    setTokenLink(null);
    setTokenEditMode(false);
    setTokenSaveAsNew(false);
    setTokenMessage(DEFAULT_MESSAGE);
    try {
      const contacts = await projectContactService.listContacts(asset.projectId);
      setProjectContacts(contacts);
      const primary = contacts.find(c => c.isPrimarySigner) ?? contacts[0] ?? null;
      setAutoContact(primary);
      setTokenEmail(primary?.email ?? "");
      setTokenName(primary?.name ?? "");
    } catch {
      setProjectContacts([]);
      setAutoContact(null);
      setTokenEmail("");
      setTokenName("");
    }
    setTokenDialogRun(run);
  };

  const closeTokenDialog = () => {
    setTokenDialogRun(null);
    setTokenLink(null);
    setTokenEditMode(false);
    setTokenSaveAsNew(false);
  };

  const handleSignedRefresh = () => {
    if (!open) return;
    assetWorkflowRunService.listByAsset(asset.id).then((all) => {
      const filtered = all
        .filter((r) => r.workflowConfigId === workflowConfigId)
        .sort((a, b) => (b.runNumber ?? 0) - (a.runNumber ?? 0));
      setRuns(filtered);
    });
  };

  const handleCreateToken = async () => {
    if (!tokenDialogRun) return;
    setTokenSending(true);
    try {
      // Determine contactId: if using the auto-populated contact and not editing, link it
      const isUsingAutoContact = !tokenEditMode && autoContact != null;
      const payload: CreateTokenPayload = {
        runId: tokenDialogRun.id,
        contactId: isUsingAutoContact ? autoContact!.id : undefined,
        recipientEmail: tokenEmail,
        recipientName: tokenName || undefined,
        expiresInHours: 72,
        customMessage: tokenMessage.trim() || undefined
      };
      const token = await signatureService.createToken(payload);
      const baseUrl = window.location.origin;
      setTokenLink(`${baseUrl}/sign/${token.id}`);

      // Save as new contact (Customer 2) if requested
      if (tokenSaveAsNew && tokenEmail.trim()) {
        try {
          await projectContactService.createContact(asset.projectId, {
            name: tokenName || tokenEmail,
            email: tokenEmail,
            phone: "",
            title: "",
            preferredSignMethod: "email",
            isPrimarySigner: false,
            ccReports: false,
            address: ""
          });
        } catch { /* silently fail — token was already created */ }
      }

      // If no contacts existed, save as Customer 1
      if (projectContacts.length === 0 && tokenEmail.trim()) {
        try {
          const saved = await projectContactService.createContact(asset.projectId, {
            name: tokenName || tokenEmail,
            email: tokenEmail,
            phone: "",
            title: "",
            preferredSignMethod: "email",
            isPrimarySigner: true,
            ccReports: false,
            address: ""
          });
          setProjectContacts([saved]);
          setAutoContact(saved);
        } catch { /* silently fail */ }
      }
    } catch { /* handled inline */ }
    finally { setTokenSending(false); }
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setExpandedRunId(null);
    setExpandedStepResultIds({});
    assetWorkflowRunService
      .listByAsset(asset.id)
      .then((all) => {
        const filtered = all
          .filter((r) => !workflowConfigId || r.workflowConfigId === workflowConfigId)
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

  const latestRunNumber = runs.reduce((max, run) => Math.max(max, run.runNumber ?? 0), 0);
  const latestLockedRun = runs.find((r) => r.isLocked) ?? null;
  const latestInProgressRun = runs.find((r) => !r.isLocked && r.status === "InProgress") ?? null;

  async function handleDownloadReport(run: AssetWorkflowRun, includeAllSteps = false) {
    setReportGenerating(run.id);
    try {
      const [brandSettings, resolvedCustLogo, signatureEvents] = await Promise.all([
        brandSettingsService.get(),
        customerLogoBase64 ? resolveImageToDataUrl(customerLogoBase64) : Promise.resolve(null),
        run.isLocked ? signatureService.listEvents(run.id) : Promise.resolve([]),
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
        includeAllSteps,
        signatureEvents,
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
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { maxHeight: "90vh" } }}
      >
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
              {latestInProgressRun && onContinue && (
                <Tooltip title="Resume the in-progress run from where it was paused">
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    startIcon={<PlayArrowOutlined />}
                    onClick={() => { onContinue(latestInProgressRun); onClose(); }}
                  >
                    Continue
                  </Button>
                </Tooltip>
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
                    variant="outlined"
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

        <DialogContent dividers sx={{ px: 0, pb: 2, overflowX: "hidden" }}>
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
                const missingMedia = countMissingWorkflowItems(run);
                const isSuperseded = (run.runNumber ?? 0) < latestRunNumber;
                const isPendingSignature =
                  run.signatureStatus === "PendingInstaller" || run.signatureStatus === "PendingCustomer";
                const signatureActionBlocked = run.isLocked && isPendingSignature && isSuperseded;

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
                          {signatureActionBlocked && (
                            <Chip
                              size="small"
                              label={`Superseded by Run #${latestRunNumber}`}
                              color="default"
                              variant="outlined"
                              sx={{ height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.6 } }}
                            />
                          )}
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.75} mt={0.25}>
                          <Typography variant="caption" color="text.secondary">
                            {stepResults.length} step
                            {stepResults.length !== 1 ? "s" : ""} captured
                          </Typography>
                          <Chip
                            size="small"
                            label={`Productive ${formatDuration(run.productiveSeconds)}`}
                            color="success"
                            variant="outlined"
                            sx={{ height: 16, fontSize: 10, "& .MuiChip-label": { px: 0.5 } }}
                          />
                          <Chip
                            size="small"
                            label={`Downtime ${formatDuration(run.downtimeSeconds)}`}
                            color={run.downtimeSeconds > 0 ? "warning" : "default"}
                            variant="outlined"
                            sx={{ height: 16, fontSize: 10, "& .MuiChip-label": { px: 0.5 } }}
                          />
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
                          {missingMedia > 0 && (
                            <Chip
                              size="small"
                              icon={<WarningAmberOutlined sx={{ fontSize: "0.75rem !important" }} />}
                              label={`${missingMedia} missing items`}
                              color="warning"
                              variant="outlined"
                              sx={{ height: 16, fontSize: 10, "& .MuiChip-label": { px: 0.5 } }}
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
                        <Tooltip title="Edit / correct time entries">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTimeEditorRun(run);
                            }}
                          >
                            <AccessTimeOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {run.isLocked && (
                          <Tooltip title="Download standard PDF report (completed steps only)">
                            <IconButton
                              size="small"
                              disabled={reportGenerating === run.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDownloadReport(run, false);
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
                          label={run.status === "InProgress" ? "In Progress" : run.status}
                          color={STATUS_COLOR[run.status] ?? "default"}
                          icon={
                            (STATUS_ICON[run.status] as React.ReactElement) ?? undefined
                          }
                        />
                        {run.isLocked && (
                          <SignatureBadge status={run.signatureStatus ?? "None"} />
                        )}
                        {run.isLocked && run.signatureStatus === "PendingInstaller" && (
                          <Tooltip title={signatureActionBlocked ? `Run superseded by Run #${latestRunNumber}` : "Sign as installer"}>
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                color="primary"
                                startIcon={<DrawOutlined />}
                                disabled={signatureActionBlocked}
                                onClick={(e) => { e.stopPropagation(); setSignDialogRun(run); }}
                                sx={{ py: 0, minHeight: 26 }}
                              >
                                Sign
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                        {run.isLocked && run.signatureStatus === "PendingCustomer" && (
                          <Tooltip title={signatureActionBlocked ? `Run superseded by Run #${latestRunNumber}` : "Generate secure link for customer signature"}>
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                color="info"
                                startIcon={<LinkOutlined />}
                                disabled={signatureActionBlocked}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openTokenDialog(run);
                                }}
                                sx={{ py: 0, minHeight: 26 }}
                              >
                                Send to customer
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                        {!run.isLocked && run.status === "InProgress" && onContinue && (
                          <Tooltip title="Resume this run">
                            <Button
                              size="small"
                              variant="contained"
                              color="primary"
                              startIcon={<PlayArrowOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                onContinue(run);
                                onClose();
                              }}
                              sx={{ ml: 0.5 }}
                            >
                              Continue
                            </Button>
                          </Tooltip>
                        )}
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
                        {signatureActionBlocked && (
                          <Alert severity="info" sx={{ mt: 1.25, mb: 1.5 }}>
                            This run has been superseded by Run #{latestRunNumber}. Signature actions are disabled for this older run.
                          </Alert>
                        )}
                        {/* Download report CTA inside expanded section */}
                        {run.isLocked && (
                          <Stack direction="row" spacing={1} sx={{ mt: 1.25, mb: 1.5 }} flexWrap="wrap" useFlexGap>
                            <Tooltip title="Completed steps only">
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={reportGenerating === run.id ? <CircularProgress size={13} /> : <DownloadOutlined />}
                                disabled={reportGenerating === run.id}
                                onClick={() => void handleDownloadReport(run, false)}
                              >
                                {reportGenerating === run.id ? "Generating…" : "Standard Report"}
                              </Button>
                            </Tooltip>
                            <Tooltip title="All workflow steps including uncompleted ones">
                              <Button
                                size="small"
                                variant="outlined"
                                color="secondary"
                                startIcon={reportGenerating === run.id ? <CircularProgress size={13} /> : <DownloadOutlined />}
                                disabled={reportGenerating === run.id}
                                onClick={() => void handleDownloadReport(run, true)}
                              >
                                Full Report (all steps)
                              </Button>
                            </Tooltip>
                          </Stack>
                        )}

                        <Stack direction="row" spacing={1} sx={{ mb: 1.25 }} useFlexGap flexWrap="wrap">
                          <Chip size="small" color="success" variant="outlined" label={`Productive: ${formatDuration(run.productiveSeconds)}`} />
                          <Chip size="small" color={run.downtimeSeconds > 0 ? "warning" : "default"} variant="outlined" label={`Downtime: ${formatDuration(run.downtimeSeconds)}`} />
                          <Chip size="small" variant="outlined" label={`Downtime events: ${run.downtimeEvents ?? 0}`} />
                        </Stack>

                        {/* Downtime event breakdown */}
                        {(() => {
                          const entries = parseTimeEntries(run.timeTrackingJson ?? "[]");
                          const downtimeEntries = entries.filter((e) => e.category === "downtime");
                          if (downtimeEntries.length === 0) return null;
                          return (
                            <>
                              <Typography variant="caption" fontWeight={700} color="text.secondary"
                                sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.75 }}>
                                Downtime Events ({downtimeEntries.length})
                              </Typography>
                              <Table size="small" sx={{ mb: 1.5 }}>
                                <TableHead>
                                  <TableRow sx={{ bgcolor: "rgba(255,255,255,0.04)" }}>
                                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Reason</TableCell>
                                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700, width: 60 }}>Start</TableCell>
                                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700, width: 60 }}>End</TableCell>
                                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700, width: 55 }}>Duration</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {downtimeEntries.map((e) => {
                                    const dur = timeEntryDuration(e, run.completedAt ?? undefined);
                                    return (
                                      <TableRow key={e.id}>
                                        <TableCell sx={{ fontSize: 12, py: 0.75 }}>
                                          {e.reason || <Typography component="span" variant="caption" color="text.disabled">—</Typography>}
                                        </TableCell>
                                        <TableCell sx={{ fontSize: 11, py: 0.75, color: "text.secondary", whiteSpace: "nowrap" }}>
                                          {fmtTime(e.startedAtUtc)}
                                        </TableCell>
                                        <TableCell sx={{ fontSize: 11, py: 0.75, color: "text.secondary", whiteSpace: "nowrap" }}>
                                          {e.endedAtUtc ? fmtTime(e.endedAtUtc) : <Typography component="span" variant="caption" color="warning.main">Open</Typography>}
                                        </TableCell>
                                        <TableCell sx={{ fontSize: 11, py: 0.75, color: "warning.main", whiteSpace: "nowrap" }}>
                                          {dur > 0 ? formatDuration(dur) : "—"}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </>
                          );
                        })()}

                        {/* Step results */}
                        {stepResults.length > 0 ? (
                          <>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() =>
                                setExpandedStepResultIds((prev) => ({
                                  ...prev,
                                  [`run:${run.id}`]: !prev[`run:${run.id}`],
                                }))
                              }
                              endIcon={
                                expandedStepResultIds[`run:${run.id}`]
                                  ? <ExpandLessOutlined fontSize="small" />
                                  : <ExpandMoreOutlined fontSize="small" />
                              }
                              sx={{ alignSelf: "flex-start", mt: run.isLocked ? 0 : 1, mb: 1 }}
                            >
                              {expandedStepResultIds[`run:${run.id}`]
                                ? "Hide step results"
                                : `Show step results (${stepResults.length})`}
                            </Button>
                            <Collapse in={Boolean(expandedStepResultIds[`run:${run.id}`])} timeout="auto" unmountOnExit>
                              <Stack spacing={1.25} sx={{ mb: 1.5 }}>
                                {stepResults.map((sr) => {
                                  const step: WorkflowStep | undefined = stepMap[sr.stepId];
                                  const stepTitle =
                                    step?.title ?? (sr.values as Record<string, string>)?.label ?? `${sr.stepId.slice(0, 8)}...`;
                                  const inputDefs: StepInput[] = step?.inputs ?? [];
                                  const missingInputs = getMissingWorkflowItems(step, sr.values);
                                  const entries = Object.entries(sr.values ?? {}).filter(([k, v]) => v && k !== "label");
                                  const stepKey = `run:${run.id}:step:${sr.stepId}`;
                                  const isStepExpanded = Boolean(expandedStepResultIds[stepKey]);

                                  return (
                                    <Paper key={sr.stepId} variant="outlined" sx={{ p: 1.25, overflow: "hidden" }}>
                                      <Stack spacing={0.75}>
                                        <Stack
                                          direction="row"
                                          spacing={1}
                                          alignItems="flex-start"
                                          justifyContent="space-between"
                                          useFlexGap
                                          flexWrap="wrap"
                                        >
                                          <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600 }}>
                                              {stepTitle}
                                            </Typography>
                                            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                              <Chip
                                                size="small"
                                                variant="outlined"
                                                label={`${entries.length} item${entries.length === 1 ? "" : "s"} captured`}
                                                sx={{ height: 18, fontSize: 10 }}
                                              />
                                              {missingInputs.length > 0 && (
                                                <Chip
                                                  size="small"
                                                  color="warning"
                                                  variant="outlined"
                                                  icon={<WarningAmberOutlined sx={{ fontSize: "0.75rem !important" }} />}
                                                  label={missingInputs.length === 1 ? "1 missing item" : `${missingInputs.length} missing items`}
                                                  sx={{ height: 18, fontSize: 10 }}
                                                />
                                              )}
                                              <Chip
                                                size="small"
                                                variant="outlined"
                                                label={
                                                  sr.completedAt
                                                    ? new Date(sr.completedAt).toLocaleTimeString(undefined, {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                      })
                                                    : "No time"
                                                }
                                                sx={{ height: 18, fontSize: 10 }}
                                              />
                                            </Stack>
                                          </Stack>
                                          <Button
                                            size="small"
                                            variant="text"
                                            onClick={() =>
                                              setExpandedStepResultIds((prev) => ({
                                                ...prev,
                                                [stepKey]: !prev[stepKey],
                                              }))
                                            }
                                            endIcon={
                                              isStepExpanded
                                                ? <ExpandLessOutlined fontSize="small" />
                                                : <ExpandMoreOutlined fontSize="small" />
                                            }
                                            sx={{ flexShrink: 0 }}
                                          >
                                            {isStepExpanded ? "Hide details" : "Show details"}
                                          </Button>
                                        </Stack>

                                        <Collapse in={isStepExpanded} timeout="auto" unmountOnExit>
                                          <Stack spacing={0.75} sx={{ pt: 0.25 }}>
                                            {missingInputs.map((input) => (
                                              <Stack
                                                key={`missing-${input.id}`}
                                                direction="row"
                                                spacing={1}
                                                alignItems="center"
                                                flexWrap="wrap"
                                                useFlexGap
                                              >
                                                <Typography variant="caption" color="warning.main">
                                                  {input.label}:
                                                </Typography>
                                                <Chip
                                                  size="small"
                                                  color="warning"
                                                  icon={
                                                    input.kind === "video" ? (
                                                      <VideocamOutlined sx={{ fontSize: "0.75rem !important" }} />
                                                    ) : (
                                                      <PhotoCameraOutlined sx={{ fontSize: "0.75rem !important" }} />
                                                    )
                                                  }
                                                  label={
                                                    input.kind === "video"
                                                      ? "Video missing"
                                                      : input.kind === "photo"
                                                        ? "Photo missing"
                                                        : input.kind === "capture"
                                                          ? "Capture missing"
                                                          : "Required field missing"
                                                  }
                                                  sx={{ height: 18, fontSize: 10 }}
                                                />
                                              </Stack>
                                            ))}
                                            {entries.length > 0 ? (
                                              <Stack spacing={0.5}>
                                                {entries.map(([inputId, val]) => {
                                                  const inputDef = inputDefs.find((inp) => inp.id === inputId);
                                                  const captureDef = !inputDef
                                                    ? (step?.captureFields ?? []).find((f) => f.id === inputId)
                                                    : undefined;
                                                  const importLabels: Record<string, string> = {
                                                    value: "Measured Value",
                                                    unit: "Unit",
                                                    pass: "Result",
                                                    notes: "Notes",
                                                  };
                                                  const label =
                                                    inputDef?.label ??
                                                    captureDef?.label ??
                                                    importLabels[inputId] ??
                                                    inputId;
                                                  const displayValue = formatStepResultValue(
                                                    inputDef,
                                                    captureDef?.label,
                                                    inputId,
                                                    val,
                                                  );

                                                  return (
                                                    <Stack
                                                      key={inputId}
                                                      direction="row"
                                                      spacing={1}
                                                      justifyContent="space-between"
                                                      alignItems="flex-start"
                                                      sx={{ gap: 1, minWidth: 0 }}
                                                    >
                                                      <Typography
                                                        variant="caption"
                                                        color="text.secondary"
                                                        sx={{ minWidth: 0, flex: 1 }}
                                                      >
                                                        {label}
                                                      </Typography>
                                                      <Typography
                                                        variant="caption"
                                                        sx={{ flexShrink: 0, fontWeight: 600, textAlign: "right" }}
                                                      >
                                                        {displayValue}
                                                      </Typography>
                                                    </Stack>
                                                  );
                                                })}
                                              </Stack>
                                            ) : missingInputs.length === 0 ? (
                                              <Typography variant="caption" color="text.disabled">
                                                No captured values.
                                              </Typography>
                                            ) : null}
                                          </Stack>
                                        </Collapse>
                                      </Stack>
                                    </Paper>
                                  );
                                })}
                              </Stack>
                            </Collapse>
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
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
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

      {/* ── Time entries editor ── */}
      {timeEditorRun && (
        <TimeEntriesEditorDialog
          open={Boolean(timeEditorRun)}
          run={timeEditorRun}
          onClose={() => setTimeEditorRun(null)}
          onSaved={(updated) => {
            setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setTimeEditorRun(null);
          }}
        />
      )}

      {/* ── Installer Sign Dialog ── */}
      {signDialogRun && (
        <SignatureDialog
          open={Boolean(signDialogRun)}
          runId={signDialogRun.id}
          signerRole="Installer"
          defaultSignerName={assignedTechnician ?? ""}
          onClose={() => setSignDialogRun(null)}
          onSigned={() => { setSignDialogRun(null); handleSignedRefresh(); }}
        />
      )}

      {/* ── Request Customer Signature Dialog ── */}
      <Dialog open={Boolean(tokenDialogRun)} onClose={closeTokenDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Request Customer Signature</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {tokenLink ? (
              <>
                <Alert severity="success">
                  Secure link generated and email sent to {tokenEmail}.
                </Alert>
                <Box sx={{ p: 1.5, background: "rgba(0,0,0,0.2)", borderRadius: 1, wordBreak: "break-all" }}>
                  <Typography variant="caption" fontFamily="monospace">{tokenLink}</Typography>
                </Box>
                <Button
                  variant="outlined"
                  onClick={() => { navigator.clipboard.writeText(tokenLink!); }}
                >
                  Copy link
                </Button>
              </>
            ) : (
              <>
                {/* ── Recipient section ── */}
                <Typography variant="subtitle2">Recipient</Typography>
                {autoContact && !tokenEditMode ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1,
                    p: 1, borderRadius: 1, background: "rgba(45,212,191,0.08)",
                    border: "1px solid rgba(45,212,191,0.25)" }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight="bold">{tokenName || autoContact.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{tokenEmail || autoContact.email}</Typography>
                      {autoContact.address && (
                        <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>{autoContact.address}</Typography>
                      )}
                    </Box>
                    <Tooltip title="Send to a different person">
                      <IconButton size="small" onClick={() => setTokenEditMode(true)}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <>
                    {projectContacts.length === 0 && (
                      <Alert severity="info" sx={{ py: 0.5, fontSize: "0.8rem" }}>
                        No contacts on file for this project. Enter details below — they will be saved as Customer 1.
                      </Alert>
                    )}
                    {tokenEditMode && autoContact && (
                      <Alert severity="info" sx={{ py: 0.5, fontSize: "0.8rem" }}>
                        Sending to a different person. Check the box below to save them as a project contact.
                      </Alert>
                    )}
                    <TextField
                      label="Customer name"
                      value={tokenName}
                      onChange={e => setTokenName(e.target.value)}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Customer email *"
                      value={tokenEmail}
                      onChange={e => setTokenEmail(e.target.value)}
                      size="small"
                      fullWidth
                      type="email"
                    />
                    {tokenEditMode && autoContact && (
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={tokenSaveAsNew}
                            onChange={e => setTokenSaveAsNew(e.target.checked)}
                          />
                        }
                        label={<Typography variant="body2">Save as Customer 2 in project contacts</Typography>}
                      />
                    )}
                  </>
                )}

                <Divider />

                {/* ── Message to customer ── */}
                <Typography variant="subtitle2">Message to customer</Typography>
                <TextField
                  label="Invitation message"
                  value={tokenMessage}
                  onChange={e => setTokenMessage(e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  minRows={4}
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
          <Button onClick={closeTokenDialog}>
            {tokenLink ? "Done" : "Cancel"}
          </Button>
          {!tokenLink && (
            <Button
              variant="contained"
              onClick={handleCreateToken}
              disabled={!tokenEmail.trim() || tokenSending}
            >
              {tokenSending ? <CircularProgress size={18} /> : "Send to customer"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
