import { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { datetimeLocalInZoneToUtc } from "../../utils/datetime";

const ITEM_HEIGHT = 36;

interface Props {
  label: string;
  /** Minutes from midnight (0–1439). */
  valueMinutes: number;
  onChange: (minutes: number) => void;
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")} ${ap}`;
}

/** Vertical scroll wheel for picking a wall-clock time (15-min steps). */
export default function TimeWheelPicker({ label, valueMinutes, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const steps = Array.from({ length: 96 }, (_, i) => i * 15);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, steps.findIndex((s) => s === Math.round(valueMinutes / 15) * 15));
    el.scrollTop = idx * ITEM_HEIGHT;
  }, [valueMinutes, steps]);

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: "block", mb: 0.5, textAlign: "center" }}>
        {label}
      </Typography>
      <Box
        ref={ref}
        onScroll={() => {
          const el = ref.current;
          if (!el) return;
          const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
          const clamped = steps[Math.min(Math.max(idx, 0), steps.length - 1)];
          if (clamped !== valueMinutes) onChange(clamped);
        }}
        sx={{
          height: ITEM_HEIGHT * 5,
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.default",
          "&::-webkit-scrollbar": { width: 4 },
        }}
      >
        <Box sx={{ height: ITEM_HEIGHT * 2 }} />
        {steps.map((m) => (
          <Box
            key={m}
            sx={{
              height: ITEM_HEIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              scrollSnapAlign: "center",
              bgcolor: m === Math.round(valueMinutes / 15) * 15 ? "action.selected" : "transparent",
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" fontWeight={m === Math.round(valueMinutes / 15) * 15 ? 700 : 400}>
              {formatMinutes(m)}
            </Typography>
          </Box>
        ))}
        <Box sx={{ height: ITEM_HEIGHT * 2 }} />
      </Box>
    </Box>
  );
}

export function utcIsoToMinutesInZone(isoUtc: string, timeZoneId?: string | null): number {
  try {
    const d = new Date(isoUtc);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZoneId || "UTC",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h * 60 + m;
  } catch {
    const d = new Date(isoUtc);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

export function applyMinutesInZoneToUtcIso(
  baseIsoUtc: string,
  minutesFromMidnight: number,
  timeZoneId?: string | null,
): string {
  const base = new Date(baseIsoUtc);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZoneId || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const datePart = fmt.format(base);
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  const localStr = `${datePart}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  return datetimeLocalInZoneToUtc(localStr, timeZoneId);
}
