/**
 * SyncTelemetryPanel — read-only per-domain sync telemetry (download/upload progress).
 * Embedded in Sync Center on native; no longer shown in the top bar.
 */
import { useEffect, useState } from "react";
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

function readPersistedOpen(key: string, defaultOpen: boolean): boolean {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // ignore
  }
  return defaultOpen;
}

interface Props {
  /** When false, inner collapse content is hidden but header can still show if parent expanded. */
  enabled?: boolean;
  /** Initial expanded state for the domain cards row. Defaults to collapsed. */
  defaultOpen?: boolean;
  /** sessionStorage key for persisting expand/collapse within the session. */
  persistKey?: string;
  /** Embedded layout for Sync Center (no outer border strip styling). */
  embedded?: boolean;
}

export default function SyncTelemetryPanel({
  enabled = true,
  defaultOpen = false,
  persistKey = "sync-telemetry-panel-open",
  embedded = false,
}: Props) {
  const t = useSyncTelemetry();
  const [open, setOpen] = useState(() => readPersistedOpen(persistKey, defaultOpen));

  useEffect(() => {
    try {
      sessionStorage.setItem(persistKey, String(open));
    } catch {
      // ignore
    }
  }, [open, persistKey]);

  if (!enabled) return null;

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
    <Box
      sx={{
        width: "100%",
        px: embedded ? 0 : 1,
        py: embedded ? 0 : 0.5,
        borderTop: embedded ? "none" : "0.5px solid rgba(255,255,255,0.06)",
        mt: embedded ? 1.5 : 0,
      }}
    >
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
        <IconButton size="small" onClick={() => setOpen((o) => !o)} sx={{ p: 0.25 }} aria-label={open ? "Collapse sync telemetry" : "Expand sync telemetry"}>
          {open ? <ExpandLessOutlinedIcon sx={{ fontSize: 16 }} /> : <ExpandMoreOutlinedIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, overflowX: "auto", pb: 0.5 }}>
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
