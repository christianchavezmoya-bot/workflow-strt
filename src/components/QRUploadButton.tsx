import { useEffect, useRef, useState } from "react";
import {
  Box, Button, CircularProgress, Dialog, DialogContent,
  DialogTitle, IconButton, Stack, Typography, Alert,
} from "@mui/material";
import PhoneAndroidOutlinedIcon from "@mui/icons-material/PhoneAndroidOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { QRCodeSVG } from "qrcode.react";
import api from "../services/api";
import { documentService, type DocumentRecord } from "../services/documentService";
import { getFallbackPublicFrontendBaseUrl, resolvePublicFrontendBaseUrl } from "../services/publicFrontendBase";
import { invalidateWebCache } from "../services/webFreshCache";

interface QRUploadButtonProps {
  /** Document type to store (e.g. "tips") */
  docType: string;
  /** linkedTo value */
  linkedTo: string;
  /** customValues JSON string */
  customValuesJson?: string;
  /** Called with the new documentId once upload completes on the phone */
  onUploaded: (documentId: string) => void;
  /**
   * Optional - when provided, after upload completes the component fetches the
   * document record, converts the file to a base64 data URL, and calls this
   * callback with both the documentId and the dataUrl.
   */
  onUploadedWithData?: (documentId: string, dataUrl: string) => void;
  /** Called once with every uploaded data URL (preferred for multi-photo uploads). */
  onUploadedAllWithData?: (dataUrls: string[]) => void;
  /** Optional button label override */
  label?: string;
  disabled?: boolean;
}

interface TokenResponse {
  token: string;
  expiresAt: string;
}

interface TokenStatus {
  status: "pending" | "complete" | "expired" | "not_found";
  documentId?: string;
  documentIds?: string[];
}

export default function QRUploadButton({
  docType,
  linkedTo,
  customValuesJson,
  onUploaded,
  onUploadedWithData,
  onUploadedAllWithData,
  label = "Upload from Phone",
  disabled,
}: QRUploadButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [publicFrontendBaseUrl, setPublicFrontendBaseUrl] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const generateToken = async () => {
    setLoading(true);
    setError(null);
    setDone(false);
    setToken(null);
    try {
      const res = await api.post<TokenResponse>("/mobile-upload/token", {
        type: docType,
        linkedTo,
        customValuesJson: customValuesJson ?? null,
      });
      setToken(res.data.token);
      setExpiresAt(new Date(res.data.expiresAt));
    } catch {
      setError("Could not generate upload token. Is the server running?");
    } finally {
      setLoading(false);
    }
  };

  const loadPublicFrontendBaseUrl = async () => {
    try {
      setPublicFrontendBaseUrl(await resolvePublicFrontendBaseUrl());
    } catch {
      setPublicFrontendBaseUrl(getFallbackPublicFrontendBaseUrl());
    }
  };

  const handleOpen = async () => {
    setOpen(true);
    await Promise.all([generateToken(), loadPublicFrontendBaseUrl()]);
  };

  const handleClose = () => {
    stopPolling();
    setOpen(false);
    setToken(null);
    setDone(false);
    setError(null);
    setProcessing(false);
  };

  const processUploadedDocuments = async (documentIds: string[]) => {
    const uniqueIds = Array.from(new Set(documentIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    setDone(true);
    onUploaded(uniqueIds[0]);

    if (!onUploadedWithData && !onUploadedAllWithData) {
      setTimeout(() => handleClose(), 2000);
      return;
    }

    setProcessing(true);
    try {
      invalidateWebCache("/documents");
      const docs = await documentService.getDocuments();
      const dataUrls: string[] = [];
      for (const documentId of uniqueIds) {
        const doc: DocumentRecord | undefined = docs.find((d) => d.id === documentId);
        if (doc?.downloadUrl) {
          const buffer = await documentService.openDocumentAsBuffer(doc.downloadUrl);
          const bytes = new Uint8Array(buffer);
          let binary = "";
          bytes.forEach((b) => (binary += String.fromCharCode(b)));
          const base64 = window.btoa(binary);
          dataUrls.push(`data:${doc.contentType ?? "application/octet-stream"};base64,${base64}`);
          onUploadedWithData?.(documentId, dataUrls[dataUrls.length - 1]!);
        }
      }
      if (dataUrls.length > 0) {
        onUploadedAllWithData?.(dataUrls);
      }
    } catch {
      // Non-fatal - onUploaded already called
    } finally {
      setProcessing(false);
      setTimeout(() => handleClose(), 2000);
    }
  };

  // Start/restart polling whenever token changes
  useEffect(() => {
    if (!token || done) return;
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<TokenStatus>(`/mobile-upload/token/${token}`);
        const { status, documentId, documentIds } = res.data;
        if (status === "complete" && (documentIds?.length || documentId)) {
          stopPolling();
          const ids = documentIds?.length ? documentIds : (documentId ? [documentId] : []);
          await processUploadedDocuments(ids);
        } else if (status === "expired" || status === "not_found") {
          stopPolling();
          setError("QR code expired. Click Regenerate to get a new one.");
        }
      } catch {
        // Network hiccup - keep polling
      }
    }, 3000);
    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, done]);

  // Countdown timer display
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  useEffect(() => {
    if (!expiresAt || done) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt, done]);

  // Build the URL the phone will open
  const uploadUrl = token
    ? `${(publicFrontendBaseUrl || getFallbackPublicFrontendBaseUrl()).replace(/\/+$/, "")}/mobile-upload?token=${token}`
    : "";

  const minutesLeft = Math.floor(secondsLeft / 60);
  const secsLeft = secondsLeft % 60;
  const timeStr = `${minutesLeft}:${String(secsLeft).padStart(2, "0")}`;

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<PhoneAndroidOutlinedIcon />}
        onClick={handleOpen}
        disabled={disabled}
      >
        {label}
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={700}>Upload from Phone</Typography>
            <IconButton size="small" onClick={handleClose}><CloseOutlinedIcon /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          {loading && (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          )}
          {error && (
            <Stack spacing={2} alignItems="center" py={2}>
              <Alert severity="error" sx={{ width: "100%" }}>{error}</Alert>
              <Button variant="outlined" onClick={generateToken}>Regenerate QR</Button>
            </Stack>
          )}
          {done && (
            <Stack alignItems="center" spacing={1} py={3}>
              <Typography variant="h6" color="success.main" fontWeight={700}>{"\u2713"} Upload complete!</Typography>
              {processing ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={14} />
                  <Typography variant="body2" color="text.secondary">Processing...</Typography>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">File received from your phone.</Typography>
              )}
            </Stack>
          )}
          {!loading && !error && !done && token && (
            <Stack alignItems="center" spacing={2} py={1}>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Scan this QR code with your phone camera to upload one or more photos, videos or documents.
              </Typography>
              <Box
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  bgcolor: "white",
                  display: "inline-flex",
                }}
              >
                <QRCodeSVG value={uploadUrl} size={200} />
              </Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={12} />
                <Typography variant="caption" color="text.secondary">
                  Waiting for upload... expires in {timeStr}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.disabled" sx={{ wordBreak: "break-all", textAlign: "center" }}>
                {uploadUrl}
              </Typography>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

