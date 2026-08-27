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
import { mediaStore } from "../../services/mediaStore";
import { getFallbackPublicFrontendBaseUrl, resolvePublicFrontendBaseUrl } from "../../services/publicFrontendBase";
import { randomId } from "../../utils/randomId";
import api from "../../services/api";
import { isMobileNativePlatform } from "../../utils/platform";
import { nativeDialogActionsSx, nativeDialogPaperSx, nativeDialogSx } from "../../utils/nativeDialogInsets";
import { formatPayloadSize, measurePayload } from "../../utils/syncDiagnostics";
import { fileToDataUrl, prepareWorkflowMediaFile } from "../../utils/mediaProcessing";
import { API_LARGE_PAYLOAD_WARNING_BYTES } from "../../utils/syncPolicy";
import type { MissingMediaFlag, MissingStep, PhotoUpdateNotification } from "./photoUploadTypes";

export type { MissingMediaFlag, MissingStep, PhotoUpdateNotification } from "./photoUploadTypes";

type StoredStepCapture = {
  stepId: string;
  values: Record<string, string>;
  completedAt: string;
  iterationIndex?: number;
};

type PersistedRunPhotoState = {
  allSteps: MissingStep[];
  missingSteps: MissingStep[];
  values: Record<string, Record<string, string>>;
  captures: StoredStepCapture[];
  seededCaptures: Record<string, string[]>;
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

// -- Props -------------------------------------------------------------------

interface PhotoUploadDialogProps {
  open: boolean;
  flag: MissingMediaFlag;
  currentUserName: string;
  /** "installer" shows upload UI; "pm" shows step preview + remind button */
  mode?: "installer" | "pm";
  onClose: () => void;
  onUpdated: (updatedFlag: MissingMediaFlag | null) => void;
}

// -- Helpers -----------------------------------------------------------------

function acceptForInputType(inputType: "photo" | "video"): string {
  return inputType === "video" ? "video/*" : "image/*";
}

function parseCaptures(raw: string | undefined): string[] {
  try {
    const arr = JSON.parse(raw ?? "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function CaptureThumbnail({ capture, kind, alt }: { capture: string; kind: "photo" | "video"; alt: string }) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(
    mediaStore.isStoredMediaValue(capture) ? null : capture,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!mediaStore.isStoredMediaValue(capture)) {
      setResolvedSrc(capture);
      setFailed(false);
      return;
    }
    setResolvedSrc(null);
    setFailed(false);
    mediaStore.resolveMediaValue(capture)
      .then((resolved) => { if (!cancelled) setResolvedSrc(resolved); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [capture]);

  if (failed) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ width: "100%", height: "100%" }}>
        <WarningAmberOutlined sx={{ fontSize: 20, color: "common.white" }} />
      </Stack>
    );
  }

  if (!resolvedSrc) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ width: "100%", height: "100%" }}>
        <CircularProgress size={18} sx={{ color: "common.white" }} />
      </Stack>
    );
  }

  return kind === "video" ? (
    <video src={resolvedSrc} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <img
      src={resolvedSrc}
      alt={alt}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => setFailed(true)}
    />
  );
}

