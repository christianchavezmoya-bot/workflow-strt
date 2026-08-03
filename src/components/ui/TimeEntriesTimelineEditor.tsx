import { useCallback, useMemo, useRef, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import type { RunTimeEntry } from "../../types/assetWorkflowRun";
import { formatInstant } from "../../utils/datetime";
import { formatDuration } from "../../utils/timelineModel";

interface Props {
  entries: RunTimeEntry[];
  timeZoneId?: string | null;
  nowIso: string;
  readOnly?: boolean;
  onChange: (entries: RunTimeEntry[]) => void;
}

const TRACK_HEIGHT = 36;
const HANDLE_WIDTH = 8;
const MIN_SEGMENT_MS = 60_000;
const COLORS = { productive: "#2e9b5e", downtime: "#d79b24", break: "#c2ccd6" };

type DragState = {
  entryId: string;
  edge: "start" | "end";
  pointerId: number;
};

function toMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function clampMs(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapMinute(ms: number): number {
  return Math.round(ms / MIN_SEGMENT_MS) * MIN_SEGMENT_MS;
}

/** Sorted segments with resolved end times for layout. */
function layoutSegments(entries: RunTimeEntry[], nowIso: string) {
  return [...entries]
    .filter((e) => e.startedAtUtc)
    .map((e) => ({
      entry: e,
      startMs: toMs(e.startedAtUtc),
      endMs: toMs(e.endedAtUtc ?? nowIso),
    }))
    .filter((s) => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

export default function TimeEntriesTimelineEditor({
  entries,
  timeZoneId,
  nowIso,
  readOnly = false,
  onChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const segments = useMemo(() => layoutSegments(entries, nowIso), [entries, nowIso]);

  const bounds = useMemo(() => {
    if (segments.length === 0) return null;
    const startMs = segments[0].startMs;
    const endMs = Math.max(...segments.map((s) => s.endMs));
    const spanMs = Math.max(endMs - startMs, MIN_SEGMENT_MS);
    return { startMs, endMs, spanMs };
  }, [segments]);

  const totals = useMemo(() => {
    let productive = 0;
    let downtime = 0;
    for (const s of segments) {
      const secs = Math.round((s.endMs - s.startMs) / 1000);
      if (s.entry.category === "downtime") downtime += secs;
      else productive += secs;
    }
    return { productive, downtime, elapsed: bounds ? Math.round(bounds.spanMs / 1000) : 0 };
  }, [segments, bounds]);

  const pxPerMs = 0.00008; // ~288px per hour
  const timelineWidth = bounds ? Math.max(bounds.spanMs * pxPerMs, 480) : 480;

  const msToX = useCallback(
    (ms: number) => (bounds ? (ms - bounds.startMs) * pxPerMs : 0),
    [bounds, pxPerMs],
  );

  const xToMs = useCallback(
    (x: number) => (bounds ? bounds.startMs + x / pxPerMs : 0),
    [bounds, pxPerMs],
  );

  const applyBoundaryMove = useCallback(
    (entryId: string, edge: "start" | "end", targetMs: number) => {
      const sorted = layoutSegments(entries, nowIso);
      const idx = sorted.findIndex((s) => s.entry.id === entryId);
      if (idx < 0 || !bounds) return;

      const seg = sorted[idx];
      const prev = sorted[idx - 1];
      const next = sorted[idx + 1];

      let newStart = seg.startMs;
      let newEnd = seg.endMs;

      if (edge === "start") {
        const minStart = prev ? prev.endMs : bounds.startMs;
        const maxStart = seg.endMs - MIN_SEGMENT_MS;
        newStart = snapMinute(clampMs(targetMs, minStart, maxStart));
        if (prev) {
          onChange(
            entries.map((e) => {
              if (e.id === entryId) return { ...e, startedAtUtc: new Date(newStart).toISOString() };
              if (e.id === prev.entry.id) return { ...e, endedAtUtc: new Date(newStart).toISOString() };
              return e;
            }),
          );
          return;
        }
        onChange(
          entries.map((e) =>
            e.id === entryId ? { ...e, startedAtUtc: new Date(newStart).toISOString() } : e,
          ),
        );
        return;
      }

      const minEnd = seg.startMs + MIN_SEGMENT_MS;
      const maxEnd = next ? next.startMs : bounds.endMs;
      newEnd = snapMinute(clampMs(targetMs, minEnd, maxEnd));
      if (next) {
        onChange(
          entries.map((e) => {
            if (e.id === entryId) return { ...e, endedAtUtc: new Date(newEnd).toISOString() };
            if (e.id === next.entry.id) return { ...e, startedAtUtc: new Date(newEnd).toISOString() };
            return e;
          }),
        );
        return;
      }
      onChange(
        entries.map((e) =>
          e.id === entryId ? { ...e, endedAtUtc: new Date(newEnd).toISOString() } : e,
        ),
      );
    },
    [bounds, entries, nowIso, onChange],
  );

  const onPointerDown = (entryId: string, edge: "start" | "end") => (event: React.PointerEvent) => {
    if (readOnly) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ entryId, edge, pointerId: event.pointerId });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || !containerRef.current || !bounds) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left + scrollLeft;
    applyBoundaryMove(drag.entryId, drag.edge, xToMs(x));
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (!drag) return;
    (event.target as HTMLElement).releasePointerCapture(drag.pointerId);
    setDrag(null);
  };

  if (!bounds || segments.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic", py: 1, px: 2.5 }}>
        No time entries to show on the timeline.
      </Typography>
    );
  }

  const boundaryMs = new Set<number>();
  segments.forEach((s) => {
    boundaryMs.add(s.startMs);
    boundaryMs.add(s.endMs);
  });
  const boundaries = [...boundaryMs].sort((a, b) => a - b);

  return (
    <Box sx={{ px: 2.5, py: 2 }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} sx={{ mb: 1.5 }}>
        <Stat label="Start" value={formatInstant(new Date(bounds.startMs).toISOString(), timeZoneId, { withZone: false })} />
        <Stat label="Finish" value={formatInstant(new Date(bounds.endMs).toISOString(), timeZoneId, { withZone: false })} />
        <Stat label="Productive" value={formatDuration(totals.productive)} color={COLORS.productive} />
        <Stat label="Downtime" value={formatDuration(totals.downtime)} color={COLORS.downtime} />
      </Stack>

      {!readOnly && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Drag segment edges to adjust times. Scroll horizontally to pan the timeline.
        </Typography>
      )}

      <Box
        ref={containerRef}
        onScroll={(e) => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        sx={{
          overflowX: "auto",
          overflowY: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.default",
          cursor: drag ? "col-resize" : "default",
          userSelect: "none",
        }}
      >
        <Box sx={{ position: "relative", width: timelineWidth + 32, minHeight: TRACK_HEIGHT * 2 + 48, px: 2, py: 1 }}>
          {/* Time axis labels */}
          <Box sx={{ position: "relative", height: 20, mb: 0.5 }}>
            {boundaries.map((ms) => (
              <Typography
                key={ms}
                variant="caption"
                color="text.secondary"
                sx={{
                  position: "absolute",
                  left: msToX(ms),
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  fontSize: "0.65rem",
                }}
              >
                {formatInstant(new Date(ms).toISOString(), timeZoneId, { date: false, time: true, withZone: false })}
              </Typography>
            ))}
          </Box>

          {/* Productive track */}
          <TrackRow label="Productive" color={COLORS.productive} />
          <Box sx={{ position: "relative", height: TRACK_HEIGHT, mb: 0.5 }}>
            {segments
              .filter((s) => s.entry.category === "productive")
              .map((s) => (
                <SegmentBlock
                  key={s.entry.id}
                  left={msToX(s.startMs)}
                  width={Math.max(msToX(s.endMs) - msToX(s.startMs), 4)}
                  color={COLORS.productive}
                  label={s.entry.reason ?? "Productive"}
                  readOnly={readOnly}
                  onPointerDownStart={onPointerDown(s.entry.id, "start")}
                  onPointerDownEnd={onPointerDown(s.entry.id, "end")}
                />
              ))}
          </Box>

          {/* Downtime track */}
          <TrackRow label="Downtime" color={COLORS.downtime} />
          <Box sx={{ position: "relative", height: TRACK_HEIGHT }}>
            {segments
              .filter((s) => s.entry.category === "downtime")
              .map((s) => (
                <SegmentBlock
                  key={s.entry.id}
                  left={msToX(s.startMs)}
                  width={Math.max(msToX(s.endMs) - msToX(s.startMs), 4)}
                  color={COLORS.downtime}
                  label={s.entry.reason ?? "Downtime"}
                  readOnly={readOnly}
                  onPointerDownStart={onPointerDown(s.entry.id, "start")}
                  onPointerDownEnd={onPointerDown(s.entry.id, "end")}
                />
              ))}
          </Box>

          {/* Shared boundary guides */}
          {boundaries.map((ms) => (
            <Box
              key={`guide-${ms}`}
              sx={{
                position: "absolute",
                top: 24,
                left: msToX(ms),
                width: 0,
                height: TRACK_HEIGHT * 2 + 8,
                borderLeft: "1px dashed",
                borderColor: "rgba(255,255,255,0.12)",
                pointerEvents: "none",
              }}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function TrackRow({ label, color }: { label: string; color: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: color }} />
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
    </Stack>
  );
}

function SegmentBlock({
  left,
  width,
  color,
  label,
  readOnly,
  onPointerDownStart,
  onPointerDownEnd,
}: {
  left: number;
  width: number;
  color: string;
  label: string;
  readOnly?: boolean;
  onPointerDownStart: (e: React.PointerEvent) => void;
  onPointerDownEnd: (e: React.PointerEvent) => void;
}) {
  return (
    <Box
      title={label}
      sx={{
        position: "absolute",
        left,
        width,
        height: "100%",
        bgcolor: color,
        borderRadius: 0.75,
        opacity: 0.92,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Typography variant="caption" sx={{ color: "#fff", fontSize: "0.65rem", px: 0.5, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
        {label}
      </Typography>
      {!readOnly && (
        <>
          <Box
            onPointerDown={onPointerDownStart}
            sx={{
              position: "absolute",
              left: 0,
              top: 0,
              width: HANDLE_WIDTH,
              height: "100%",
              cursor: "col-resize",
              bgcolor: "rgba(0,0,0,0.15)",
            }}
          />
          <Box
            onPointerDown={onPointerDownEnd}
            sx={{
              position: "absolute",
              right: 0,
              top: 0,
              width: HANDLE_WIDTH,
              height: "100%",
              cursor: "col-resize",
              bgcolor: "rgba(0,0,0,0.15)",
            }}
          />
        </>
      )}
    </Box>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, color: color ?? "text.primary" }}>
        {value}
      </Typography>
    </Box>
  );
}
