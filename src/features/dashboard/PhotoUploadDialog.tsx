import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import {
  CheckCircleOutlined,
  ExpandMoreOutlined,
  PhotoCameraOutlined,
  VisibilityOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { notificationService } from "../../services/notificationService";
import { useAuth } from "../../hooks/useAuth";

// ── Types ──────────────────────────────────────────────────────────────────────

export type MissingStep = {
  stepId: string;
  stepOrder: number;
  stepTitle: string;
  stepDescription?: string;
  inputId: string;
  inputLabel: string;
  inputType: "photo" | "video";
  captured: number;
};

export type MissingMediaFlag = {
  id: string;
  runId: string;
  assetId: string;
  assetTag: string;
  jobNumber: string;
  workflowName: string;
  technicianUserId: string;
  technicianName: string;
  completedAt: string;
  missingSteps: MissingStep[];
  totalExpected: number;
  totalCaptured: number;
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
};

export type PhotoUpdateNotification = {
  id: string;
  runId: string;
  assetTag: string;
  jobNumber: string;
  workflowName: string;
  installerName: string;
  updatedAt: string;
  stillMissing: number;
  wasComplete: boolean;
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface PhotoUploadDialogProps {
  open: boolean;
  flag: MissingMediaFlag;
  currentUserName: string;
  /** "installer" shows upload UI; "pm" shows step preview + remind button */
  mode?: "installer" | "pm";
  onClose: () => void;
  onUpdated: (updatedFlag: MissingMediaFlag | null) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function readFilesAsBase64(files: FileList): Promise<string[]> {
  return Promise.all(
    Array.from(files).map(
      (f) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        })
    )
  );
}

function parseCaptures(raw: string | undefined): string[] {
  try {
    const arr = JSON.parse(raw ?? "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function parseWorkflowStepsFromSnapshot(snapshotJson: string) {
  try {
    const snapshot = JSON.parse(snapshotJson ?? "{}");
    const stepsRaw = typeof snapshot.stepsJson === "string" ? snapshot.stepsJson : "[]";
    const parsed = JSON.parse(stepsRaw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.steps)) return parsed.steps;
  } catch {}
  return [] as Array<{
    id: string;
    order?: number;
    title?: string;
    description?: string;
    inputs?: Array<{ id: string; label?: string; type?: string }>;
  }>;
}

function parseStepResults(stepResultsJson: string) {
  try {
    const parsed = JSON.parse(stepResultsJson ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as Array<{ stepId: string; values?: Record<string, string>; iterationIndex?: number }>;
  }
}

// Derive all photo/video steps from the workflow snapshot + current step results.
// Returns { allSteps, missingSteps } so the caller can show full picture.
function derivePhotoSteps(
  workflowSnapshotJson: string,
  stepResultsJson: string
): { allSteps: MissingStep[]; missingSteps: MissingStep[] } {
  try {
    const steps = parseWorkflowStepsFromSnapshot(workflowSnapshotJson);
    const stepResults = parseStepResults(stepResultsJson);

    const allSteps: MissingStep[] = [];
    let stepIndex = 0;
    for (const step of steps) {
      stepIndex++;
      for (const inp of step.inputs ?? []) {
        if (inp.type === "photo" || inp.type === "video") {
          const captured = Math.max(
            0,
            ...stepResults
              .filter((entry) => entry.stepId === step.id)
              .map((entry) => parseCaptures(entry.values?.[inp.id]).length)
          );
          allSteps.push({
            stepId: step.id,
            stepOrder: step.order ?? stepIndex,
            stepTitle: step.title ?? step.id,
            stepDescription: step.description,
            inputId: inp.id,
            inputLabel: inp.label ?? (inp.type === "video" ? "Video" : "Photo"),
            inputType: (inp.type as "photo" | "video"),
            captured,
          });
        }
      }
    }
    return { allSteps, missingSteps: allSteps.filter((s) => s.captured === 0) };
  } catch {
    return { allSteps: [], missingSteps: [] };
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PhotoUploadDialog({
  open,
  flag: rawFlag,
  currentUserName,
  mode = "installer",
  onClose,
  onUpdated,
}: PhotoUploadDialogProps) {
  const { user } = useAuth();
  // Normalize backward-compat fields
  const flag: MissingMediaFlag = {
    ...rawFlag,
    missingSteps: rawFlag.missingSteps ?? [],
    totalExpected: rawFlag.totalExpected ?? 0,
    totalCaptured: rawFlag.totalCaptured ?? 0,
  };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderSent, setReminderSent] = useState(false);

  // Derived from live run data — overrides stale flag data
  const [runValues, setRunValues] = useState<Record<string, Record<string, string>>>({});
  const [allPhotoSteps, setAllPhotoSteps] = useState<MissingStep[]>([]);
  const [effectiveMissingSteps, setEffectiveMissingSteps] = useState<MissingStep[]>([]);

  // Files added this session, keyed by `${stepId}-${inputId}`
  const [localCaptures, setLocalCaptures] = useState<Record<string, string[]>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Load run on open — derive photo steps from live data
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setLocalCaptures({});
    assetWorkflowRunService.getById(flag.runId).then((run) => {
      if (!run) { setError("Could not load run data."); setLoading(false); return; }
      const { allSteps, missingSteps } = derivePhotoSteps(
        run.workflowSnapshotJson ?? "{}",
        run.stepResultsJson ?? "[]"
      );
      const values: Record<string, Record<string, string>> = {};
      for (const entry of parseStepResults(run.stepResultsJson ?? "[]")) {
        if (entry?.stepId) values[entry.stepId] = { ...(entry.values ?? {}) };
      }
      setRunValues(values);
      setAllPhotoSteps(allSteps);
      setEffectiveMissingSteps(missingSteps);
      setLoading(false);
    });
  }, [open, flag.runId]);

  function getExistingCaptures(stepId: string, inputId: string): string[] {
    return parseCaptures(runValues[stepId]?.[inputId]);
  }

  function getCurrentCaptures(stepId: string, inputId: string): string[] {
    const key = `${stepId}-${inputId}`;
    return [...getExistingCaptures(stepId, inputId), ...(localCaptures[key] ?? [])];
  }

  async function handleFilesSelected(stepId: string, inputId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const base64s = await readFilesAsBase64(files);
    const key = `${stepId}-${inputId}`;
    setLocalCaptures((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), ...base64s] }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const merged: Record<string, Record<string, string>> = { ...runValues };
      for (const [key, newFiles] of Object.entries(localCaptures)) {
        const dashIdx = key.indexOf("-");
        const stepId = key.slice(0, dashIdx);
        const inputId = key.slice(dashIdx + 1);
        const existing = getExistingCaptures(stepId, inputId);
        if (!merged[stepId]) merged[stepId] = {};
        merged[stepId][inputId] = JSON.stringify([...existing, ...newFiles]);
      }

      const newStepResultsJson = JSON.stringify(merged);
      await assetWorkflowRunService.patchStepResults(flag.runId, newStepResultsJson, currentUserName);

      // Re-derive which steps are still missing after save
      const stillMissing = effectiveMissingSteps.filter(({ stepId, inputId }) => {
        const key = `${stepId}-${inputId}`;
        return getExistingCaptures(stepId, inputId).length + (localCaptures[key]?.length ?? 0) === 0;
      });
      const allDone = stillMissing.length === 0;
      const newTotalCaptured = allPhotoSteps.length - stillMissing.length;

      // Update/remove flag
      const existingFlags: MissingMediaFlag[] = JSON.parse(localStorage.getItem("pm_missing_media_flags") ?? "[]");
      if (allDone) {
        localStorage.setItem("pm_missing_media_flags", JSON.stringify(existingFlags.filter((f) => f.runId !== flag.runId)));
        window.dispatchEvent(new Event("missing-media-flags-changed"));
        onUpdated(null);
      } else {
        const updatedFlag: MissingMediaFlag = {
          ...flag,
          missingSteps: stillMissing,
          totalExpected: allPhotoSteps.length,
          totalCaptured: newTotalCaptured,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: currentUserName,
        };
        localStorage.setItem("pm_missing_media_flags", JSON.stringify(existingFlags.map((f) => f.runId === flag.runId ? updatedFlag : f)));
        window.dispatchEvent(new Event("missing-media-flags-changed"));
        onUpdated(updatedFlag);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save photos. Please try again.");
      setSaving(false);
    }
  }

  function handleRemindInstaller() {
    void notificationService.create({
      eventType: "missing-media-reminder",
      severity: "warning",
      title: `Reminder: upload media for ${flag.assetTag}`,
      message: `${currentUserName} sent you a reminder to upload missing workflow media for asset ${flag.assetTag} on job ${flag.jobNumber}.`,
      recipientUserIds: flag.technicianUserId ? [flag.technicianUserId] : [],
      projectId: null,
      assetId: flag.assetId,
      runId: flag.runId,
      entityType: "asset-workflow-run",
      entityId: flag.runId,
      triggeredByUserId: user.id,
      triggeredByName: currentUserName,
    }).then(() => {
      setReminderSent(true);
      setTimeout(() => setReminderSent(false), 3000);
    }).catch((error) => {
      console.error(error);
      setError("Failed to send reminder. Please try again.");
    });
  }

  // Live counts based on what's been added this session
  const liveMissingCount = effectiveMissingSteps.filter(({ stepId, inputId }) => {
    const key = `${stepId}-${inputId}`;
    return getExistingCaptures(stepId, inputId).length + (localCaptures[key]?.length ?? 0) === 0;
  }).length;
  const liveCaptured = allPhotoSteps.length - liveMissingCount;
  const totalExpected = allPhotoSteps.length;
  const progress = totalExpected > 0 ? Math.round((liveCaptured / totalExpected) * 100) : 0;
  const qrUrl = window.location.origin + window.location.pathname;
  const isPM = mode === "pm";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PhotoCameraOutlined sx={{ color: "warning.main" }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              {flag.assetTag} — {flag.workflowName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {loading ? "Loading…" : `${liveCaptured} of ${totalExpected} photo steps completed`}
            </Typography>
          </Box>
          {isPM && !loading && effectiveMissingSteps.length > 0 && (
            <Chip
              label={`${effectiveMissingSteps.length} missing`}
              size="small"
              color="warning"
              variant="outlined"
              icon={<WarningAmberOutlined />}
            />
          )}
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={32} />
          </Stack>
        )}

        {!loading && (
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}

            {/* Progress */}
            {totalExpected > 0 && (
              <Box>
                <Stack direction="row" justifyContent="space-between" mb={0.5}>
                  <Typography variant="caption" color="text.secondary">Photo progress</Typography>
                  <Typography variant="caption" fontWeight={600}>{liveCaptured}/{totalExpected}</Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  color={liveMissingCount === 0 ? "success" : "warning"}
                  sx={{ borderRadius: 1, height: 6 }}
                />
              </Box>
            )}

            {/* QR code — installer mode only */}
            {!isPM && (
              <Accordion disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                  <Typography variant="body2" fontWeight={600}>QR Code — open on phone</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack alignItems="center" spacing={1}>
                    <QRCodeSVG value={qrUrl} size={180} />
                    <Typography variant="caption" color="text.secondary">
                      Scan to open this app on another device
                    </Typography>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}

            {/* PM preview: show ALL photo steps with status */}
            {isPM && allPhotoSteps.length > 0 && (
              <>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <VisibilityOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    RUN PHOTO STATUS — {flag.technicianName} · {new Date(flag.completedAt).toLocaleDateString()}
                  </Typography>
                </Stack>
                {allPhotoSteps.map(({ stepId, stepOrder, stepTitle, inputId, inputLabel, captured }) => (
                  <Card
                    key={`${stepId}-${inputId}`}
                    variant="outlined"
                    sx={{ borderColor: captured > 0 ? "success.main" : "warning.main", opacity: captured > 0 ? 0.7 : 1 }}
                  >
                    <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Chip label={`Step ${stepOrder}`} size="small" variant="outlined" sx={{ fontSize: "0.65rem", height: 18, borderRadius: 1, flexShrink: 0 }} />
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={600}>{stepTitle}</Typography>
                          <Typography variant="caption" color="text.secondary">{inputLabel}</Typography>
                        </Box>
                        {captured > 0 ? (
                          <Chip
                            icon={<CheckCircleOutlined />}
                            label={`${captured} captured`}
                            size="small"
                            color="success"
                            variant="outlined"
                          />
                        ) : (
                          <Chip
                            icon={<WarningAmberOutlined />}
                            label="Missing"
                            size="small"
                            color="warning"
                            variant="filled"
                          />
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
                {effectiveMissingSteps.length === 0 && (
                  <Alert severity="success" icon={<CheckCircleOutlined />}>
                    All photo steps are completed for this run.
                  </Alert>
                )}
                <Divider />
              </>
            )}

            {/* Installer mode: show only missing steps with upload */}
            {!isPM && effectiveMissingSteps.map(({ stepId, stepOrder, stepTitle, stepDescription, inputId, inputLabel, inputType }) => {
              const key = `${stepId}-${inputId}`;
              const currentCount = getCurrentCaptures(stepId, inputId).length;
              const isDone = currentCount > 0;
              const isVideo = inputType === "video";
              const mediaLabel = isVideo ? "video" : "photo";
              return (
                <Card key={key} variant="outlined" sx={{ borderColor: isDone ? "success.main" : "warning.main" }}>
                  <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                    {/* Step header */}
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                      <Chip label={`Step ${stepOrder}`} size="small" variant="outlined" sx={{ fontSize: "0.65rem", height: 18, borderRadius: 1 }} />
                      <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.2 }}>{stepTitle}</Typography>
                    </Stack>

                    {/* Step description */}
                    {stepDescription && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, lineHeight: 1.4 }}>
                        {stepDescription}
                      </Typography>
                    )}

                    {/* Input label + status + action */}
                    <Stack direction="row" alignItems="center" spacing={1} mt={0.5}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" fontWeight={600} color={isDone ? "success.main" : "warning.main"}>
                          {inputLabel}
                        </Typography>
                        <Box mt={0.25}>
                          {isDone ? (
                            <Chip
                              icon={<CheckCircleOutlined />}
                              label={`${currentCount} ${mediaLabel}${currentCount !== 1 ? "s" : ""} added`}
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          ) : (
                            <Chip label={`No ${mediaLabel}s yet`} size="small" color="warning" variant="outlined" />
                          )}
                        </Box>
                      </Box>
                      <Box>
                        <input
                          type="file"
                          accept="image/*,video/*"
                          multiple
                          capture="environment"
                          style={{ display: "none" }}
                          ref={(el) => { fileInputRefs.current[key] = el; }}
                          onChange={(e) => handleFilesSelected(stepId, inputId, e.target.files)}
                        />
                        <Button
                          variant="contained"
                          size="small"
                          color={isDone ? "success" : "warning"}
                          startIcon={<PhotoCameraOutlined sx={{ fontSize: 16 }} />}
                          onClick={() => fileInputRefs.current[key]?.click()}
                        >
                          {isDone ? `Add more` : `Add ${mediaLabel}`}
                        </Button>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}

            {!isPM && effectiveMissingSteps.length === 0 && totalExpected > 0 && (
              <Alert severity="success" icon={<CheckCircleOutlined />}>
                All photo steps completed — nothing to upload.
              </Alert>
            )}

            {totalExpected === 0 && !loading && (
              <Alert severity="info">
                This workflow has no photo or video steps defined.
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} color="inherit" disabled={saving}>Close</Button>
        {isPM && (
          <Button
            variant={reminderSent ? "text" : "outlined"}
            color={reminderSent ? "success" : "warning"}
            onClick={handleRemindInstaller}
            disabled={reminderSent || effectiveMissingSteps.length === 0}
          >
            {reminderSent ? "Reminder Sent ✓" : "Remind Installer"}
          </Button>
        )}
        {!isPM && (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || loading || Object.keys(localCaptures).length === 0}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {saving ? "Saving…" : "Save Photos"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
