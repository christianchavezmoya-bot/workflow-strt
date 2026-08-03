import { useCallback, useMemo, useRef, useState } from "react";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { ZoomInOutlined, ZoomOutOutlined } from "@mui/icons-material";
import type { RunTimeEntry } from "../../types/assetWorkflowRun";
import { formatInstant, zoneAbbreviation } from "../../utils/datetime";
import { formatDuration } from "../../utils/timelineModel";
import SegmentTimeEditorDialog from "./SegmentTimeEditorDialog";

interface Props {
  entries: RunTimeEntry[];
  timeZoneId?: string | null;
  nowIso: string;
  readOnly?: boolean;
  onChange: (entries: RunTimeEntry[]) => void;
}

const TRACK_HEIGHT = 44;
const HANDLE_WIDTH = 10;
const MIN_SEGMENT_MS = 60_000;
const BASE_PX_PER_HOUR = 120;
const COLORS = { productive: "#2e9b5e", downtime: "#d79b24" };

type DragMode =
  | { kind: "resize"; entryId: string; edge: "start" | "end"; pointerId: number; startX: number }
  | { kind: "move"; entryId: string; pointerId: number; startX: number; origStartMs: number; origEndMs: number };

function toMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function snapMinute(ms: number): number {
  return Math.round(ms / MIN_SEGMENT_MS) * MIN_SEGMENT_MS;
}

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
  const [zoom, setZoom] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [wheelEntry, setWheelEntry] = useState<RunTimeEntry | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressEntryId = useRef<string | null>(null);

  const segments = useMemo(() => layoutSegments(entries, nowIso), [entries, nowIso]);

  const bounds = useMemo(() => {
    if (segments.length === 0) return null;
    const startMs = segments[0].startMs;
    const endMs = Math.max(...segments.map((s) => s.endMs));
    const spanMs = Math.max(endMs - startMs, MIN_SEGMENT_MS * 2);
    const padMs = Math.max(spanMs * 0.15, MIN_SEGMENT_MS * 5);
    return { startMs: startMs - padMs, endMs: endMs + padMs, spanMs: spanMs + padMs * 2 };
  }, [segments]);

  const pxPerMs = bounds ? (BASE_PX_PER_HOUR / 3_600_000) * zoom : 0;
  const timelineWidth = bounds ? Math.max(bounds.spanMs * pxPerMs, 320) : 320;

  const totals = useMemo(() => {
    let productive = 0;
    let downtime = 0;
    for (const s of segments) {
      const secs = Math.round((s.endMs - s.startMs) / 1000);
      if (s.entry.category === "downtime") downtime += secs;
      else productive += secs;
    }
    return { productive, downtime };
  }, [segments]);

  const msToX = useCallback((ms: number) => (bounds ? (ms - bounds.startMs) * pxPerMs : 0), [bounds, pxPerMs]);
  const xToMs = useCallback((x: number) => (bounds ? bounds.startMs + x / pxPerMs : 0), [bounds, pxPerMs]);

  const updateEntry = useCallback(
    (entryId: string, patch: Partial<RunTimeEntry>) => {
      onChange(entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)));
    },
    [entries, onChange],
  );

  const applyResize = useCallback(
    (entryId: string, edge: "start" | "end", targetMs: number) => {
      const sorted = layoutSegments(entries, nowIso);
      const idx = sorted.findIndex((s) => s.entry.id === entryId);
      if (idx < 0 || !bounds) return;
      const seg = sorted[idx];
      const prev = sorted[idx - 1];
      const next = sorted[idx + 1];

      if (edge === "start") {
        const minStart = prev ? prev.endMs : bounds.startMs;
        const maxStart = seg.endMs - MIN_SEGMENT_MS;
        const newStart = snapMinute(Math.min(Math.max(targetMs, minStart), maxStart));
        if (prev) {
          onChange(
            entries.map((e) => {
              if (e.id === entryId) return { ...e, startedAtUtc: new Date(newStart).toISOString() };
              if (e.id === prev.entry.id) return { ...e, endedAtUtc: new Date(newStart).toISOString() };
              return e;
            }),
          );
        } else {
          updateEntry(entryId, { startedAtUtc: new Date(newStart).toISOString() });
        }
        return;
      }

      const minEnd = seg.startMs + MIN_SEGMENT_MS;
      const maxEnd = next ? next.startMs : bounds.endMs;
      const newEnd = snapMinute(Math.min(Math.max(targetMs, minEnd), maxEnd));
      if (next) {
        onChange(
          entries.map((e) => {
            if (e.id === entryId) return { ...e, endedAtUtc: new Date(newEnd).toISOString() };
            if (e.id === next.entry.id) return { ...e, startedAtUtc: new Date(newEnd).toISOString() };
            return e;
          }),
        );
      } else {
        updateEntry(entryId, { endedAtUtc: new Date(newEnd).toISOString() });
      }
    },
    [bounds, entries, nowIso, onChange, updateEntry],
  );

  const applyMove = useCallback(
    (entryId: string, origStartMs: number, origEndMs: number, deltaMs: number) => {
      const duration = origEndMs - origStartMs;
      let newStart = snapMinute(origStartMs + deltaMs);
      let newEnd = newStart + duration;
      if (!bounds) return;
      if (newStart < bounds.startMs) {
        newStart = bounds.startMs;
        newEnd = newStart + duration;
      }
      if (newEnd > bounds.endMs) {
        newEnd = bounds.endMs;
        newStart = newEnd - duration;
      }
      updateEntry(entryId, {
        startedAtUtc: new Date(newStart).toISOString(),
        endedAtUtc: new Date(newEnd).toISOString(),
      });
    },
    [bounds, updateEntry],
  );

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left + scrollLeft;
    if (drag.kind === "resize") {
      applyResize(drag.entryId, drag.edge, xToMs(x));
    } else {
      const deltaMs = xToMs(x) - xToMs(drag.startX);
      applyMove(drag.entryId, drag.origStartMs, drag.origEndMs, deltaMs);
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!drag) return;
    try {
      (event.target as HTMLElement).releasePointerCapture(drag.pointerId);
    } catch { /* ignore */ }
    setDrag(null);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    longPressEntryId.current = null;
  };

  const startLongPress = (entry: RunTimeEntry) => {
    if (readOnly) return;
    clearLongPress();
    longPressEntryId.current = entry.id;
    longPressTimer.current = setTimeout(() => {
      setWheelEntry(entry);
      clearLongPress();
    }, 2000);
  };

  const axisTicks = useMemo(() => {
    if (!bounds) return [];
    const ticks: number[] = [];
    const stepMs = zoom >= 2 ? MIN_SEGMENT_MS * 15 : zoom >= 1 ? MIN_SEGMENT_MS * 30 : MIN_SEGMENT_MS * 60;
    let t = Math.ceil(bounds.startMs / stepMs) * stepMs;
    while (t <= bounds.endMs) {
      ticks.push(t);
      t += stepMs;
    }
    return ticks;
  }, [bounds, zoom]);

  if (!bounds || segments.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic", py: 1, px: 2.5 }}>
        No time entries to show on the timeline.
      </Typography>
    );
  }

  const zoneLabel = timeZoneId ? zoneAbbreviation(timeZoneId) : "UTC";

  return (
    <Box sx={{ px: 2.5, py: 2 }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} alignItems="flex-end" sx={{ mb: 1.5 }}>
        <Stat label="Start" value={formatInstant(new Date(segments[0].startMs).toISOString(), timeZoneId, { withZone: true })} />
        <Stat label="Finish" value={formatInstant(new Date(segments[segments.length - 1].endMs).toISOString(), timeZoneId, { withZone: true })} />
        <Stat label="Productive" value={formatDuration(totals.productive)} color={COLORS.productive} />
        <Stat label="Downtime" value={formatDuration(totals.downtime)} color={COLORS.downtime} />
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: "auto" }}>
          <Tooltip title="Zoom out">
            <span>
              <IconButton size="small" disabled={zoom <= 0.25} onClick={() => setZoom((z) => Math.max(0.25, z / 1.5))}>
                <ZoomOutOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <Tooltip title="Zoom in">
            <span>
              <IconButton size="small" disabled={zoom >= 8} onClick={() => setZoom((z) => Math.min(8, z * 1.5))}>
                <ZoomInOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {!readOnly && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Drag edges to resize · drag segment body to move · hold 2s for time wheels · scroll to pan · times in {zoneLabel}
        </Typography>
      )}

      <Box
        ref={containerRef}
        onScroll={(e) => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        sx={{
          overflowX: "auto",
          overflowY: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.default",
          cursor: drag?.kind === "move" ? "grabbing" : drag ? "col-resize" : "default",
          userSelect: "none",
          touchAction: "pan-x",
        }}
      >
        <Box sx={{ position: "relative", width: timelineWidth + 48, minHeight: TRACK_HEIGHT * 2 + 56, px: 3, py: 1.5 }}>
          <Box sx={{ position: "relative", height: 22, mb: 0.5 }}>
            {axisTicks.map((ms) => (
              <Typography
                key={ms}
                variant="caption"
                color="text.secondary"
                sx={{
                  position: "absolute",
                  left: msToX(ms),
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  fontSize: "0.68rem",
                }}
              >
                {formatInstant(new Date(ms).toISOString(), timeZoneId, { date: false, time: true, withZone: false })}
              </Typography>
            ))}
          </Box>

          {(["productive", "downtime"] as const).map((cat) => (
            <Box key={cat} sx={{ mb: 0.75 }}>
              <TrackRow label={cat === "productive" ? "Productive" : "Downtime"} color={COLORS[cat]} />
              <Box sx={{ position: "relative", height: TRACK_HEIGHT }}>
                {segments
                  .filter((s) => s.entry.category === cat)
                  .map((s) => {
                    const left = msToX(s.startMs);
                    const width = Math.max(msToX(s.endMs) - left, 24);
                    return (
                      <SegmentBlock
                        key={s.entry.id}
                        left={left}
                        width={width}
                        color={COLORS[cat]}
                        label={s.entry.reason ?? (cat === "productive" ? "Productive" : "Downtime")}
                        duration={formatDuration(Math.round((s.endMs - s.startMs) / 1000))}
                        readOnly={readOnly}
                        onResizeStart={(e) => {
                          e.stopPropagation();
                          (e.target as HTMLElement).setPointerCapture(e.pointerId);
                          setDrag({ kind: "resize", entryId: s.entry.id, edge: "start", pointerId: e.pointerId, startX: 0 });
                        }}
                        onResizeEnd={(e) => {
                          e.stopPropagation();
                          (e.target as HTMLElement).setPointerCapture(e.pointerId);
                          setDrag({ kind: "resize", entryId: s.entry.id, edge: "end", pointerId: e.pointerId, startX: 0 });
                        }}
                        onMoveStart={(e) => {
                          if (readOnly) return;
                          const rect = containerRef.current!.getBoundingClientRect();
                          const x = e.clientX - rect.left + scrollLeft;
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setDrag({
                            kind: "move",
                            entryId: s.entry.id,
                            pointerId: e.pointerId,
                            startX: x,
                            origStartMs: s.startMs,
                            origEndMs: s.endMs,
                          });
                        }}
                        onLongPressStart={() => startLongPress(s.entry)}
                        onLongPressEnd={clearLongPress}
                      />
                    );
                  })}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <SegmentTimeEditorDialog
        open={Boolean(wheelEntry)}
        entry={wheelEntry}
        timeZoneId={timeZoneId}
        nowIso={nowIso}
        onClose={() => setWheelEntry(null)}
        onSave={(updated) => {
          onChange(entries.map((e) => (e.id === updated.id ? updated : e)));
          setWheelEntry(null);
        }}
      />
    </Box>
  );
}

function TrackRow({ label, color }: { label: string; color: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: color }} />
      <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
    </Stack>
  );
}

