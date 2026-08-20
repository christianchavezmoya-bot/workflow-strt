import { Typography } from "@mui/material";
import type { StepInput } from "../../types/workflow";
import { isMobileNativePlatform } from "../../utils/platform";

export const runnerDialogContentSx = {
  overflowX: "hidden",
  overflowY: isMobileNativePlatform() ? "auto" : undefined,
  overscrollBehavior: isMobileNativePlatform() ? "contain" : undefined,
  flex: isMobileNativePlatform() ? 1 : undefined,
  minHeight: isMobileNativePlatform() ? 0 : undefined,
  px: isMobileNativePlatform() ? 1.5 : 3,
} as const;

export const runnerBodyStackSx = {
  mt: 1,
  maxWidth: "100%",
  minWidth: 0,
} as const;

export const runnerSummaryDialogActionsSx = {
  flexDirection: isMobileNativePlatform() ? "column" : "row",
  alignItems: isMobileNativePlatform() ? "stretch" : "center",
  justifyContent: "space-between",
  gap: isMobileNativePlatform() ? 0.75 : 0,
  px: isMobileNativePlatform() ? 1.5 : 2,
  py: isMobileNativePlatform() ? 1 : 1,
  position: "sticky",
  bottom: 0,
  zIndex: 1,
  bgcolor: "background.paper",
  borderTop: "1px solid",
  borderColor: "divider",
  ...(isMobileNativePlatform()
    ? { pb: `calc(12px + env(safe-area-inset-bottom, 0px))` }
    : {}),
} as const;

export function renderAssetIdentifier(assetTag?: string) {
  if (!assetTag?.trim()) return null;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
      Asset ID: {assetTag}
    </Typography>
  );
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function countStoredMediaItems(value: string): number {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function formatSummaryInputValue(input: StepInput, value: string): string {
  if (input.type === "checkbox") return value === "true" ? "Yes" : "No";
  if (input.type === "photo") {
    const count = countStoredMediaItems(value);
    return `${count} photo${count === 1 ? "" : "s"} attached`;
  }
  if (input.type === "video") {
    const count = countStoredMediaItems(value);
    return `${count} video${count === 1 ? "" : "s"} attached`;
  }
  if (input.type === "signature") return "Signature captured";
  if (input.type === "component") {
    try {
      const parsed = JSON.parse(value) as Record<string, string>;
      const completed = Object.values(parsed ?? {}).filter(Boolean).length;
      return `${completed} field${completed === 1 ? "" : "s"} completed`;
    } catch {
      return "Component data captured";
    }
  }
  return value;
}

export type RunTimeEntry = {
  id: string;
  category: "productive" | "downtime";
  startedAtUtc: string;
  endedAtUtc?: string | null;
  reason?: string | null;
};

export function parseRunTimeEntries(json: string): RunTimeEntry[] {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>[];
    if (!Array.isArray(raw)) return [];
    return raw.map((e) => ({
      id: String(e.id ?? e.Id ?? ""),
      category: String(e.category ?? e.Category ?? "productive") as "productive" | "downtime",
      startedAtUtc: String(e.startedAtUtc ?? e.StartedAtUtc ?? ""),
      endedAtUtc: (e.endedAtUtc ?? e.EndedAtUtc ?? null) as string | null,
      reason: (e.reason ?? e.Reason ?? null) as string | null,
    }));
  } catch {
    return [];
  }
}
