/**
 * ExternalSignPage — public (no auth required) customer review & sign page.
 * Route: /sign/:tokenId
 *
 * Flow:
 *   1. Load summary via GET /api/public/sign/{tokenId}
 *   2. "review" stage — customer sees work summary + can download PDF report
 *   3. "sign" stage — customer fills in name, draws/types signature, ticks consent
 *   4. POST /api/public/sign/{tokenId}/submit
 *   5. "done" stage — confirmation screen
 */

import React, { useEffect, useRef, useState } from "react";
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
  Typography
} from "@mui/material";
import {
  ArrowForwardOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  GestureOutlined,
  KeyboardOutlined
} from "@mui/icons-material";
import api from "../../services/api";
import type { PublicRunSummary, SignatureEvent } from "../../types/signature";
import { generateWorkflowReport } from "../../utils/generateWorkflowReport";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";

// ─── Signature canvas ──────────────────────────────────────────────────────────

function SignaturePad({
  onCapture,
  onClear
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
          width: "100%"
        }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <Button size="small" onClick={clear} sx={{ mt: 0.5 }}>Clear</Button>
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

  // Form state
  const [inputMode, setInputMode] = useState<InputMode>("typed");
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [reasonCode, setReasonCode] = useState("Completed");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [drawnData, setDrawnData] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  useEffect(() => {
    if (!tokenId) return;
    api.get<PublicRunSummary>(`/public/sign/${tokenId}`)
      .then(r => {
        setSummary(r.data);
        setSignerName(r.data.recipientName ?? "");
        setStage("review");
      })
      .catch(err => {
        const msg = err?.response?.data?.message ?? "This link is invalid or has expired.";
        setLoadError(msg);
        setStage("error");
      });
  }, [tokenId]);

  const handleDownloadReport = async () => {
    if (!summary) return;
    setDownloadingReport(true);
    try {
      // Build minimal run + asset objects for the report generator
      const run: AssetWorkflowRun = {
        id: summary.runId,
        assetId: "",
        workflowConfigId: "",
        workflowVersion: 1,
        workflowSnapshotJson: summary.workflowSnapshotJson,
        status: "Complete",
        isLocked: true,
        stepResultsJson: summary.stepResultsJson,
        issuesJson: summary.issuesJson,
        timeTrackingJson: "[]",
        productiveSeconds: 0,
        downtimeSeconds: 0,
        downtimeEvents: 0,
        runNumber: 1,
        completedByName: summary.completedByName,
        signatureStatus: summary.signatureStatus,
        completedAt: summary.completedAt,
        startedAt: summary.completedAt,
        createdAt: summary.completedAt,
        updatedAt: summary.completedAt,
      };
      const asset: ProjectAsset = {
        id: "",
        projectId: "",
        productId: "",
        assetTag: summary.assetTag ?? summary.assetName,
        assetName: summary.assetName,
        serialNumber: summary.assetSerial || undefined,
        location: summary.assetLocation,
        status: "Complete",
        featureValuesJson: "{}",
        issuesJson: "[]",
        createdAt: summary.completedAt,
        updatedAt: summary.completedAt,
      };

      // Build installer signature event if available
      const signatureEvents: SignatureEvent[] = [];
      if (summary.installerSignerName) {
        signatureEvents.push({
          id: "installer",
          runId: summary.runId,
          signerRole: "Installer",
          signerName: summary.installerSignerName,
          signedAtUtc: summary.installerSignedAt ?? summary.completedAt,
          hasDrawnSignature: !!summary.installerSignatureData,
          signatureData: summary.installerSignatureData,
          reasonCode: (summary.installerReasonCode ?? "Completed") as SignatureEvent["reasonCode"],
          notes: summary.installerNotes,
        });
      }

      await generateWorkflowReport({
        run,
        asset,
        workflowConfigName: summary.workflowName,
        customerName: summary.customerName,
        jobNumber: summary.projectJobNumber,
        timeZoneId: summary.timeZoneId,
        signatureEvents,
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
    } catch {
      setSubmitError("Failed to send OTP code. Please try again.");
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
        otpCode: otpCode.trim() || undefined
      });
      setStage("done");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg?.toLowerCase().includes("otp")) setNeedsOtp(true);
      setSubmitError(msg ?? "Failed to submit signature. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    signerName.trim().length > 0 &&
    consent &&
    (reasonCode !== "Declined" || notes.trim().length > 0) &&
    (inputMode === "typed" || drawnData !== null);

  if (stage === "loading") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress />
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
      <Box sx={{ maxWidth: 500, mx: "auto", mt: 10, p: 3, textAlign: "center" }}>
        <CheckCircleOutlined sx={{ fontSize: 72, color: "#4caf50", mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {reasonCode === "Declined" ? "Document Declined" : "Signature Recorded"}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mx: "auto" }}>
          {reasonCode === "Declined"
            ? "Your decline has been recorded and the team has been notified."
            : "Thank you. Your signature has been recorded and the installation certificate is now complete."}
        </Typography>
      </Box>
    );
  }

  // ─── Summary card (shared between review + sign stages) ────────────────────
  const SummaryCard = () => summary ? (
    <Box sx={{ border: "1px solid #e0e0e0", borderRadius: 2, p: 2, mb: 3, background: "#fafafa" }}>
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>{summary.workflowName}</Typography>
      <Stack spacing={0.5}>
        <Typography variant="body2" color="text.secondary">
          Asset: <strong>{summary.assetName}</strong>{summary.assetSerial ? ` (${summary.assetSerial})` : ""}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Project: {summary.projectJobNumber} — {summary.customerName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Completed by: {summary.completedByName}
        </Typography>
        {summary.completedAt && (
          <Typography variant="body2" color="text.secondary">
            Completed: {new Date(summary.completedAt).toLocaleDateString(undefined, {
              year: "numeric", month: "long", day: "numeric"
            })}
          </Typography>
        )}
        {summary.installerSignerName && (
          <Chip
            size="small"
            color="success"
            label={`Installer signed: ${summary.installerSignerName}`}
            sx={{ alignSelf: "flex-start", mt: 0.5 }}
          />
        )}
      </Stack>
    </Box>
  ) : null;

  // ─── Stage: review ─────────────────────────────────────────────────────────
  if (stage === "review") {
    return (
      <Box sx={{ maxWidth: 560, mx: "auto", mt: 4, p: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Installation Record
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Please review the work completed below. You can download the full report before signing.
        </Typography>

        <SummaryCard />

        <Stack spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={downloadingReport ? <CircularProgress size={16} /> : <DownloadOutlined />}
            onClick={handleDownloadReport}
            disabled={downloadingReport}
            fullWidth
          >
            {downloadingReport ? "Generating report…" : "Download Full Report (PDF)"}
          </Button>

          <Button
            variant="contained"
            size="large"
            endIcon={<ArrowForwardOutlined />}
            onClick={() => setStage("sign")}
            fullWidth
          >
            Proceed to Sign
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
          By proceeding, you acknowledge you have reviewed the information above.
        </Typography>
      </Box>
    );
  }

  // ─── Stage: sign ───────────────────────────────────────────────────────────
  return (
    <Box sx={{ maxWidth: 560, mx: "auto", mt: 4, p: 3 }}>
      <Button size="small" variant="text" onClick={() => setStage("review")} sx={{ mb: 1, ml: -1 }}>
        ← Back to review
      </Button>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Sign Document
      </Typography>

      <SummaryCard />

      <Divider sx={{ mb: 3 }} />

      <Stack spacing={2}>
        {submitError && <Alert severity="error">{submitError}</Alert>}

        <Stack direction="row" spacing={1}>
          <TextField
            label="Your full name *"
            value={signerName}
            onChange={e => setSignerName(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            label="Title / Role"
            value={signerTitle}
            onChange={e => setSignerTitle(e.target.value)}
            size="small"
            fullWidth
          />
        </Stack>

        <FormControl size="small" fullWidth>
          <InputLabel shrink>Decision</InputLabel>
          <Select value={reasonCode} label="Decision" onChange={e => setReasonCode(e.target.value)}>
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
            onChange={e => setNotes(e.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={2}
          />
        )}

        <Divider>
          <Typography variant="caption" color="text.secondary">Signature</Typography>
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
            border: "2px solid #ccc",
            borderRadius: 1,
            p: 2,
            fontFamily: "cursive",
            fontSize: "1.5rem",
            color: signerName ? "#1a2744" : "#aaa",
            minHeight: 60,
            textAlign: "center",
            background: "#f9f9f9"
          }}>
            {signerName || "— your name will appear here —"}
          </Box>
        )}

        {inputMode === "drawn" && (
          <SignaturePad
            onCapture={setDrawnData}
            onClear={() => setDrawnData(null)}
          />
        )}

        {needsOtp && (
          <TextField
            label="OTP code (sent to your email)"
            value={otpCode}
            onChange={e => setOtpCode(e.target.value)}
            size="small"
            fullWidth
            inputProps={{ maxLength: 6 }}
          />
        )}

        <FormControlLabel
          control={<Checkbox checked={consent} onChange={e => setConsent(e.target.checked)} />}
          label={
            <Typography variant="body2">
              I confirm that I am authorised to sign this document and the information is correct.
            </Typography>
          }
        />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          {!needsOtp && (
            <Button size="small" variant="text" onClick={handleRequestOtp}>
              Require OTP verification
            </Button>
          )}
          <Button
            variant="contained"
            color={reasonCode === "Declined" ? "error" : "primary"}
            onClick={handleSubmit}
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
  );
}
