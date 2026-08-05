import { Box, Button, Chip, Divider, IconButton, Stack, Typography } from "@mui/material";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useEffect, useState } from "react";
import { getApiBaseUrl } from "../../services/apiBase";
import { subscribeServerReachable } from "../../services/connectivityMonitor";
import {
  copyDebugSnapshotToClipboard,
  downloadDebugSnapshot,
} from "../../services/debugSnapshotService";
import { pendingCount, syncMetaGet } from "../../services/localDB";
import { secureGet } from "../../services/secureStorage";

type DebugLog = {
  id: string;
  time: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  error?: string;
};

const getLogs = (): DebugLog[] => {
  const anyWindow = window as typeof window & { __apiDebugLogs?: DebugLog[] };
  return anyWindow.__apiDebugLogs || [];
};

function formatAuthUserSummary(raw: string): string {
  if (!raw) return "none";
  try {
    const parsed = JSON.parse(raw) as { id?: string; email?: string; role?: string; fullName?: string };
    const parts = [
      parsed.fullName,
      parsed.email,
      parsed.role ? `role=${parsed.role}` : null,
      parsed.id ? `id=${parsed.id}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" - ") : "present (redacted)";
  } catch {
    return "present (redacted)";
  }
}

const DebugPanel = () => {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>(() => getLogs());
  const [authSummary, setAuthSummary] = useState({
    tokenPresent: Boolean(secureGet("auth_token")),
    user: formatAuthUserSummary(secureGet("auth_user") || secureGet("local_auth_user") || ""),
  });
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [pending, setPending] = useState(0);
  const [lastAssetSync, setLastAssetSync] = useState<string | null>(null);
  const [apiUrl] = useState(() => getApiBaseUrl());
  const [copyState, setCopyState] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  useEffect(() => {
    const anyWindow = window as typeof window & { __apiDebugLogs?: DebugLog[] };
    if (!anyWindow.__apiDebugLogs) anyWindow.__apiDebugLogs = [];
    setLogs(getLogs());

    const refreshCounts = async () => {
      setPending(await pendingCount());
      setLastAssetSync(await syncMetaGet("assets"));
    };
    void refreshCounts();

    const handler = () => {
      setLogs(getLogs());
      setAuthSummary({
        tokenPresent: Boolean(secureGet("auth_token")),
        user: formatAuthUserSummary(secureGet("auth_user") || secureGet("local_auth_user") || ""),
      });
      void refreshCounts();
    };

    const handlePending = () => void refreshCounts();
    window.addEventListener("api-debug-log", handler);
    window.addEventListener("sync-pending-changed", handlePending);

    const unsubscribeReachable = subscribeServerReachable((reachable) => {
      setServerReachable(reachable);
      void refreshCounts();
    });

    return () => {
      window.removeEventListener("api-debug-log", handler);
      window.removeEventListener("sync-pending-changed", handlePending);
      unsubscribeReachable();
    };
  }, []);

  async function handleCopySnapshot() {
    await copyDebugSnapshotToClipboard();
    setCopyState(true);
    window.setTimeout(() => setCopyState(false), 2000);
  }

  async function handleDownloadSnapshot() {
    const result = await downloadDebugSnapshot();
    setSavedPath(result.savedPath ?? result.filename);
  }

  return (
    <>
      <IconButton
        color="inherit"
        onClick={() => setOpen(true)}
        sx={{
          position: "fixed",
          right: 20,
          bottom: 20,
          bgcolor: "rgba(45, 212, 191, 0.15)",
          border: "1px solid rgba(45, 212, 191, 0.35)",
          backdropFilter: "blur(10px)",
          zIndex: 1400,
          "&:hover": { bgcolor: "rgba(45, 212, 191, 0.25)" }
        }}
      >
        <BugReportOutlinedIcon />
      </IconButton>

      {open && (
        <Box
          sx={{
            position: "fixed",
            right: 20,
            bottom: 80,
            width: 380,
            maxHeight: "60vh",
            overflow: "auto",
            bgcolor: "rgba(11, 29, 36, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 2,
            p: 2,
            zIndex: 1401
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1">API Debug</Typography>
            <IconButton size="small" onClick={() => setOpen(false)}>
              <CloseOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Stack spacing={0.5} sx={{ mb: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>API host</Typography>
              <Typography variant="caption" sx={{ fontFamily: "monospace", wordBreak: "break-all", color: "text.primary" }}>
                {apiUrl}
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Server</Typography>
              {serverReachable === null
                ? <Chip label="unknown" size="small" sx={{ height: 16, fontSize: "0.65rem" }} />
                : serverReachable
                  ? <Chip label="reachable" size="small" color="success" sx={{ height: 16, fontSize: "0.65rem" }} />
                  : <Chip label="unreachable" size="small" color="error" sx={{ height: 16, fontSize: "0.65rem" }} />
              }
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Pending</Typography>
              <Typography variant="caption" color={pending > 0 ? "warning.main" : "success.main"}>
                {pending} action{pending !== 1 ? "s" : ""}
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Last asset sync</Typography>
              <Typography variant="caption" color="text.primary">
                {lastAssetSync ? new Date(lastAssetSync).toLocaleTimeString() : "never"}
              </Typography>
            </Stack>
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Auth token: {authSummary.tokenPresent ? "present (redacted)" : "none"}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              User: {authSummary.user}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              onClick={() => void handleCopySnapshot()}
            >
              {copyState ? "Copied" : "Copy baseline JSON"}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={() => void handleDownloadSnapshot()}
            >
              Download JSON
            </Button>
          </Stack>
          {savedPath && (
            <Typography variant="caption" color="success.main" sx={{ display: "block", mb: 1 }}>
              Saved to {savedPath}
            </Typography>
          )}

          <Divider sx={{ my: 1 }} />

          <Typography variant="caption" color="text.secondary">Latest requests</Typography>
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            {logs.length === 0 && (
              <Typography variant="body2" color="text.secondary">No requests yet.</Typography>
            )}
            {logs
              .slice()
              .reverse()
              .map((log) => (
                <Box key={log.id} sx={{ p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.04)" }}>
                  <Typography variant="caption" color="text.secondary">{log.time}</Typography>
                  <Typography variant="body2">{log.method} {log.url}</Typography>
                  <Typography variant="body2" color={log.status && log.status >= 400 ? "error" : "success.main"}>
                    {log.status ? `Status ${log.status}` : "No status"}
                    {log.durationMs != null ? ` - ${log.durationMs}ms` : ""}
                  </Typography>
                  {log.error && (
                    <Typography variant="caption" color="error">{log.error}</Typography>
                  )}
                </Box>
              ))}
          </Stack>
          <Button
            size="small"
            variant="outlined"
            sx={{ mt: 1 }}
            onClick={() => {
              const anyWindow = window as typeof window & { __apiDebugLogs?: DebugLog[] };
              anyWindow.__apiDebugLogs = [];
              setLogs([]);
            }}
          >
            Clear
          </Button>
        </Box>
      )}
    </>
  );
};

export default DebugPanel;
