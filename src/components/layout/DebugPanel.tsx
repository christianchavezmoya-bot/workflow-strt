import { Box, Button, Divider, IconButton, Stack, TextField, Typography } from "@mui/material";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { useEffect, useState } from "react";
import { secureGet } from "../../services/secureStorage";
import {
  clearStoredApiBaseUrl,
  getApiBaseUrl,
  getDefaultApiBaseUrl,
  getStoredApiBaseUrl,
  setStoredApiBaseUrl,
} from "../../services/apiBase";

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

const DebugPanel = () => {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>(() => getLogs());
  const [authInfo, setAuthInfo] = useState({
    token: secureGet("auth_token") || "",
    user: secureGet("auth_user") || secureGet("local_auth_user") || ""
  });
  const [apiBaseDraft, setApiBaseDraft] = useState(() => getStoredApiBaseUrl() ?? "");
  const [resolvedApiBase, setResolvedApiBase] = useState(() => getApiBaseUrl());

  useEffect(() => {
    const anyWindow = window as typeof window & { __apiDebugLogs?: DebugLog[] };
    if (!anyWindow.__apiDebugLogs) {
      anyWindow.__apiDebugLogs = [];
    }
    setLogs(getLogs());
    const handler = () => {
      setLogs(getLogs());
      setAuthInfo({
        token: secureGet("auth_token") || "",
        user: secureGet("auth_user") || secureGet("local_auth_user") || ""
      });
      setApiBaseDraft(getStoredApiBaseUrl() ?? "");
      setResolvedApiBase(getApiBaseUrl());
    };
    window.addEventListener("api-debug-log", handler);
    window.addEventListener("api-base-changed", handler);
    return () => {
      window.removeEventListener("api-debug-log", handler);
      window.removeEventListener("api-base-changed", handler);
    };
  }, []);

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
          <Typography variant="caption" color="text.secondary">
            Latest requests and responses
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Auth token: {authInfo.token ? authInfo.token.slice(0, 16) + "..." : "none"}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              User: {authInfo.user || "none"}
            </Typography>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Stack spacing={1.25} sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2">Mobile API Base</Typography>
            <Typography variant="caption" color="text.secondary">
              Active: {resolvedApiBase}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Default: {getDefaultApiBaseUrl()}
            </Typography>
            <TextField
              size="small"
              label="Override API Base URL"
              placeholder="http://192.168.1.10:4000/api"
              value={apiBaseDraft}
              onChange={(e) => setApiBaseDraft(e.target.value)}
            />
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const next = setStoredApiBaseUrl(apiBaseDraft);
                  setApiBaseDraft(next);
                  setResolvedApiBase(getApiBaseUrl());
                }}
              >
                Save API URL
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  clearStoredApiBaseUrl();
                  setApiBaseDraft("");
                  setResolvedApiBase(getApiBaseUrl());
                }}
              >
                Reset
              </Button>
            </Stack>
          </Stack>
          <Stack spacing={1}>
            {logs.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No requests yet.
              </Typography>
            )}
            {logs
              .slice()
              .reverse()
              .map((log) => (
                <Box key={log.id} sx={{ p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.04)" }}>
                  <Typography variant="caption" color="text.secondary">
                    {log.time}
                  </Typography>
                  <Typography variant="body2">
                    {log.method} {log.url}
                  </Typography>
                  <Typography variant="body2" color={log.status && log.status >= 400 ? "error" : "success.main"}>
                    {log.status ? `Status ${log.status}` : "No status"}
                    {log.durationMs != null ? ` · ${log.durationMs}ms` : ""}
                  </Typography>
                  {log.error && (
                    <Typography variant="caption" color="error">
                      {log.error}
                    </Typography>
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
