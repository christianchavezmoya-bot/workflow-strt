import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { GestureOutlined, KeyboardOutlined } from "@mui/icons-material";
import { signatureService, type SubmitSignaturePayload } from "../../services/signatureService";
import type { SignerRole } from "../../types/signature";

// ─── Canvas signature pad ──────────────────────────────────────────────────────

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
    ctx.strokeStyle = "#e0f7f4";
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
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onClear();
  };

  return (
    <Box>
      <canvas
        ref={canvasRef}
        width={460}
        height={120}
        style={{
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 4,
          background: "rgba(0,0,0,0.25)",
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

// ─── Main dialog ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  runId: string;
  signerRole: SignerRole;
  defaultSignerName?: string;
  defaultSignerEmail?: string;
  onClose: () => void;
  onSigned: () => void;
}

type InputMode = "typed" | "drawn";

export default function SignatureDialog({
  open,
  runId,
  signerRole,
  defaultSignerName = "",
  defaultSignerEmail = "",
  onClose,
  onSigned
}: Props) {
  const [inputMode, setInputMode] = useState<InputMode>("typed");
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerEmail, setSignerEmail] = useState(defaultSignerEmail);
  const [signerTitle, setSignerTitle] = useState("");
  const [reasonCode, setReasonCode] = useState<SubmitSignaturePayload["reasonCode"]>("Completed");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [drawnData, setDrawnData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSignerName(defaultSignerName);
      setSignerEmail(defaultSignerEmail);
      setSignerTitle("");
      setReasonCode("Completed");
      setNotes("");
      setConsent(false);
      setDrawnData(null);
      setError(null);
      setSaving(false);
    }
  }, [open, defaultSignerName, defaultSignerEmail]);

  const canSubmit =
    signerName.trim().length > 0 &&
    consent &&
    (reasonCode !== "Declined" || notes.trim().length > 0) &&
    (inputMode === "typed" || drawnData !== null);

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      await signatureService.submitSignature(runId, {
        signerRole,
        signerName: signerName.trim(),
        signerEmail: signerEmail.trim() || undefined,
        signerTitle: signerTitle.trim() || undefined,
        signatureData: inputMode === "drawn" ? (drawnData ?? undefined) : undefined,
        reasonCode,
        notes: notes.trim() || undefined,
        consentConfirmed: consent
      });
      onSigned();
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "Failed to submit signature.");
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = signerRole === "Installer" ? "Installer Sign-off" : "Customer Sign-off";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{roleLabel}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" spacing={1}>
            <TextField
              label="Full name *"
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
          <TextField
            label="Email"
            value={signerEmail}
            onChange={e => setSignerEmail(e.target.value)}
            size="small"
            fullWidth
          />

          <FormControl size="small" fullWidth>
            <InputLabel>Reason code</InputLabel>
            <Select
              value={reasonCode}
              label="Reason code"
              onChange={e => setReasonCode(e.target.value as SubmitSignaturePayload["reasonCode"])}
            >
              <MenuItem value="Completed">Completed — work accepted</MenuItem>
              <MenuItem value="Conditional">Conditional — accepted with reservations</MenuItem>
              <MenuItem value="ReworkAccepted">Rework accepted</MenuItem>
              <MenuItem value="Declined">Declined — needs rework</MenuItem>
            </Select>
          </FormControl>

          {(reasonCode === "Declined" || reasonCode === "Conditional") && (
            <TextField
              label={reasonCode === "Declined" ? "Reason for declining *" : "Comments"}
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
            <Box
              sx={{
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 1,
                p: 2,
                background: "rgba(0,0,0,0.2)",
                fontFamily: "cursive",
                fontSize: "1.5rem",
                color: signerName ? "#e0f7f4" : "text.disabled",
                minHeight: 56,
                textAlign: "center"
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

          <FormControlLabel
            control={
              <Checkbox
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography variant="body2">
                I confirm that the information above is correct and I am authorised to sign
                this document on behalf of the named party.
              </Typography>
            }
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          color={reasonCode === "Declined" ? "error" : "primary"}
          onClick={handleSubmit}
          disabled={!canSubmit || saving}
        >
          {saving ? <CircularProgress size={18} /> : reasonCode === "Declined" ? "Decline & Submit" : "Sign"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
