/**
 * SyncCenterConnectivitySection — collapsible network status + sync telemetry for native Sync Center.
 */
import { Box, Collapse, IconButton, Stack, Typography } from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import { useEffect, useState } from "react";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import ConnectivityStatusChips, { buildConnectivityStatusChips } from "./ConnectivityStatusChips";
import SyncTelemetryPanel from "./SyncTelemetryPanel";

const SECTION_STORAGE_KEY = "sync-center-connectivity-open";

function readSectionOpen(): boolean {
  try {
    const raw = sessionStorage.getItem(SECTION_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // ignore
  }
  return false;
}

function sectionSummary(input: {
  connectivity: ReturnType<typeof useSyncEngine>["connectivity"];
  serverReachable: ReturnType<typeof useSyncEngine>["serverReachable"];
  pendingCount: number;
  conflictCount: number;
  syncing: boolean;
}): string {
  const { connectivity, serverReachable, pendingCount, conflictCount, syncing } = input;
  if (connectivity === "offline") {
    return pendingCount > 0 ? `Offline · ${pendingCount} queued` : "Offline";
  }
  if (connectivity === "token-expired") return "Login expired";
  if (serverReachable === false) return "Server not responding";
  if (conflictCount > 0) return `${conflictCount} conflict${conflictCount === 1 ? "" : "s"} need review`;
  if (syncing) return "Sending changes…";
  if (pendingCount > 0) return `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting`;
  return "Connected · all confirmed";
}

export default function SyncCenterConnectivitySection() {
  const { connectivity, serverReachable, pendingCount, conflictCount, syncing, lastSyncAt } = useSyncEngine();
  const [open, setOpen] = useState(readSectionOpen);
  const [showingCachedData, setShowingCachedData] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(SECTION_STORAGE_KEY, String(open));
    } catch {
      // ignore
    }
  }, [open]);

  useEffect(() => {
    const markCached = () => setShowingCachedData(true);
    const markConfirmed = () => setShowingCachedData(false);
    window.addEventListener("repo:assets:fetch-failed", markCached);
    window.addEventListener("repo:projects:fetch-failed", markCached);
    window.addEventListener("repo:issues:fetch-failed", markCached);
    window.addEventListener("repo:assets:updated", markConfirmed);
    window.addEventListener("repo:projects:updated", markConfirmed);
    window.addEventListener("repo:issues:updated", markConfirmed);
    return () => {
      window.removeEventListener("repo:assets:fetch-failed", markCached);
      window.removeEventListener("repo:projects:fetch-failed", markCached);
      window.removeEventListener("repo:issues:fetch-failed", markCached);
      window.removeEventListener("repo:assets:updated", markConfirmed);
      window.removeEventListener("repo:projects:updated", markConfirmed);
      window.removeEventListener("repo:issues:updated", markConfirmed);
    };
  }, []);

  const summary = sectionSummary({ connectivity, serverReachable, pendingCount, conflictCount, syncing });
  const chipCount = buildConnectivityStatusChips({
    connectivity,
    serverReachable,
    pendingCount,
    conflictCount,
    syncing,
    lastSyncAt,
    showingCachedData,
  }).length;

  return (
    <Box
      sx={{
        mb: 2,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        bgcolor: "rgba(255,255,255,0.02)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
          Network & sync status
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "45%" }}>
          {summary}
        </Typography>
        <IconButton
          size="small"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse network status" : "Expand network status"}
          sx={{ p: 0.25 }}
        >
          {open ? <ExpandLessOutlinedIcon sx={{ fontSize: 18 }} /> : <ExpandMoreOutlinedIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Stack spacing={0} sx={{ pt: 1.25 }}>
          <ConnectivityStatusChips visible={open} />
          {chipCount === 0 && (
            <Typography variant="caption" color="text.secondary">
              No status signals right now.
            </Typography>
          )}
          <SyncTelemetryPanel
            enabled={open}
            embedded
            defaultOpen={false}
            persistKey="sync-telemetry-panel-open"
          />
        </Stack>
      </Collapse>
    </Box>
  );
}
