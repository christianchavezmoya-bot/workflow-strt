/**
 * ExternalSignPage — public (no auth required) customer review & sign page.
 * Route: /sign/:tokenId
 *
 * Flow:
 *   1. Load summary via GET /api/public/sign/{tokenId}
 *   2. "review" stage — inline PDF preview of the full installation record
 *   3. "sign" stage — customer fills in name, draws/types signature, ticks consent
 *   4. POST /api/public/sign/{tokenId}/submit
 *   5. "done" stage — confirmation screen
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowForwardOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  GestureOutlined,
  KeyboardOutlined,
  LockOutlined,
} from "@mui/icons-material";
import api from "../../services/api";
import type { PublicRunSummary } from "../../types/signature";
import { generateWorkflowReport } from "../../utils/generateWorkflowReport";
import { buildPublicSignReportContext } from "../../utils/buildPublicSignReportContext";
import PdfBlobPreview from "../../components/reports/PdfBlobPreview";
import { formatInstant, resolveReportTimeZone } from "../../utils/datetime";

const PAGE = {
  bg: "#0b1d24",
  panel: "#0f1c22",
  text: "#e4edf2",
  textMuted: "rgba(228,237,242,0.72)",
  border: "rgba(255,255,255,0.12)",
  accent: "#2dd4bf",
  otpWaiting: "#e0a930",
};

// ─── Signature canvas ──────────────────────────────────────────────────────────

function SignaturePad({
  onCapture,
  onClear,
}: {
  onCapture: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#1a2744";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const end = () => {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onCapture(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.fillStyle = "#f9f9f9";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    onClear();
  };

  return (
    <Box>
      <canvas
        ref={canvasRef}
        width={480}
        height={130}
        style={{
          border: "2px solid #ccc",
          borderRadius: 4,
          background: "#f9f9f9",
          touchAction: "none",
          cursor: "crosshair",
          display: "block",
          width: "100%",
        }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <Button size="small" onClick={clear} sx={{ mt: 0.5, color: PAGE.text }}>
        Clear
      </Button>
    </Box>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type InputMode = "typed" | "drawn";
type Stage = "loading" | "error" | "review" | "sign" | "done";

export default function ExternalSignPage() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const [stage, setStage] = useState<Stage>("loading");
  const [summary, setSummary] = useState<PublicRunSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [inputMode, setInputMode] = useState<InputMode>("typed");
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [reasonCode, setReasonCode] = useState("Completed");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [drawnData, setDrawnData] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  /** True once a code has actually been (re)sent in this browser session — distinct from
   *  `needsOtp`, which reflects whether this link requires OTP at all (server truth). */
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpFieldError, setOtpFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const loadPreview = useCallback(async (data: PublicRunSummary) => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const reportContext = await buildPublicSignReportContext(data);
      const pdfBlob = await generateWorkflowReport({
        ...reportContext,
        includeAllSteps: true,
        outputMode: "blob",
      });
      if (!(pdfBlob instanceof Blob)) {
        throw new Error("Failed to build PDF preview.");
      }
      setPreviewBlob(pdfBlob);
    } catch {
      setPreviewError("Could not load the report preview. You can still download the PDF below.");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tokenId) return;
    api.get<PublicRunSummary>(`/public/sign/${tokenId}`)
      .then((r) => {
        setSummary(r.data);
        setSignerName(r.data.recipientName ?? "");
        // Server truth, known from the very first render — not something the customer's own
        // frontend state can decide. Previously this always started false and only became
        // true after the customer voluntarily clicked a "require OTP" toggle themselves,
        // which meant the acknowledgement/Submit step was available immediately regardless
        // of whether OTP was actually required for this link.
        setNeedsOtp(Boolean(r.data.otpRequired));
        setStage("review");
        void loadPreview(r.data);
      })
      .catch((err) => {
        const msg = err?.response?.data?.message ?? "This link is invalid or has expired.";
        setLoadError(msg);
        setStage("error");
      });
  }, [tokenId, loadPreview]);

  const handleDownloadReport = async () => {
    if (!summary) return;
    setDownloadingReport(true);
    try {
      const reportContext = await buildPublicSignReportContext(summary);
      await generateWorkflowReport({
        ...reportContext,
        includeAllSteps: true,
      });
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleRequestOtp = async () => {
    try {
      await api.post(`/public/sign/${tokenId}/request-otp`);
      setNeedsOtp(true);
      setOtpRequested(true);
      setOtpVerified(false);
      setOtpFieldError(null);
      // A tick from before OTP was required must not silently carry through: the
      // acknowledgement step is about to be hidden, and re-revealing it after verification
      // must present as a fresh, unacknowledged control — not one already checked.
      setConsent(false);
    } catch {
      setSubmitError("Failed to send OTP code. Please try again.");
    }
  };

  // Pre-check only, against the same backend validation Submit itself performs — this
  // never persists anything or consumes the token. It exists purely to drive the UI
  // sequencing (reveal the acknowledgement step only once the code is genuinely correct);
  // Submit remains the sole authoritative, state-changing OTP check regardless of this.
  const handleVerifyOtp = async () => {
    setOtpFieldError(null);
    setVerifyingOtp(true);
    try {
      await api.post(`/public/sign/${tokenId}/verify-otp`, { otpCode: otpCode.trim() });
      setOtpVerified(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setOtpVerified(false);
      setOtpFieldError(msg ?? "Could not verify code. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await api.post(`/public/sign/${tokenId}/submit`, {
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim() || undefined,
        signatureData: inputMode === "drawn" ? (drawnData ?? undefined) : undefined,
        reasonCode,
        notes: notes.trim() || undefined,
        consentConfirmed: consent,
        otpCode: otpCode.trim() || undefined,
      });
      setStage("done");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg?.toLowerCase().includes("otp")) {
        // Defense in depth: if Submit disagrees with the client's belief about OTP state
        // (e.g. a code expired between verify-otp and submit), fall back to the OTP-entry
        // stage — never the "Request OTP" stage, since a code plainly already exists.
        setNeedsOtp(true);
        setOtpRequested(true);
        setOtpVerified(false);
        setOtpFieldError(msg);
        setConsent(false);
      }
      setSubmitError(msg ?? "Failed to submit signature. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // `needsOtp` is server truth (from GetSummary), known before the customer touches anything —
  // so for a link that actually requires OTP, this is false from the very first render, and
  // the acknowledgement/submit step stays gated until a code has actually been verified.
  // Ticking the acknowledgement box can never substitute for OTP verification. For a link
  // that never had an OTP issued, `needsOtp` is false and this is the pre-existing,
  // legitimate OTP-disabled path with no gate at all.
  const otpSatisfied = !needsOtp || otpVerified;

  const canSubmit =
    otpSatisfied &&
    signerName.trim().length > 0 &&
    consent &&
    (reasonCode !== "Declined" || notes.trim().length > 0) &&
    (inputMode === "typed" || drawnData !== null);

  const assetTagLabel = summary?.assetTag ?? summary?.assetName ?? "Asset";
  const isInstallerSigner = summary?.signerRole === "Installer";
  const reportTimeZone = resolveReportTimeZone({
    timeZoneId: summary?.timeZoneId,
    office: summary?.office,
    region: summary?.region,
    officeCountry: summary?.officeCountry,
    officeState: summary?.officeState,
  });
  const completedLabel = summary?.completedAt
    ? formatInstant(summary.completedAt, reportTimeZone, { withZone: true })
    : null;

  if (stage === "loading") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", bgcolor: PAGE.bg }}>
        <CircularProgress sx={{ color: "#9df0e5" }} />
      </Box>
    );
  }

  if (stage === "error") {
    return (
      <Box sx={{ maxWidth: 480, mx: "auto", mt: 8, p: 3 }}>
        <Alert severity="error">{loadError}</Alert>
      </Box>
    );
  }

  if (stage === "done") {
    return (
      <Box sx={{ maxWidth: 500, mx: "auto", mt: 10, p: 3, textAlign: "center", bgcolor: PAGE.bg, minHeight: "100vh", color: "#fff" }}>
        <CheckCircleOutlined sx={{ fontSize: 72, color: "#4caf50", mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {reasonCode === "Declined" ? "Document Declined" : "Signature Recorded"}
        </Typography>
        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.75)", maxWidth: 360, mx: "auto" }}>
          {reasonCode === "Declined"
            ? "Your decline has been recorded and the team has been notified."
            : isInstallerSigner
              ? "Thank you. Your installer sign-off has been recorded and the workflow is now ready for customer sign-off."
              : "Thank you. Your signature has been recorded and the installation certificate is now complete."}
        </Typography>
      </Box>
    );
  }

  const SummaryMeta = () => summary ? (
    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} alignItems="center">
      <Typography variant="body2" sx={{ color: PAGE.textMuted }}>
        {summary.workflowName}
      </Typography>
      <Typography variant="body2" sx={{ color: PAGE.textMuted }}>
        · Project {summary.projectJobNumber} — {summary.customerName}
      </Typography>
      {summary.completedByName && (
        <Typography variant="body2" sx={{ color: PAGE.textMuted }}>
          · Completed by {summary.completedByName}
        </Typography>
      )}
      {completedLabel && (
        <Typography variant="body2" sx={{ color: PAGE.textMuted }}>
          · {completedLabel}
        </Typography>
      )}
      {summary.installerSignerName && (
        <Chip
          size="small"
          color="success"
          label={`Installer signed: ${summary.installerSignerName}`}
        />
      )}
    </Stack>
  ) : null;

  // ─── Stage: review — full-window PDF preview ───────────────────────────────
  if (stage === "review") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: PAGE.bg, color: "#fff" }}>
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {isInstallerSigner ? "Workflow Review" : "Installation Record"} — {assetTagLabel}
          </Typography>
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.78)", mb: 1 }}>
            {isInstallerSigner
              ? "Review the completed workflow below, including photos and captured data, before signing as installer."
              : "Review the full installation record below, including photos and installer signature, before signing."}
          </Typography>
          <Box sx={{ bgcolor: PAGE.panel, borderRadius: 1, px: 1.5, py: 1 }}>
            <SummaryMeta />
          </Box>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, bgcolor: "#525659" }}>
          {previewLoading ? (
            <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: "100%", color: "#fff" }}>
              <CircularProgress color="inherit" />
              <Typography variant="body2">Loading report preview…</Typography>
            </Stack>
          ) : previewError ? (
            <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: "100%", p: 3 }}>
              <Alert severity="warning" sx={{ maxWidth: 480 }}>{previewError}</Alert>
            </Stack>
          ) : previewBlob ? (
            <PdfBlobPreview
              blob={previewBlob}
              scrollHint="Scroll down to review all pages before signing"
            />
          ) : null}
        </Box>

        <Box
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2,
            borderTop: "1px solid rgba(255,255,255,0.12)",
            bgcolor: PAGE.bg,
          }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={downloadingReport ? <CircularProgress size={16} /> : <DownloadOutlined />}
              onClick={() => void handleDownloadReport()}
              disabled={downloadingReport}
              sx={{
                flex: 1,
                color: "#9df0e5",
                borderColor: "rgba(45,212,191,0.45)",
                "&:hover": { borderColor: "#9df0e5", bgcolor: "rgba(45,212,191,0.08)" },
              }}
            >
              {downloadingReport ? "Generating report…" : "Download Full Report (PDF)"}
            </Button>
            <Button
              variant="contained"
              size="large"
              endIcon={<ArrowForwardOutlined />}
              onClick={() => setStage("sign")}
              sx={{
                flex: 1,
                bgcolor: "#2dd4bf",
                color: "#0f2a33",
                fontWeight: 700,
                "&:hover": { bgcolor: "#5eead4" },
              }}
            >
              Proceed to Sign
            </Button>
          </Stack>
          <Typography variant="caption" sx={{ display: "block", mt: 1.5, textAlign: "center", color: "rgba(255,255,255,0.6)" }}>
            By proceeding, you acknowledge you have reviewed the workflow record above.
          </Typography>
        </Box>
      </Box>
    );
  }

  // ─── Stage: sign ───────────────────────────────────────────────────────────
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: PAGE.bg, color: PAGE.text, px: { xs: 2, sm: 3 }, py: 3 }}>
      <Box sx={{ maxWidth: 560, mx: "auto" }}>
        <Button size="small" variant="text" onClick={() => setStage("review")} sx={{ mb: 1, ml: -1, color: PAGE.accent }}>
          ← Back to review
        </Button>
        <Typography variant="h5" fontWeight={700} gutterBottom sx={{ color: PAGE.text }}>
          {isInstallerSigner ? "Installer Sign-off" : "Sign Document"} — {assetTagLabel}
        </Typography>

        <Box sx={{ border: `1px solid ${PAGE.border}`, borderRadius: 2, p: 2, mb: 3, bgcolor: PAGE.panel }}>
          <SummaryMeta />
        </Box>

        <Divider sx={{ mb: 3, borderColor: PAGE.border }} />

        <Stack spacing={2}>
          {submitError && <Alert severity="error">{submitError}</Alert>}

          <Stack direction="row" spacing={1}>
            <TextField
              label="Your full name *"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label="Title / Role"
              value={signerTitle}
              onChange={(e) => setSignerTitle(e.target.value)}
              size="small"
              fullWidth
            />
          </Stack>

          <FormControl size="small" fullWidth>
            <InputLabel shrink>Decision</InputLabel>
            <Select value={reasonCode} label="Decision" onChange={(e) => setReasonCode(e.target.value)}>
              <MenuItem value="Completed">Accept — work completed satisfactorily</MenuItem>
              <MenuItem value="Conditional">Accept with reservations</MenuItem>
              <MenuItem value="ReworkAccepted">Accept rework</MenuItem>
              <MenuItem value="Declined">Decline — needs rework</MenuItem>
            </Select>
          </FormControl>

          {(reasonCode === "Declined" || reasonCode === "Conditional") && (
            <TextField
              label={reasonCode === "Declined" ? "Reason for declining *" : "Comments / reservations"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={2}
            />
          )}

          <Divider sx={{ borderColor: PAGE.border }}>
            <Typography variant="caption" sx={{ color: PAGE.textMuted }}>Signature</Typography>
          </Divider>

          <Stack direction="row" spacing={1}>
            <Button
              variant={inputMode === "typed" ? "contained" : "outlined"}
              size="small"
              startIcon={<KeyboardOutlined />}
              onClick={() => setInputMode("typed")}
            >
              Type name
            </Button>
            <Button
              variant={inputMode === "drawn" ? "contained" : "outlined"}
              size="small"
              startIcon={<GestureOutlined />}
              onClick={() => setInputMode("drawn")}
            >
              Draw signature
            </Button>
          </Stack>

          {inputMode === "typed" && (
            <Box sx={{
              border: "2px solid rgba(255,255,255,0.2)",
              borderRadius: 1,
              p: 2,
              fontFamily: "cursive",
              fontSize: "1.5rem",
              color: signerName ? "#e4edf2" : PAGE.textMuted,
              minHeight: 60,
              textAlign: "center",
              background: PAGE.panel,
            }}
            >
              {signerName || "— your name will appear here —"}
            </Box>
          )}

          {inputMode === "drawn" && (
            <SignaturePad
              onCapture={setDrawnData}
              onClear={() => setDrawnData(null)}
            />
          )}

          {/* State A: OTP is required for this link, but no code has been sent yet this
              session — a real, prominent button, not a subtle toggle. */}
          {needsOtp && !otpRequested && (
            <Button
              variant="contained"
              startIcon={<LockOutlined fontSize="small" />}
              onClick={() => void handleRequestOtp()}
              sx={{
                bgcolor: PAGE.accent,
                color: "#0f2a33",
                fontWeight: 700,
                alignSelf: "flex-start",
                "&:hover": { bgcolor: "#5eead4" },
              }}
            >
              Request OTP
            </Button>
          )}

          {/* State B: a code has been sent — enter it and verify. */}
          {needsOtp && otpRequested && !otpVerified && (
            <Box>
              {!otpFieldError && (
                <Typography
                  variant="caption"
                  sx={{ display: "block", mb: 0.5, color: PAGE.otpWaiting }}
                >
                  Verification code sent to your email.
                </Typography>
              )}
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  label="Verification code (6 digits)"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value);
                    setOtpVerified(false);
                    setOtpFieldError(null);
                    setConsent(false);
                  }}
                  size="small"
                  fullWidth
                  error={Boolean(otpFieldError)}
                  helperText={otpFieldError ?? undefined}
                  inputProps={{ maxLength: 6, inputMode: "numeric" }}
                  sx={
                    !otpFieldError
                      ? {
                          "& .MuiOutlinedInput-root fieldset": { borderColor: PAGE.otpWaiting },
                          "& .MuiOutlinedInput-root:hover fieldset": { borderColor: PAGE.otpWaiting },
                          "& .MuiOutlinedInput-root.Mui-focused fieldset": { borderColor: PAGE.otpWaiting },
                          "& .MuiInputLabel-root.Mui-focused": { color: PAGE.otpWaiting },
                        }
                      : undefined
                  }
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => void handleVerifyOtp()}
                  disabled={otpCode.trim().length !== 6 || verifyingOtp}
                  sx={{ mt: 0.25, minWidth: 96, whiteSpace: "nowrap" }}
                >
                  {verifyingOtp ? <CircularProgress size={16} /> : "Verify code"}
                </Button>
              </Stack>
            </Box>
          )}

          {needsOtp && otpVerified && (
            <Typography variant="caption" sx={{ display: "block", color: PAGE.accent }}>
              Verification code confirmed.
            </Typography>
          )}

          {/* Hidden — not merely disabled — until OTP verification is satisfied, so
              acknowledging cannot be used to bypass entering a correct code. */}
          {otpSatisfied && (
            <FormControlLabel
              control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
              label={
                <Typography variant="body2" sx={{ color: PAGE.text }}>
                  {isInstallerSigner
                    ? "I confirm the recorded time, captured fields, and workflow completion details are correct."
                    : "I confirm that I am authorised to sign this document and the information is correct."}
                </Typography>
              }
            />
          )}

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              variant="contained"
              color={reasonCode === "Declined" ? "error" : "primary"}
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || submitting}
              sx={{ minWidth: 140 }}
            >
              {submitting
                ? <CircularProgress size={18} />
                : reasonCode === "Declined"
                  ? "Decline & Submit"
                  : "Submit Signature"}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