function SegmentBlock({
  left, width, color, label, duration, readOnly,
  onResizeStart, onResizeEnd, onMoveStart, onLongPressStart, onLongPressEnd,
}: {
  left: number; width: number; color: string; label: string; duration: string; readOnly?: boolean;
  onResizeStart: (e: React.PointerEvent) => void;
  onResizeEnd: (e: React.PointerEvent) => void;
  onMoveStart: (e: React.PointerEvent) => void;
  onLongPressStart: () => void;
  onLongPressEnd: () => void;
}) {
  return (
    <Box
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).dataset.handle) return;
        onMoveStart(e);
        onLongPressStart();
      }}
      onPointerUp={onLongPressEnd}
      onPointerLeave={onLongPressEnd}
      onPointerCancel={onLongPressEnd}
      sx={{
        position: "absolute",
        left,
        width,
        height: "100%",
        bgcolor: color,
        borderRadius: 1,
        opacity: 0.95,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        cursor: readOnly ? "default" : "grab",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        "&:active": { cursor: readOnly ? "default" : "grabbing" },
      }}
    >
      <Typography variant="caption" sx={{ color: "#fff", fontSize: "0.65rem", fontWeight: 700, px: 0.5, lineHeight: 1.2, textAlign: "center" }}>
        {duration}
      </Typography>
      {width > 60 && (
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.85)", fontSize: "0.6rem", px: 0.5, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "100%" }}>
          {label}
        </Typography>
      )}
      {!readOnly && (
        <>
          <Box data-handle="start" onPointerDown={onResizeStart} sx={{ position: "absolute", left: 0, top: 0, width: HANDLE_WIDTH, height: "100%", cursor: "col-resize", bgcolor: "rgba(0,0,0,0.2)" }} />
          <Box data-handle="end" onPointerDown={onResizeEnd} sx={{ position: "absolute", right: 0, top: 0, width: HANDLE_WIDTH, height: "100%", cursor: "col-resize", bgcolor: "rgba(0,0,0,0.2)" }} />
        </>
      )}
    </Box>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, color: color ?? "text.primary", fontSize: "0.82rem" }}>{value}</Typography>
    </Box>
  );
}
