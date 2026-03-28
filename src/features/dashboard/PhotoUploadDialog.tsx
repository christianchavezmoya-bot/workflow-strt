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
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import {
  CheckCircleOutlined,
  ExpandMoreOutlined,
  PhotoCameraOutlined,
} from "@mui/icons-material";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";

// ── Types ──────────────────────────────────────────────────────────────────────

export type MissingStep = {
  stepId: string;
  stepTitle: string;
  inputId: string;
  inputLabel: string;
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

// ── Component ──────────────────────────────────────────────────────────────────

export default function PhotoUploadDialog({
  open,
  flag: rawFlag,
  currentUserName,
  onClose,
  onUpdated,
}: PhotoUploadDialogProps) {
  // Normalize for backward-compat: old flags written before missingSteps field existed
  const flag: MissingMediaFlag = {
    ...rawFlag,
    missingSteps: rawFlag.missingSteps ?? [],
    totalExpected: rawFlag.totalExpected ?? 0,
    totalCaptured: rawFlag.totalCaptured ?? 0,
  };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // stepResultsJson loaded from the run on open — keyed as { [stepId]: { [inputId]: string (JSON array) } }
  const [runValues, setRunValues] = useState<Record<string, Record<string, string>>>({});

  // Files the user selects in this session — keyed by `${stepId}-${inputId}`
  const [localCaptures, setLocalCaptures] = useState<Record<string, string[]>>({});

  // Refs for hidden <input type="file"> elements, one per missing step input
  const fileInputRefs = useRef<Record<string, React.RefObject<HTMLInputElement>>>({});

  // Build refs map whenever flag.missingSteps changes
  useEffect(() => {
    const refs: Record<string, React.RefObject<HTMLInputElement>> = {};
    flag.missingSteps.forEach(({ stepId, inputId }) => {
      const key = `${stepId}-${inputId}`;
      refs[key] = { current: null };
    });
    fileInputRefs.current = refs;
    setLocalCaptures({});
  }, [flag.missingSteps]);

  // Load run on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    assetWorkflowRunService.getById(flag.runId).then((run) => {
      if (!run) { setError("Could not load run data."); setLoading(false); return; }
      try {
        const parsed: Record<string, Record<string, string>> = JSON.parse(run.stepResultsJson ?? "{}");
        setRunValues(parsed);
      } catch {
        setRunValues({});
      }
      setLoading(false);
    });
  }, [open, flag.runId]);

  function getExistingCaptures(stepId: string, inputId: string): string[] {
    try {
      const arr = JSON.parse(runValues[stepId]?.[inputId] ?? "[]");
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function getCurrentCaptures(stepId: string, inputId: string): string[] {
    const key = `${stepId}-${inputId}`;
    const existing = getExistingCaptures(stepId, inputId);
    const local = localCaptures[key] ?? [];
    return [...existing, ...local];
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
      // Merge localCaptures into the existing runValues
      const merged: Record<string, Record<string, string>> = { ...runValues };
      for (const [key, newFiles] of Object.entries(localCaptures)) {
        const [stepId, inputId] = key.split(/-(.+)/); // split on first dash
        const existing = getExistingCaptures(stepId, inputId);
        const combined = [...existing, ...newFiles];
        if (!merged[stepId]) merged[stepId] = {};
        merged[stepId][inputId] = JSON.stringify(combined);
      }

      const newStepResultsJson = JSON.stringify(merged);
      await assetWorkflowRunService.patchStepResults(flag.runId, newStepResultsJson, currentUserName);

      // Re-evaluate which steps are still missing
      const stillMissingSteps = flag.missingSteps.filter(({ stepId, inputId }) => {
        const key = `${stepId}-${inputId}`;
        const existing = getExistingCaptures(stepId, inputId);
        const local = localCaptures[key] ?? [];
        return existing.length + local.length === 0;
      });

      const newTotalCaptured = flag.totalExpected - stillMissingSteps.length;
      const allDone = stillMissingSteps.length === 0;

      // Build notification for PM
      const notification: PhotoUpdateNotification = {
        id: crypto.randomUUID(),
        runId: flag.runId,
        assetTag: flag.assetTag,
        jobNumber: flag.jobNumber,
        workflowName: flag.workflowName,
        installerName: currentUserName,
        updatedAt: new Date().toISOString(),
        stillMissing: stillMissingSteps.length,
        wasComplete: allDone,
      };
      const existingNotifs = JSON.parse(localStorage.getItem("pm_photo_update_notifications") ?? "[]");
      localStorage.setItem("pm_photo_update_notifications", JSON.stringify([...existingNotifs, notification]));
      window.dispatchEvent(new Event("photo-update-notifications-changed"));

      // Update or remove flag in localStorage
      const existingFlags: MissingMediaFlag[] = JSON.parse(localStorage.getItem("pm_missing_media_flags") ?? "[]");
      if (allDone) {
        const updated = existingFlags.filter((f) => f.runId !== flag.runId);
        localStorage.setItem("pm_missing_media_flags", JSON.stringify(updated));
        window.dispatchEvent(new Event("missing-media-flags-changed"));
        onUpdated(null);
      } else {
        const updatedFlag: MissingMediaFlag = {
          ...flag,
          missingSteps: stillMissingSteps,
          totalCaptured: newTotalCaptured,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: currentUserName,
        };
        const updated = existingFlags.map((f) => (f.runId === flag.runId ? updatedFlag : f));
        localStorage.setItem("pm_missing_media_flags", JSON.stringify(updated));
        window.dispatchEvent(new Event("missing-media-flags-changed"));
        onUpdated(updatedFlag);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save photos. Please try again.");
      setSaving(false);
    }
  }

  const totalCapturedNow = flag.totalExpected - flag.missingSteps.filter(({ stepId, inputId }) => {
    const key = `${stepId}-${inputId}`;
    return (localCaptures[key]?.length ?? 0) === 0 && getExistingCaptures(stepId, inputId).length === 0;
  }).length;

  const progress = flag.totalExpected > 0 ? Math.round((totalCapturedNow / flag.totalExpected) * 100) : 0;
  const qrUrl = window.location.origin + window.location.pathname;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PhotoCameraOutlined sx={{ color: "warning.main" }} />
          <Box>
            <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              {flag.assetTag} — {flag.workflowName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {flag.totalCaptured} of {flag.totalExpected} photo steps completed
            </Typography>
          </Box>
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

            {/* Progress bar */}
            <Box>
              <Stack direction="row" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">Photo progress</Typography>
                <Typography variant="caption" fontWeight={600}>{totalCapturedNow}/{flag.totalExpected}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 1, height: 6 }} />
            </Box>

            {/* QR code — collapsed by default */}
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

            {/* Missing steps */}
            {flag.missingSteps.map(({ stepId, stepTitle, inputId, inputLabel }) => {
              const key = `${stepId}-${inputId}`;
              const currentCount = getCurrentCaptures(stepId, inputId).length;
              const isDone = currentCount > 0;

              // Ensure ref exists
              if (!fileInputRefs.current[key]) {
                fileInputRefs.current[key] = { current: null };
              }

              return (
                <Card key={key} variant="outlined" sx={{ borderColor: isDone ? "success.main" : "warning.main" }}>
                  <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                    <Stack direction="row" alignItems="flex-start" spacing={1}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{stepTitle}</Typography>
                        <Typography variant="caption" color="text.secondary">{inputLabel}</Typography>
                        <Box mt={0.5}>
                          {isDone ? (
                            <Chip
                              icon={<CheckCircleOutlined />}
                              label={`${currentCount} photo${currentCount !== 1 ? "s" : ""} captured`}
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          ) : (
                            <Chip label="No photos yet" size="small" color="warning" variant="outlined" />
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
                          ref={(el) => {
                            fileInputRefs.current[key] = { current: el };
                          }}
                          onChange={(e) => handleFilesSelected(stepId, inputId, e.target.files)}
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => fileInputRefs.current[key]?.current?.click()}
                        >
                          Add Photos
                        </Button>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}

            {flag.missingSteps.length === 0 && (
              <Alert severity="success" icon={<CheckCircleOutlined />}>
                All photo steps completed!
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || loading || Object.keys(localCaptures).length === 0}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? "Saving…" : "Save Photos"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
