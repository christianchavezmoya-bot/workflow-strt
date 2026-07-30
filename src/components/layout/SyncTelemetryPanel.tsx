/**
 * SyncTelemetryPanel — always-on, read-only debugging strip that shows, per
 * data domain, how much has come DOWN from the server (download / hydration)
 * and how much is waiting to go UP to the server (upload / queue). Sits below
 * the ConnectivityDebugBar. Every number comes from useSyncTelemetry, which
 * only reads existing sync signals — this renders nothing that isn't real.
 */
import { useState } from "react";
import { Box, Collapse, IconButton, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import SouthOutlinedIcon from "@mui/icons-material/SouthOutlined";
import NorthOutlinedIcon from "@mui/icons-material/NorthOutlined";
import WifiOutlinedIcon from "@mui/icons-material/WifiOutlined";
import WifiOffOutlinedIcon from "@mui/icons-material/WifiOffOutlined";
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined";
import { useSyncTelemetry, type DomainTelemetry } from "../../hooks/useSyncTelemetry";

const TONE: Record<"ok" | "warn" | "bad" | "idle", string> = {
  ok: "#22c55e",
  warn: "#f59e0b",
  bad: "#ef4444",
  idle: "#94a3b8",
};

function ageShort(date: Date | null): string {
  if (!date) return "never";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const CARD_SX = {
  minWidth: 118,
  flex: "0 0 auto",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 1.5,
  px: 1,
  py: 0.75,
  bgcolor: "rgba(255,255,255,0.02)",
} as const;

function Dot({ color }: { color: string }) {
  return <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />;
}

function DomainCard({ d }: { d: DomainTelemetry }) {
  const dlColor =
    d.downloadState === "syncing" ? TONE.warn :
    d.downloadState === "fresh" ? TONE.ok :
    d.downloadState === "stale" ? TONE.warn : TONE.idle;
  const upColor =
    d.uploadState === "failed" ? TONE.bad :
    d.uploadState === "sending" ? TONE.warn :
    d.uploadState === "pending" ? TONE.warn : TONE.ok;

  const uploadText =
    d.failed > 0 ? `${d.failed} failed` :
    d.uploadState === "sending" ? `${d.pending} sending…` :
    d.pending > 0 ? `${d.pending} queued` : "synced";

  return (
    <Box sx={CARD_SX}>
      <Typography sx={{ fontSize: "0.66rem", fontWeight: 700, color: "text.secondary", mb: 0.5 }}>
        {d.label}
      </Typography>

      {/* Download (server → phone) */}
      <Tooltip title="Downloaded from server (hydration when online / cached data on device)">
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.4 }}>
          <SouthOutlinedIcon sx={{ fontSize: 12, color: dlColor }} />
          {d.downloadPct !== null ? (
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={d.downloadPct}
                sx={{ height: 5, borderRadius: 3, "& .MuiLinearProgress-bar": { bgcolor: dlColor } }}
              />
            </Box>
          ) : (
            <Dot color={dlColor} />
          )}
          <Typography sx={{ fontSize: "0.64rem", color: "text.primary", whiteSpace: "nowrap" }}>
            {d.downloadPct !== null ? `${d.downloadPct}%` : `${d.cachedCount} · ${ageShort(d.lastSyncAt)}`}
          </Typography>
        </Stack>
      </Tooltip>

      {/* Upload (phone → server) */}
      <Tooltip title="Changes waiting to upload to the server">
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <NorthOutlinedIcon sx={{ fontSize: 12, color: upColor }} />
          <Dot color={upColor} />
          <Typography sx={{ fontSize: "0.64rem", color: "text.primary", whiteSpace: "nowrap" }}>
            {uploadText}
          </Typography>
        </Stack>
      </Tooltip>
    </Box>
  );
}

export default function SyncTelemetryPanel() {
  const t = useSyncTelemetry();
  const [open, setOpen] = useState(true);

  const offline = t.connectivity === "offline";
  const signalColor = offline ? TONE.bad : TONE.ok;
  const serverColor = t.serverReachable === false ? TONE.bad : t.serverReachable ? TONE.ok : TONE.idle;

  const summary = offline
    ? `Offline · ${t.totalPending} queued`
    : t.serverReachable === false
      ? "Server not responding"
      : t.bootstrapRunning
        ? "Downloading…"
        : t.totalPending > 0
          ? `${t.totalPending} uploading`
          : "All synced";

  return (
    <Box sx={{ width: "100%", px: 1, py: 0.5, borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
      {/* Header row: overall signal + server + one-line summary + collapse */}
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <Tooltip title={offline ? "No WiFi/cellular signal" : "Device has signal"}>
          {offline ? <WifiOffOutlinedIcon sx={{ fontSize: 14, color: signalColor }} /> : <WifiOutlinedIcon sx={{ fontSize: 14, color: signalColor }} />}
        </Tooltip>
        <Tooltip title={t.serverReachable === false ? "Server not responding to health checks" : "Server responding"}>
          <DnsOutlinedIcon sx={{ fontSize: 14, color: serverColor }} />
        </Tooltip>
        <Typography sx={{ fontSize: "0.68rem", fontWeight: 700, color: "text.secondary", letterSpacing: 0.3 }}>
          SYNC
        </Typography>
        <Typography sx={{ fontSize: "0.66rem", color: "text.secondary", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {summary}
          {t.totalFailed > 0 ? ` · ${t.totalFailed} failed` : ""}
          {t.conflictCount > 0 ? ` · ${t.conflictCount} conflict${t.conflictCount === 1 ? "" : "s"}` : ""}
        </Typography>
        {t.uploadDrainPct !== null && (
          <Typography sx={{ fontSize: "0.64rem", color: TONE.warn, whiteSpace: "nowrap" }}>
            ↑ {t.uploadDrainPct}%
          </Typography>
        )}
        <IconButton size="small" onClick={() => setOpen((o) => !o)} sx={{ p: 0.25 }}>
          {open ? <ExpandLessOutlinedIcon sx={{ fontSize: 16 }} /> : <ExpandMoreOutlinedIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, overflowX: "auto", pb: 0.5 }}>
          {/* Overview card */}
          <Box sx={CARD_SX}>
            <Typography sx={{ fontSize: "0.66rem", fontWeight: 700, color: "text.secondary", mb: 0.5 }}>
              Overview
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.4 }}>
              <Dot color={signalColor} />
              <Typography sx={{ fontSize: "0.64rem" }}>{offline ? "Offline" : "Online"}</Typography>
              <Dot color={serverColor} />
              <Typography sx={{ fontSize: "0.64rem" }}>{t.serverReachable === false ? "no srv" : "srv ok"}</Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.62rem", color: "text.secondary" }}>
              sync {ageShort(t.lastSyncAt)} ago
            </Typography>
            <Typography sx={{ fontSize: "0.62rem", color: t.totalPending > 0 ? TONE.warn : "text.secondary" }}>
              ↑ {t.totalPending} queued{t.totalFailed > 0 ? ` · ${t.totalFailed}✗` : ""}
            </Typography>
          </Box>

          {t.domains.map((d) => <DomainCard key={d.key} d={d} />)}
        </Stack>
      </Collapse>
    </Box>
  );
}