function parseSnapshotSteps(workflowSnapshotJson: string): Array<{
  id: string;
  order?: number;
  title?: string;
  description?: string;
  inputs?: { id: string; label?: string; type?: string; required?: boolean }[];
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
        if ((inp.type === "photo" || inp.type === "video") && inp.required) {
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

function derivePersistedRunPhotoState(
  workflowSnapshotJson: string,
  stepResultsJson: string,
): PersistedRunPhotoState {
  const { allSteps, missingSteps } = derivePhotoSteps(workflowSnapshotJson, stepResultsJson);
  const values = parseStepValues(stepResultsJson);
  const captures = parseStepCaptures(stepResultsJson);
  const seededCaptures = allSteps.reduce<Record<string, string[]>>((acc, step) => {
    acc[buildCaptureKey(step.stepId, step.inputId)] = parseCaptures(values[step.stepId]?.[step.inputId]);
    return acc;
  }, {});

  return {
    allSteps,
    missingSteps,
    values,
    captures,
    seededCaptures,
  };
}

// -- Component ---------------------------------------------------------------

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
  const [offlineQueued, setOfflineQueued] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const [publicFrontendBaseUrl, setPublicFrontendBaseUrl] = useState("");
  const [phoneQrToken, setPhoneQrToken] = useState<string | null>(null);
  const [phoneQrExpiresAt, setPhoneQrExpiresAt] = useState<Date | null>(null);
  const [phoneQrDone, setPhoneQrDone] = useState(false);
  const [phoneQrLoading, setPhoneQrLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived from live run data - overrides stale flag data
  const [runValues, setRunValues] = useState<Record<string, Record<string, string>>>({});
  const [stepCaptures, setStepCaptures] = useState<StoredStepCapture[]>([]);
  const [allPhotoSteps, setAllPhotoSteps] = useState<MissingStep[]>([]);
  const [effectiveMissingSteps, setEffectiveMissingSteps] = useState<MissingStep[]>([]);

  // Editable captures keyed by a delimiter-safe composite key.
  const [editedCaptures, setEditedCaptures] = useState<Record<string, string[]>>({});
  const [stagedFiles, setStagedFiles] = useState<Record<string, File[]>>({});
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

  function applyRunState(state: PersistedRunPhotoState) {
    setRunValues(state.values);
    setStepCaptures(state.captures);
    setAllPhotoSteps(state.allSteps);
    setEffectiveMissingSteps(state.missingSteps);
    setEditedCaptures(state.seededCaptures);
    setStagedFiles({});
  }

  async function refreshRunState(options?: { showSpinner?: boolean }) {
    const showSpinner = options?.showSpinner ?? true;
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const run = await assetWorkflowRunService.getById(flag.runId);
      if (!run) {
        setError("Could not load run data.");
        return null;
      }

      const nextState = derivePersistedRunPhotoState(
        run.workflowSnapshotJson ?? "{}",
        run.stepResultsJson ?? "[]",
      );
      applyRunState(nextState);
      return nextState;
    } finally {
      if (showSpinner) setLoading(false);
    }
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

  // Load run on open - derive photo steps from live data
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
    void resolvePublicFrontendBaseUrl()
      .then((base) => setPublicFrontendBaseUrl(base))
      .catch(() => setPublicFrontendBaseUrl(getFallbackPublicFrontendBaseUrl()));
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

  function buildPatchedStepResultsJson(): string {
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

    return JSON.stringify([...updatedCaptures, ...navEntries]);
  }

  function analyzeCaptureChanges(): {
    appendOnly: boolean;
    uploads: Array<{ stepId: string; inputId: string; file: File }>;
  } {
    const uploads: Array<{ stepId: string; inputId: string; file: File }> = [];

    for (const step of allPhotoSteps) {
      const key = buildCaptureKey(step.stepId, step.inputId);
      const existing = getExistingCaptures(step.stepId, step.inputId);
      const current = editedCaptures[key] ?? existing;

      if (current.length < existing.length) {
        return { appendOnly: false, uploads: [] };
      }

      for (let index = 0; index < existing.length; index += 1) {
        if (existing[index] !== current[index]) {
          return { appendOnly: false, uploads: [] };
        }
      }

      const appendedCount = current.length - existing.length;
      if (appendedCount === 0) continue;

      const files = stagedFiles[key] ?? [];
      if (files.length > 0 && files.length === appendedCount) {
        for (const file of files) {
          uploads.push({ stepId: step.stepId, inputId: step.inputId, file });
        }
        continue;
      }

      if (appendedCount > 0 && files.length !== appendedCount) {
        return { appendOnly: false, uploads: [] };
      }
    }

    return { appendOnly: true, uploads };
  }

  async function handleFilesSelected(
    stepId: string,
    inputId: string,
    files: FileList | null,
  ) {
    if (!files || files.length === 0) return;
    const key = buildCaptureKey(stepId, inputId);
    const preparedFiles: File[] = [];
    const dataUrls: string[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const prepared = await prepareWorkflowMediaFile(file);
        preparedFiles.push(prepared);
        dataUrls.push(await fileToDataUrl(prepared));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Could not add media.");
      }
    }
    if (dataUrls.length > 0) {
      setEditedCaptures((prev) => {
        const current = prev[key] ?? getExistingCaptures(stepId, inputId);
        return { ...prev, [key]: [...current, ...dataUrls] };
      });
      setStagedFiles((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), ...preparedFiles] }));
    }
    if (errors.length > 0) {
      setError(errors[0]);
    }
  }

  function handleRemoveCapture(stepId: string, inputId: string, index: number) {
    const key = buildCaptureKey(stepId, inputId);
    const existingCount = getExistingCaptures(stepId, inputId).length;
    setEditedCaptures((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
    if (index >= existingCount) {
      const stagedIndex = index - existingCount;
      setStagedFiles((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).filter((_, itemIndex) => itemIndex !== stagedIndex),
      }));
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setOfflineQueued(false);
    try {
      const newStepResultsJson = buildPatchedStepResultsJson();
      const uploadPlan = analyzeCaptureChanges();
      let savedRun;
      if (uploadPlan.appendOnly && uploadPlan.uploads.length > 0) {
        try {
          savedRun = await assetWorkflowRunService.uploadStepMedia(flag.runId, uploadPlan.uploads, currentUserName);
        } catch {
          savedRun = await assetWorkflowRunService.patchStepResults(flag.runId, newStepResultsJson, currentUserName);
        }
      } else {
        savedRun = await assetWorkflowRunService.patchStepResults(flag.runId, newStepResultsJson, currentUserName);
      }

      const queuedOffline = isMobileNativePlatform()
        && (savedRun as { localStatus?: string }).localStatus === "PendingSync";
      if (queuedOffline) {
        setOfflineQueued(true);
      }

      const verifiedState = await refreshRunState({ showSpinner: false });
      if (!verifiedState) {
        if (queuedOffline) {
          onUpdated(null);
          return;
        }
        setError("Photos may have been saved, but the run could not be reloaded to verify them. Reopen the asset and check again.");
        return;
      }

      const allDone = verifiedState.missingSteps.length === 0;

      // PM notification
      const notification: PhotoUpdateNotification = {
        id: randomId(),
        runId: flag.runId,
        assetTag: flag.assetTag,
        jobNumber: flag.jobNumber,
        workflowName: flag.workflowName,
        installerName: currentUserName,
        updatedAt: new Date().toISOString(),
        stillMissing: verifiedState.missingSteps.length,
        wasComplete: allDone,
      };
      const existingNotifs = JSON.parse(localStorage.getItem("pm_photo_update_notifications") ?? "[]");
      localStorage.setItem("pm_photo_update_notifications", JSON.stringify([...existingNotifs, notification]));
      window.dispatchEvent(new Event("photo-update-notifications-changed"));

      // Update/remove flag using the persisted run state, not optimistic local edits.
      syncMissingMediaFlags(verifiedState.allSteps, verifiedState.missingSteps);
    } catch (err) {
      console.error(err);
      setError("Failed to save photos. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleRemindInstaller() {
    const reminder = {
      id: randomId(),
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
  const pendingStepResultsJson = buildPatchedStepResultsJson();
  const uploadPlan = analyzeCaptureChanges();
  const pendingPayloadEstimate = measurePayload({
    stepResultsJson: pendingStepResultsJson,
    amendedByName: currentUserName ?? null,
    amendedAt: new Date().toISOString(),
  });
  const showLargePayloadWarning =
    !uploadPlan.appendOnly &&
    pendingPayloadEstimate.payloadBytes > API_LARGE_PAYLOAD_WARNING_BYTES;
  const frontendBaseUrl = (publicFrontendBaseUrl || getFallbackPublicFrontendBaseUrl()).replace(/\/+$/, "");
  const qrUrl = phoneQrToken ? `${frontendBaseUrl}/mobile-upload?token=${phoneQrToken}` : "";
  const installerSteps = allPhotoSteps;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      sx={nativeDialogSx()}
      PaperProps={{
        sx: nativeDialogPaperSx(),
      }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PhotoCameraOutlined sx={{ color: "warning.main" }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              {flag.assetTag} - {flag.workflowName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {loading ? "Loading..." : `${liveCaptured} of ${totalExpected} photo steps completed`}
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
            {offlineQueued && (
              <Alert severity="info">
                Saved offline — photos are queued and will sync when you reconnect.
              </Alert>
            )}

            {uploadPlan.appendOnly && uploadPlan.uploads.length > 0 && (
              <Alert severity="info">
                New photos will upload directly as files instead of resending the full workflow payload.
              </Alert>
            )}

            {showLargePayloadWarning && (
              <Alert severity="warning">
                This change would resend about {formatPayloadSize(pendingPayloadEstimate.payloadBytes)} of workflow data. Direct file upload is only available for newly appended captures.
              </Alert>
            )}

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

            {/* Add from phone - web browser only */}
            {!isPM && isWebBrowser && (
              <Accordion disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
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
                    {!!qrUrl && <QRCodeSVG value={qrUrl} size={120} />}
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
                    RUN PHOTO STATUS - {flag.technicianName} | {new Date(flag.completedAt).toLocaleDateString()}
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
                          style={{ display: "none" }}
                          ref={(el) => { photoInputRefs.current[key] = el; }}
                          onChange={(e) => {
                            void handleFilesSelected(stepId, inputId, e.target.files);
                            e.target.value = "";
                          }}
                        />
                        <input
                          type="file"
                          accept={acceptForInputType("video")}
                          multiple
                          style={{ display: "none" }}
                          ref={(el) => { videoInputRefs.current[key] = el; }}
                          onChange={(e) => {
                            void handleFilesSelected(stepId, inputId, e.target.files);
                            e.target.value = "";
                          }}
                        />
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
                        {isVideo && (
                          <Button
                            variant="outlined"
                            size="small"
                            color={isMissing ? "warning" : "success"}
                            startIcon={<VideocamOutlined sx={{ fontSize: 16 }} />}
                            onClick={() => videoInputRefs.current[key]?.click()}
                          >
                            {currentCount > 0 ? "Add video" : "Add video"}
                          </Button>
                        )}
                      </Stack>
                    </Stack>

                    {currentCount > 0 && (
                      <Stack spacing={1} mt={1.25}>
                        {getCurrentCaptures(stepId, inputId).map((capture, captureIndex) => {
                          const kind = mediaStore.getMediaKind(capture) === "video" ? "video" : "photo";
                          return (
                            <Card key={`${key}-capture-${captureIndex}`} variant="outlined" sx={{ borderColor: "divider", bgcolor: "background.default" }}>
                              <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                                <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                                  <Box sx={{ width: 92, height: 68, borderRadius: 1, overflow: "hidden", bgcolor: "common.black", flexShrink: 0 }}>
                                    <CaptureThumbnail capture={capture} kind={kind} alt={`${inputLabel} ${captureIndex + 1}`} />
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
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                                  {kind === "video" ? `Video ${captureIndex + 1}` : `Photo ${captureIndex + 1}`} — remove to replace, then add a new one.
                                </Typography>
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
                All photo steps completed - nothing to upload.
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

      <DialogActions sx={nativeDialogActionsSx({ px: 3, py: 2, gap: 1 })}>
        <Button onClick={onClose} color="inherit" disabled={saving}>Close</Button>
        {isPM && (
          <Button
            variant={reminderSent ? "text" : "outlined"}
            color={reminderSent ? "success" : "warning"}
            onClick={handleRemindInstaller}
            disabled={reminderSent || effectiveMissingSteps.length === 0}
          >
            {reminderSent ? "Reminder Sent *" : "Notify Field User"}
          </Button>
        )}
        {!isPM && (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || loading}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {saving ? "Saving..." : "Save Photos"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
