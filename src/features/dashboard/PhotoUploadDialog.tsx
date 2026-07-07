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
  DeleteOutline,
  ExpandMoreOutlined,
  PhotoCameraOutlined,
  QrCode2Outlined,
  SmartphoneOutlined,
  VideocamOutlined,
  VisibilityOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { settingsService } from "../../services/settingsService";
import { getFallbackPublicFrontendBaseUrl } from "../../services/publicFrontendBase";
import api from "../../services/api";
import { isMobileNativePlatform } from "../../utils/platform";

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

type StoredStepCapture = {
  stepId: string;
  values: Record<string, string>;
  completedAt: string;
  iterationIndex?: number;
};

type TokenResponse = {
  token: string;
  expiresAt: string;
};

type TokenStatus = {
  status: "pending" | "complete" | "expired" | "not_found";
};

const CAPTURE_KEY_DELIMITER = "__INPUT__";

function buildCaptureKey(stepId: string, inputId: string): string {
  return `${stepId}${CAPTURE_KEY_DELIMITER}${inputId}`;
}

function parseCaptureKey(key: string): { stepId: string; inputId: string } | null {
  const delimiterIndex = key.indexOf(CAPTURE_KEY_DELIMITER);
  if (delimiterIndex < 0) return null;
  return {
    stepId: key.slice(0, delimiterIndex),
    inputId: key.slice(delimiterIndex + CAPTURE_KEY_DELIMITER.length),
  };
}

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

function acceptForInputType(inputType: "photo" | "video"): string {
  return inputType === "video" ? "video/*" : "image/*";
}

function parseCaptures(raw: string | undefined): string[] {
  try {
    const arr = JSON.parse(raw ?? "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function parseSnapshotSteps(workflowSnapshotJson: string): Array<{
  id: string;
  order?: number;
  title?: string;
  description?: string;
  inputs?: { id: string; label?: string; type?: string }[];
}> {
  try {
    const snapshot = JSON.parse(workflowSnapshotJson ?? "{}");
    if (Array.isArray(snapshot?.steps)) return snapshot.steps;
    if (typeof snapshot?.stepsJson === "string") {
      const parsed = JSON.parse(snapshot.stepsJson);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.steps)) return parsed.steps;
    }
  } catch { /* ignore */ }
  return [];
}

function parseStepValues(stepResultsJson: string): Record<string, Record<string, string>> {
  try {
    const parsed = JSON.parse(stepResultsJson ?? "[]");
    if (Array.isArray(parsed)) {
      return parsed.reduce<Record<string, Record<string, string>>>((acc, item) => {
        if (!item || typeof item !== "object" || item.stepId === "__nav__") return acc;
        const stepId = typeof item.stepId === "string" ? item.stepId : "";
        const values = item.values && typeof item.values === "object" ? item.values as Record<string, string> : null;
        if (!stepId || !values) return acc;
        acc[stepId] = values;
        return acc;
      }, {});
    }
    if (parsed && typeof parsed === "object") return parsed as Record<string, Record<string, string>>;
  } catch { /* ignore */ }
  return {};
}

function parseStepCaptures(stepResultsJson: string): StoredStepCapture[] {
  try {
    const parsed = JSON.parse(stepResultsJson ?? "[]");
    return Array.isArray(parsed) ? parsed as StoredStepCapture[] : [];
  } catch {
    return [];
  }
}

