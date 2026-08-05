import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useEffect, useState } from "react";
import type { ApiDebugLog } from "../../services/api";
import {
  copyDebugSnapshotToClipboard,
  downloadDebugSnapshot,
} from "../../services/debugSnapshotService";
import { sanitizeUrl } from "../../services/syncSupportBundleService";
import { formatPayloadSize } from "../../utils/syncDiagnostics";

function statusColor(status?: number): "success" | "warning" | "error" | "default" {
  if (!status) return "error";
  if (status < 300) return "success";
  if (status < 500) return "warning";
  return "error";
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ApiDebugPanel({ open, onClose }: Props) {
  const [logs, setLogs] = useState<ApiDebugLog[]>([]);
  const [copied, setCopied] = useState<"logs" | "snapshot" | false>(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const refresh = () => {
    const anyWindow = window as typeof window & { __apiDebugLogs?: ApiDebugLog[] };
    setLogs([...(anyWindow.__apiDebugLogs ?? [])].reverse());
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    const handler = () => refresh();
    window.addEventListener("api-debug-log", handler);
    return () => window.removeEventListener("api-debug-log", handler);
  }, [open]);

  async function copySanitizedLogs() {
    const payload = logs.map((log) => ({
      time: log.time,
      method: log.method,
      url: sanitizeUrl(log.url),
      status: log.status,
      durationMs: log.durationMs,
      error: log.error,
      source: log.source,
      opType: log.opType,
    }));
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied("logs");
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function copySnapshot() {
    await copyDebugSnapshotToClipboard();
    setCopied("snapshot");
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function downloadSnapshot() {
    const result = await downloadDebugSnapshot();
    setSavedPath(result.savedPath ?? result.filename);
  }

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>API Debug Log</Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Last {logs.length} requests - newest first. Baseline JSON excludes tokens and request bodies.
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            sx={{ textTransform: "none" }}
            onClick={() => void copySnapshot()}
          >
            {copied === "snapshot" ? "Copied" : "Copy baseline JSON"}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            sx={{ textTransform: "none" }}
            onClick={() => void downloadSnapshot()}
          >
            Download JSON
          </Button>
          {logs.length > 0 && (
            <Button
              size="small"
              variant="text"
              startIcon={<ContentCopyIcon />}
              sx={{ textTransform: "none" }}
              onClick={() => void copySanitizedLogs()}
            >
              {copied === "logs" ? "Copied" : "Copy request log only"}
            </Button>
          )}
        </Stack>
        {savedPath && (
          <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 1 }}>
            Saved to {savedPath}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {logs.length === 0 && (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary" variant="body2">No API calls recorded yet</Typography>
          </Box>
        )}
        {logs.map((log) => (
          <Box key={log.id}>
            <Box sx={{ px: 2, py: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Chip
                  label={log.status ?? "ERR"}
                  size="small"
                  color={statusColor(log.status)}
                  sx={{ fontWeight: 700, fontSize: "0.7rem", height: 20 }}
                />
                <Chip
                  label={log.method ?? "?"}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: "0.65rem", height: 20 }}
                />
                {log.source && (
                  <Chip
                    label={log.source}
                    size="small"
                    variant="outlined"
                    color="info"
                    sx={{ fontSize: "0.62rem", height: 20 }}
                  />
                )}
                {log.opType && (
                  <Chip
                    label={log.opType}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: "0.62rem", height: 20 }}
                  />
                )}
                <Typography variant="caption" color="text.disabled" sx={{ ml: "auto !important" }}>
                  {log.time} - {log.durationMs ?? "?"}ms
                  {log.payloadBytes != null ? ` - ${log.payloadSizeFormatted ?? formatPayloadSize(log.payloadBytes)}` : ""}
                </Typography>
              </Stack>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.72rem",
                  wordBreak: "break-all",
                  color: log.status && log.status >= 400 ? "error.main" : "text.primary",
                }}
              >
                {log.url ?? "unknown"}
              </Typography>
              {log.error && (
                <Typography variant="caption" color="error" display="block" sx={{ mt: 0.25 }}>
                  {log.error}
                </Typography>
              )}
            </Box>
            <Divider />
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
}
