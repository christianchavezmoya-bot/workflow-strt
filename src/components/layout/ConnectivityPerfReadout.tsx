/**
 * ConnectivityPerfReadout — offline navigation perf chip for Diagnostics.
 */
import { Stack, Tooltip, Typography } from "@mui/material";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import { useEffect, useState } from "react";
import {
  formatOfflinePerfEntry,
  getInteractiveReadyMs,
  getRecentOfflinePerfMarkers,
} from "../../utils/offlinePerf";
import { ConnectivityChipPill, type ConnectivityChip } from "./ConnectivityStatusChips";

export default function ConnectivityPerfReadout() {
  const [interactiveReadyMs, setInteractiveReadyMs] = useState<number | null>(null);
  const [recentPerfMarkers, setRecentPerfMarkers] = useState<string[]>([]);

  const refreshPerfReadout = () => {
    setInteractiveReadyMs(getInteractiveReadyMs());
    setRecentPerfMarkers(getRecentOfflinePerfMarkers(5).map(formatOfflinePerfEntry));
  };

  useEffect(() => {
    refreshPerfReadout();
    const onPerf = () => refreshPerfReadout();
    window.addEventListener("offline-perf", onPerf);
    return () => window.removeEventListener("offline-perf", onPerf);
  }, []);

  const openMsLabel = interactiveReadyMs != null ? `${interactiveReadyMs}ms` : "—";
  const perfTooltip = recentPerfMarkers.length
    ? `navigation_start → interactive_ready: ${openMsLabel}\n\nRecent markers:\n${recentPerfMarkers.join("\n")}`
    : `navigation_start → interactive_ready: ${openMsLabel}\n\nOpen a workflow to record markers.`;

  const chip: ConnectivityChip = {
    key: "open-perf",
    label: `Open: ${openMsLabel}`,
    tooltip: perfTooltip,
    icon: <SpeedOutlinedIcon sx={{ fontSize: 14 }} />,
    tone: interactiveReadyMs != null && interactiveReadyMs <= 1000 ? "success" : "info",
  };

  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        Workflow open time (navigation_start → interactive_ready)
      </Typography>
      <ConnectivityChipPill chip={chip} />
      {recentPerfMarkers.length > 0 && (
        <Stack spacing={0.25}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Recent markers
          </Typography>
          {recentPerfMarkers.map((marker) => (
            <Typography key={marker} variant="caption" sx={{ fontFamily: "monospace", fontSize: "0.65rem" }}>
              {marker}
            </Typography>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
