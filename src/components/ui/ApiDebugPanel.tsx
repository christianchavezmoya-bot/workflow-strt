/**
 * ApiDebugPanel — in-app API log viewer.
 * Tap the sync badge in the topbar to open.
 */
import {
  Box,
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
import { useEffect, useState } from "react";

interface DebugLog {
  id: string;
  time: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  error?: string;
}

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
  const [logs, setLogs] = useState<DebugLog[]>([]);

  const refresh = () => {
    const anyWindow = window as typeof window & { __apiDebugLogs?: DebugLog[] };
    setLogs([...(anyWindow.__apiDebugLogs ?? [])].reverse());
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    const handler = () => refresh();
    window.addEventListener("api-debug-log", handler);
    return () => window.removeEventListener("api-debug-log", handler);
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>API Debug Log</Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Last {logs.length} requests — newest first
        </Typography>
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
                <Typography variant="caption" color="text.disabled" sx={{ ml: "auto !important" }}>
                  {log.time} · {log.durationMs ?? "?"}ms
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
