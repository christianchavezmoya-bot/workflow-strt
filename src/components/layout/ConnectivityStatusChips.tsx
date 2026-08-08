/**
 * ConnectivityStatusChips — read-only status pills for connectivity/sync state.
 * Shared by Sync Center (native). Does not include perf markers; see ConnectivityPerfReadout.
 */
import { Stack, Tooltip, Typography } from "@mui/material";
import WifiOutlinedIcon from "@mui/icons-material/WifiOutlined";
import WifiOffOutlinedIcon from "@mui/icons-material/WifiOffOutlined";
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined";
import CloudSyncOutlinedIcon from "@mui/icons-material/CloudSyncOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import LockClockOutlinedIcon from "@mui/icons-material/LockClockOutlined";
import { useEffect, useState } from "react";
import { useSyncEngine } from "../../hooks/useSyncEngine";

export type ConnectivityChip = {
  key: string;
  label: string;
  tooltip: string;
  icon: React.ReactElement;
  tone: "neutral" | "warning" | "danger" | "info" | "success";
};

export const TONE_COLORS: Record<ConnectivityChip["tone"], { bg: string; fg: string }> = {
  neutral: { bg: "rgba(148,163,184,0.16)", fg: "#94a3b8" },
  warning: { bg: "rgba(245,158,11,0.16)", fg: "#f59e0b" },
  danger: { bg: "rgba(239,68,68,0.16)", fg: "#ef4444" },
  info: { bg: "rgba(59,130,246,0.16)", fg: "#3b82f6" },
  success: { bg: "rgba(34,197,94,0.16)", fg: "#22c55e" },
};

function timeAgoShort(date: Date | null): string {
  if (!date) return "never";
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function buildConnectivityStatusChips(input: {
  connectivity: ReturnType<typeof useSyncEngine>["connectivity"];
  serverReachable: ReturnType<typeof useSyncEngine>["serverReachable"];
  pendingCount: number;
  conflictCount: number;
  syncing: boolean;
  lastSyncAt: Date | null;
  showingCachedData: boolean;
}): ConnectivityChip[] {
  const {
    connectivity,
    serverReachable,
    pendingCount,
    conflictCount,
    syncing,
    lastSyncAt,
    showingCachedData,
  } = input;

  const chips: ConnectivityChip[] = [];

  if (connectivity === "offline") {
    chips.push({
      key: "radio",
      label: "No signal",
      tooltip: "Phone has no WiFi or cellular connection right now.",
      icon: <WifiOffOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "danger",
    });
  } else {
    chips.push({
      key: "radio",
      label: "Has signal",
      tooltip: "Phone currently has WiFi or cellular connection.",
      icon: <WifiOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "neutral",
    });
  }

  if (serverReachable === false) {
    chips.push({
      key: "server",
      label: "Server not responding",
      tooltip: "Phone has signal, but the last background check could not reach the server.",
      icon: <DnsOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "danger",
    });
  } else if (connectivity === "server-unreachable") {
    chips.push({
      key: "server",
      label: "Waiting for server…",
      tooltip: "Phone has signal. Checking whether the field server is reachable before syncing.",
      icon: <DnsOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "warning",
    });
  } else if (serverReachable === true) {
    chips.push({
      key: "server",
      label: "Server reachable",
      tooltip: "The last background check successfully reached the server.",
      icon: <DnsOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "success",
    });
  }

  if (connectivity === "token-expired") {
    chips.push({
      key: "auth",
      label: "Login expired",
      tooltip: "Your session needs you to log in again before anything else can sync.",
      icon: <LockClockOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "warning",
    });
  }

  if (syncing) {
    chips.push({
      key: "syncing",
      label: "Sending changes now",
      tooltip: "Actively uploading queued changes to the server right now.",
      icon: <CloudSyncOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "info",
    });
  }

  if (pendingCount > 0) {
    chips.push({
      key: "pending",
      label: `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to send`,
      tooltip: "These changes are saved on the phone but have not been confirmed by the server yet.",
      icon: <HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "warning",
    });
  }

  if (conflictCount > 0) {
    chips.push({
      key: "conflict",
      label: `${conflictCount} conflict${conflictCount === 1 ? "" : "s"} need review`,
      tooltip: "Someone else changed this data while you were offline. Resolve below in this screen.",
      icon: <WarningAmberOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "danger",
    });
  }

  if (showingCachedData) {
    chips.push({
      key: "cached",
      label: "Showing saved data, not confirmed",
      tooltip: "The data on screen came from the phone's local copy because the last attempt to confirm it with the server failed.",
      icon: <DescriptionOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "warning",
    });
  }

  if (
    chips.length === 1 &&
    serverReachable &&
    connectivity !== "offline" &&
    connectivity !== "token-expired" &&
    pendingCount === 0 &&
    !syncing &&
    conflictCount === 0 &&
    !showingCachedData
  ) {
    chips.push({
      key: "settled",
      label: `All confirmed · ${timeAgoShort(lastSyncAt)}`,
      tooltip: "Everything is connected, sent, and confirmed by the server.",
      icon: <CheckCircleOutlinedIcon sx={{ fontSize: 14 }} />,
      tone: "success",
    });
  }

  return chips;
}

export function ConnectivityChipPill({ chip }: { chip: ConnectivityChip }) {
  return (
    <Tooltip title={chip.tooltip}>
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        sx={{
          bgcolor: TONE_COLORS[chip.tone].bg,
          color: TONE_COLORS[chip.tone].fg,
          borderRadius: 999,
          px: 1,
          py: 0.25,
        }}
      >
        {chip.icon}
        <Typography sx={{ fontSize: "0.68rem", fontWeight: 600, whiteSpace: "nowrap" }}>
          {chip.label}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

interface Props {
  /** When false, chips are not rendered (e.g. parent section collapsed). Hooks still run. */
  visible?: boolean;
}

export default function ConnectivityStatusChips({ visible = true }: Props) {
  const { connectivity, serverReachable, pendingCount, conflictCount, syncing, lastSyncAt } = useSyncEngine();
  const [showingCachedData, setShowingCachedData] = useState(false);
  const [, forceTick] = useState(0);

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

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const chips = buildConnectivityStatusChips({
    connectivity,
    serverReachable,
    pendingCount,
    conflictCount,
    syncing,
    lastSyncAt,
    showingCachedData,
  });

  if (!visible) return null;

  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
      {chips.map((chip) => (
        <ConnectivityChipPill key={chip.key} chip={chip} />
      ))}
    </Stack>
  );
}