// Derive all photo/video steps from the workflow snapshot + current step results.
// Returns { allSteps, missingSteps } so the caller can show full picture.
function derivePhotoSteps(
  workflowSnapshotJson: string,
  stepResultsJson: string
): { allSteps: MissingStep[]; missingSteps: MissingStep[] } {
  try {
    const steps = parseSnapshotSteps(workflowSnapshotJson);
    const values = parseStepValues(stepResultsJson);

    const allSteps: MissingStep[] = [];
    let stepIndex = 0;
    for (const step of steps) {
      stepIndex++;
      for (const inp of step.inputs ?? []) {
        if (inp.type === "photo" || inp.type === "video") {
          const captured = parseCaptures(values[step.id]?.[inp.id]).length;
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
  const [publicFrontendBaseUrl, setPublicFrontendBaseUrl] = useState("");
  const [phoneQrToken, setPhoneQrToken] = useState<string | null>(null);
  const [phoneQrExpiresAt, setPhoneQrExpiresAt] = useState<Date | null>(null);
  const [phoneQrDone, setPhoneQrDone] = useState(false);
  const [phoneQrLoading, setPhoneQrLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived from live run data — overrides stale flag data
  const [runValues, setRunValues] = useState<Record<string, Record<string, string>>>({});
  const [stepCaptures, setStepCaptures] = useState<StoredStepCapture[]>([]);
  const [allPhotoSteps, setAllPhotoSteps] = useState<MissingStep[]>([]);
  const [effectiveMissingSteps, setEffectiveMissingSteps] = useState<MissingStep[]>([]);

  // Editable captures keyed by a delimiter-safe composite key.
  const [editedCaptures, setEditedCaptures] = useState<Record<string, string[]>>({});
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const videoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const isNativePlatform = isMobileNativePlatform();
  const isWebBrowser = !isNativePlatform;
  const isPM = mode === "pm";

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function refreshRunState() {
    setLoading(true);
    setError(null);
    const run = await assetWorkflowRunService.getById(flag.runId);
    if (!run) {
      setError("Could not load run data.");
      setLoading(false);
      return null;
    }
    const { allSteps, missingSteps } = derivePhotoSteps(
      run.workflowSnapshotJson ?? "{}",
      run.stepResultsJson ?? "[]"
    );
    const values = parseStepValues(run.stepResultsJson ?? "[]");
    const captures = parseStepCaptures(run.stepResultsJson ?? "[]");
    const seededCaptures = allSteps.reduce<Record<string, string[]>>((acc, step) => {
      acc[buildCaptureKey(step.stepId, step.inputId)] = parseCaptures(values[step.stepId]?.[step.inputId]);
      return acc;
    }, {});
    setRunValues(values);
    setStepCaptures(captures);
    setAllPhotoSteps(allSteps);
    setEffectiveMissingSteps(missingSteps);
    setEditedCaptures(seededCaptures);
    setLoading(false);
    return { allSteps, missingSteps };
  }

  function syncMissingMediaFlags(allSteps: MissingStep[], missingSteps: MissingStep[]) {
    const allDone = missingSteps.length === 0;
    const totalExpectedCount = allSteps.length;
    const newTotalCaptured = totalExpectedCount - missingSteps.length;
    const existingFlags: MissingMediaFlag[] = JSON.parse(localStorage.getItem("pm_missing_media_flags") ?? "[]");

    if (allDone) {
      localStorage.setItem("pm_missing_media_flags", JSON.stringify(existingFlags.filter((f) => f.runId !== flag.runId)));
      window.dispatchEvent(new Event("missing-media-flags-changed"));
      onUpdated(null);
      return;
    }

    const updatedFlag: MissingMediaFlag = {
      ...flag,
      missingSteps,
      totalExpected: totalExpectedCount,
      totalCaptured: newTotalCaptured,
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: currentUserName,
    };
    const nextFlags = existingFlags.some((f) => f.runId === flag.runId)
      ? existingFlags.map((f) => (f.runId === flag.runId ? updatedFlag : f))
      : [...existingFlags, updatedFlag];
    localStorage.setItem("pm_missing_media_flags", JSON.stringify(nextFlags));
    window.dispatchEvent(new Event("missing-media-flags-changed"));
    onUpdated(updatedFlag);
  }

  async function generatePhoneQrToken() {
    setPhoneQrLoading(true);
    try {
      const res = await api.post<TokenResponse>("/mobile-upload/missing-media-token", {
        runId: flag.runId,
        workflowName: flag.workflowName,
      });
      setPhoneQrToken(res.data.token);
      setPhoneQrExpiresAt(new Date(res.data.expiresAt));
      setPhoneQrDone(false);
    } catch {
      setError("Could not generate phone upload QR code.");
    } finally {
      setPhoneQrLoading(false);
    }
  }

  // Load run on open — derive photo steps from live data
  useEffect(() => {
    if (!open) return;
    void refreshRunState();
  }, [open, flag.runId]);

  useEffect(() => {
    if (!open || isPM || !isWebBrowser) return;
    void generatePhoneQrToken();
    return stopPolling;
  }, [open, isPM, isWebBrowser, flag.runId]);

  useEffect(() => {
    if (!open || isPM || !isWebBrowser) return;
    const frontendPort = window.location.port || (window.location.protocol === "https:" ? "443" : "80");

    settingsService
      .getRuntimeFrontendBase(frontendPort)
      .then((runtime) => {
        const runtimeBase = (runtime.frontendBaseUrl || "").trim().replace(/\/+$/, "");
        if (runtimeBase) {
          setPublicFrontendBaseUrl(runtimeBase);
          return;
        }
        return settingsService.getPublicAppSettings().then((settings) => {
          setPublicFrontendBaseUrl((settings.frontendBaseUrl || "").trim().replace(/\/+$/, ""));
        });
      })
      .catch(() => {
        settingsService
          .getPublicAppSettings()
          .then((settings) => {
            setPublicFrontendBaseUrl((settings.frontendBaseUrl || "").trim().replace(/\/+$/, ""));
          })
          .catch(() => {
            setPublicFrontendBaseUrl(getFallbackPublicFrontendBaseUrl());
          });
      });
  }, [open, isPM, isWebBrowser]);

  useEffect(() => {
    if (!open || !phoneQrToken || phoneQrDone) return;
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<TokenStatus>(`/mobile-upload/token/${phoneQrToken}`);
        if (res.data.status === "complete") {
          stopPolling();
          setPhoneQrDone(true);
          const refreshed = await refreshRunState();
          if (refreshed) {
            syncMissingMediaFlags(refreshed.allSteps, refreshed.missingSteps);
          }
          return;
        }
        if (res.data.status === "expired" || res.data.status === "not_found") {
          stopPolling();
        }
      } catch {
        // Keep polling on transient errors.
      }
    }, 3000);
    return stopPolling;
  }, [open, phoneQrToken, phoneQrDone]);

  function getExistingCaptures(stepId: string, inputId: string): string[] {
    return parseCaptures(runValues[stepId]?.[inputId]);
  }

  function getCurrentCaptures(stepId: string, inputId: string): string[] {
    const key = buildCaptureKey(stepId, inputId);
    return editedCaptures[key] ?? getExistingCaptures(stepId, inputId);
  }

  async function handleFilesSelected(
    stepId: string,
    inputId: string,
    files: FileList | null,
  ) {
    if (!files || files.length === 0) return;
    const base64s = await readFilesAsBase64(files);
    const key = buildCaptureKey(stepId, inputId);
    setEditedCaptures((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), ...base64s] }));
  }

  function handleRemoveCapture(stepId: string, inputId: string, index: number) {
    const key = buildCaptureKey(stepId, inputId);
    setEditedCaptures((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const merged: Record<string, Record<string, string>> = { ...runValues };
      for (const [key, captures] of Object.entries(editedCaptures)) {
        const parsedKey = parseCaptureKey(key);
        if (!parsedKey) continue;
        const { stepId, inputId } = parsedKey;
        if (!merged[stepId]) merged[stepId] = {};
        merged[stepId][inputId] = JSON.stringify(captures);
      }

      const navEntries = stepCaptures.filter((capture) => capture.stepId === "__nav__");
      const preservedEntries = stepCaptures.filter((capture) => capture.stepId !== "__nav__");
      const updatedCaptures = Object.entries(merged).map(([stepId, values]) => {
        const existingCapture = preservedEntries.find((capture) => capture.stepId === stepId);
        return {
          stepId,
          values,
          completedAt: existingCapture?.completedAt ?? new Date().toISOString(),
          ...(existingCapture?.iterationIndex !== undefined ? { iterationIndex: existingCapture.iterationIndex } : {}),
        };
      });
      const newStepResultsJson = JSON.stringify([...updatedCaptures, ...navEntries]);
      await assetWorkflowRunService.patchStepResults(flag.runId, newStepResultsJson, currentUserName);

      // Re-derive which steps are still missing after save
      const stillMissing = effectiveMissingSteps.filter(({ stepId, inputId }) => {
        return getCurrentCaptures(stepId, inputId).length === 0;
      });
      const allDone = stillMissing.length === 0;
      const newTotalCaptured = allPhotoSteps.length - stillMissing.length;

      // PM notification
      const notification: PhotoUpdateNotification = {
        id: crypto.randomUUID(),
        runId: flag.runId,
        assetTag: flag.assetTag,
        jobNumber: flag.jobNumber,
        workflowName: flag.workflowName,
        installerName: currentUserName,
        updatedAt: new Date().toISOString(),
        stillMissing: stillMissing.length,
        wasComplete: allDone,
      };
      const existingNotifs = JSON.parse(localStorage.getItem("pm_photo_update_notifications") ?? "[]");
      localStorage.setItem("pm_photo_update_notifications", JSON.stringify([...existingNotifs, notification]));
      window.dispatchEvent(new Event("photo-update-notifications-changed"));

      // Update/remove flag
      syncMissingMediaFlags(allPhotoSteps, stillMissing);
    } catch (err) {
      console.error(err);
      setError("Failed to save photos. Please try again.");
      setSaving(false);
    }
  }

  function handleRemindInstaller() {
    const reminder = {
      id: crypto.randomUUID(),
      runId: flag.runId,
      assetTag: flag.assetTag,
      jobNumber: flag.jobNumber,
      workflowName: flag.workflowName,
      sentAt: new Date().toISOString(),
      sentByName: currentUserName,
    };
    const existing = JSON.parse(localStorage.getItem("installer_photo_reminders") ?? "[]");
    localStorage.setItem("installer_photo_reminders", JSON.stringify([...existing, reminder]));
    window.dispatchEvent(new Event("installer-photo-reminders-changed"));
    setReminderSent(true);
    setTimeout(() => setReminderSent(false), 3000);
  }

  // Live counts based on what's been added this session
  const liveMissingCount = effectiveMissingSteps.filter(({ stepId, inputId }) => {
    return getCurrentCaptures(stepId, inputId).length === 0;
  }).length;
  const liveCaptured = allPhotoSteps.length - liveMissingCount;
  const totalExpected = allPhotoSteps.length;
  const progress = totalExpected > 0 ? Math.round((liveCaptured / totalExpected) * 100) : 0;
  const frontendBaseUrl = (publicFrontendBaseUrl || getFallbackPublicFrontendBaseUrl()).replace(/\/+$/, "");
  const qrUrl = phoneQrToken ? `${frontendBaseUrl}/mobile-upload?token=${phoneQrToken}` : "";
  const installerSteps = isWebBrowser ? allPhotoSteps : effectiveMissingSteps;

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

            {/* Add from phone — web browser only */}
            {!isPM && isWebBrowser && (
              <Accordion defaultExpanded disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <SmartphoneOutlined sx={{ fontSize: 18, color: "info.main" }} />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>Add from phone</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Scan this QR code to open the same asset flow on a phone
                      </Typography>
                    </Box>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack alignItems="center" spacing={1}>
                    {phoneQrLoading && <CircularProgress size={20} />}
                    <Chip
                      icon={<QrCode2Outlined />}
                      label={phoneQrDone ? "Phone upload completed" : "Phone upload handoff"}
                      size="small"
                      color={phoneQrDone ? "success" : "info"}
                      variant="outlined"
                    />
                    {!!qrUrl && <QRCodeSVG value={qrUrl} size={180} />}
                    <Typography variant="caption" color="text.secondary">
                      {phoneQrDone
                        ? "Desktop updated automatically after the phone upload completed."
                        : "Scan on a phone to open a dedicated missing-media upload page."}
                    </Typography>
                    {phoneQrExpiresAt && !phoneQrDone && (
                      <Typography variant="caption" color="text.disabled">
                        Expires at {phoneQrExpiresAt.toLocaleTimeString()}
                      </Typography>
                    )}
                    {!phoneQrDone && (
                      <Button size="small" variant="text" onClick={() => void generatePhoneQrToken()} disabled={phoneQrLoading}>
                        Regenerate QR
                      </Button>
                    )}
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
            {!isPM && installerSteps.map(({ stepId, stepOrder, stepTitle, stepDescription, inputId, inputLabel, inputType }) => {
              const key = buildCaptureKey(stepId, inputId);
              const currentCount = getCurrentCaptures(stepId, inputId).length;
              const isMissing = currentCount === 0;
              const isVideo = inputType === "video";
              const mediaLabel = isVideo ? "video" : "photo";
              return (
                <Card key={key} variant="outlined" sx={{ borderColor: isMissing ? "warning.main" : "success.main" }}>
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
                        <Typography variant="caption" fontWeight={600} color={isMissing ? "warning.main" : "success.main"}>
                          {inputLabel}
                        </Typography>
                        <Box mt={0.25}>
                          {isMissing ? (
                            <Chip label={`No ${mediaLabel}s yet`} size="small" color="warning" variant="outlined" />
                          ) : (
                            <Chip
                              icon={<CheckCircleOutlined />}
                              label={`${currentCount} ${mediaLabel}${currentCount !== 1 ? "s" : ""} added`}
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <input
                          type="file"
                          accept={acceptForInputType("photo")}
                          multiple
                          capture="environment"
                          style={{ display: "none" }}
                          ref={(el) => { photoInputRefs.current[key] = el; }}
                          onChange={(e) => handleFilesSelected(stepId, inputId, e.target.files)}
                        />
                        {isWebBrowser && (
                          <input
                            type="file"
                            accept={acceptForInputType("video")}
                            multiple
                            capture="environment"
                            style={{ display: "none" }}
                            ref={(el) => { videoInputRefs.current[key] = el; }}
                            onChange={(e) => handleFilesSelected(stepId, inputId, e.target.files)}
                          />
                        )}
                        {!isVideo && (
                          <Button
                            variant="contained"
                            size="small"
                            color={isMissing ? "warning" : "success"}
                            startIcon={<PhotoCameraOutlined sx={{ fontSize: 16 }} />}
                            onClick={() => photoInputRefs.current[key]?.click()}
                          >
                            {currentCount > 0 ? "Add photo" : "Add photo"}
                          </Button>
                        )}
                        {(isVideo || isWebBrowser) && (
                          <Button
                            variant="outlined"
                            size="small"
                            color={isMissing ? "warning" : "success"}
                            startIcon={<VideocamOutlined sx={{ fontSize: 16 }} />}
                            onClick={() => videoInputRefs.current[key]?.click()}
                          >
                            {currentCount > 0 ? "Add video" : (isVideo ? "Add video" : "Capture video")}
                          </Button>
                        )}
                      </Stack>
                    </Stack>

                    {currentCount > 0 && isWebBrowser && (
                      <Stack spacing={1} mt={1.25}>
                        {getCurrentCaptures(stepId, inputId).map((capture, captureIndex) => {
                          const looksLikeVideo = capture.startsWith("data:video/");
                          return (
                            <Card key={`${key}-capture-${captureIndex}`} variant="outlined" sx={{ borderColor: "divider", bgcolor: "background.default" }}>
                              <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                  <Box sx={{ width: 92, height: 68, borderRadius: 1, overflow: "hidden", bgcolor: "common.black", flexShrink: 0 }}>
                                    {looksLikeVideo ? (
                                      <video src={capture} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    ) : (
                                      <img src={capture} alt={`${inputLabel} ${captureIndex + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    )}
                                  </Box>
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" fontWeight={600}>
                                      {looksLikeVideo ? `Video ${captureIndex + 1}` : `Photo ${captureIndex + 1}`}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Remove this item if the user wants to replace it, then add a new one.
                                    </Typography>
                                  </Box>
                                  <Button
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    startIcon={<DeleteOutline />}
                                    onClick={() => handleRemoveCapture(stepId, inputId, captureIndex)}
                                  >
                                    Delete
                                  </Button>
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </Stack>
                    )}
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
            {reminderSent ? "Reminder Sent ✓" : "Notify Field User"}
          </Button>
        )}
        {!isPM && (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || loading}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {saving ? "Saving…" : "Save Photos"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
