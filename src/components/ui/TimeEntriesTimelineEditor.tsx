import { useCallback, useMemo, useRef, useState } from "react";
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { DragIndicatorOutlined, ZoomInOutlined, ZoomOutOutlined } from "@mui/icons-material";
import type { RunTimeEntry } from "../../types/assetWorkflowRun";
import { formatInstant, zoneAbbreviation } from "../../utils/datetime";
import { formatDuration } from "../../utils/timelineModel";
import { clampZoom, nextPinchZoom, touchDistance } from "../../utils/pinchZoom";
import SegmentTimeEditorDialog from "./SegmentTimeEditorDialog";
import RunBoundaryEditorDialog from "./RunBoundaryEditorDialog";

interface Props {
  entries: RunTimeEntry[];
  timeZoneId?: string | null;
  nowIso: string;
  readOnly?: boolean;
  onChange: (entries: RunTimeEntry[]) => void;
}

const TRACK_HEIGHT = 52;
const RULER_HEIGHT = 48;
const MIN_SEGMENT_MS = 60_000;
const BASE_PX_PER_HOUR = 140;
const BRACKET_HIT = 18;
const COLORS = { productive: "#2e9b5e", downtime: "#d79b24" };
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 10;

type DragMode =
  | {
      kind: "boundary";
      ms: number;
      leftId: string | null;
      rightId: string | null;
      pointerId: number;
    }
  | {
      kind: "resize";
      entryId: string;
      edge: "start" | "end";
      pointerId: number;
    }
  | {
      kind: "move";
      entryId: string;
      pointerId: number;
      startX: number;
      origStartMs: number;
      origEndMs: number;
    }
  | {
      kind: "pan";
      pointerId: number;
      startX: number;
      startScrollLeft: number;
    };

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

function buildBoundaries(segments: ReturnType<typeof layoutSegments>) {
  const list: Array<{ ms: number; leftId: string | null; rightId: string | null }> = [];
  segments.forEach((seg, i) => {
    if (i === 0) {
      list.push({ ms: seg.startMs, leftId: null, rightId: seg.entry.id });
    }
    list.push({
      ms: seg.endMs,
      leftId: seg.entry.id,
      rightId: segments[i + 1]?.entry.id ?? null,
    });
  });
  return list;
}

export default function TimeEntriesTimelineEditor({
  entries,
  timeZoneId,
  nowIso,
  readOnly = false,
  onChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1.5);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [editEntry, setEditEntry] = useState<RunTimeEntry | null>(null);
  const [boundaryEdit, setBoundaryEdit] = useState<"start" | "finish" | null>(null);
  const movedDuringDrag = useRef(false);
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);

  const segments = useMemo(() => layoutSegments(entries, nowIso), [entries, nowIso]);
  const boundaries = useMemo(() => buildBoundaries(segments), [segments]);

  const bounds = useMemo(() => {
    if (segments.length === 0) return null;
    const startMs = segments[0].startMs;
    const endMs = segments[segments.length - 1].endMs;
    const spanMs = Math.max(endMs - startMs, MIN_SEGMENT_MS * 2);
    const padMs = Math.max(spanMs * 0.12, MIN_SEGMENT_MS * 4);
    return { startMs: startMs - padMs, endMs: endMs + padMs, spanMs: spanMs + padMs * 2 };
  }, [segments]);

  const pxPerMs = bounds ? (BASE_PX_PER_HOUR / 3_600_000) * zoom : 0;
  const timelineWidth = bounds ? Math.max(bounds.spanMs * pxPerMs, 360) : 360;

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

  const applyBoundaryMove = useCallback(
    (leftId: string | null, rightId: string | null, targetMs: number) => {
      if (!bounds) return;
      const snapped = snapMinute(targetMs);
      onChange(
        entries.map((e) => {
          if (e.id === leftId) return { ...e, endedAtUtc: new Date(snapped).toISOString() };
          if (e.id === rightId) return { ...e, startedAtUtc: new Date(snapped).toISOString() };
          return e;
        }),
      );
    },
    [bounds, entries, onChange],
  );

  const applySegmentResize = useCallback(
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
          onChange(
            entries.map((e) =>
              e.id === entryId ? { ...e, startedAtUtc: new Date(newStart).toISOString() } : e,
            ),
          );
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
        onChange(
          entries.map((e) =>
            e.id === entryId ? { ...e, endedAtUtc: new Date(newEnd).toISOString() } : e,
          ),
        );
      }
    },
    [bounds, entries, nowIso, onChange],
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
      onChange(
        entries.map((e) =>
          e.id === entryId
            ? {
                ...e,
                startedAtUtc: new Date(newStart).toISOString(),
                endedAtUtc: new Date(newEnd).toISOString(),
              }
            : e,
        ),
      );
    },
    [bounds, entries, onChange],
  );

  const applyRunBoundary = useCallback(
    (kind: "start" | "finish", iso: string) => {
      if (segments.length === 0) return;
      const ms = toMs(iso);
      if (kind === "start") {
        applySegmentResize(segments[0].entry.id, "start", ms);
      } else {
        applySegmentResize(segments[segments.length - 1].entry.id, "end", ms);
      }
    },
    [applySegmentResize, segments],
  );

  const clientXToMs = (clientX: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = clientX - rect.left + scrollLeft;
    return xToMs(x);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || !containerRef.current) return;
    movedDuringDrag.current = true;
    if (drag.kind === "pan") {
      const delta = drag.startX - event.clientX;
      containerRef.current.scrollLeft = drag.startScrollLeft + delta;
      setScrollLeft(containerRef.current.scrollLeft);
      return;
    }
    const ms = clientXToMs(event.clientX);
    if (drag.kind === "boundary") {
      applyBoundaryMove(drag.leftId, drag.rightId, ms);
    } else if (drag.kind === "resize") {
      applySegmentResize(drag.entryId, drag.edge, ms);
    } else {
      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left + scrollLeft;
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
    setTimeout(() => {
      movedDuringDrag.current = false;
    }, 0);
  };

  const onTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      pinchRef.current = {
        startDistance: touchDistance(event.touches[0], event.touches[1]),
        startZoom: zoom,
      };
    }
  };

  const onTouchMove = (event: React.TouchEvent) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const distance = touchDistance(event.touches[0], event.touches[1]);
    setZoom(nextPinchZoom(pinch.startZoom, pinch.startDistance, distance, ZOOM_MIN, ZOOM_MAX));
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (event.touches.length < 2) pinchRef.current = null;
  };

  const axisTicks = useMemo(() => {
    if (!bounds) return [];
    const stepMs = zoom >= 2 ? MIN_SEGMENT_MS * 15 : zoom >= 1 ? MIN_SEGMENT_MS * 30 : MIN_SEGMENT_MS * 60;
    const ticks: number[] = [];
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

  const zoneLabel = timeZoneId ? zoneAbbreviation(timeZoneId) : null;
  const runStartIso = new Date(segments[0].startMs).toISOString();
  const runFinishIso = new Date(segments[segments.length - 1].endMs).toISOString();

  return (
    <Box sx={{ px: 2.5, py: 2 }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5} alignItems="flex-end" sx={{ mb: 1.5 }}>
        <ClickableStat
          label="Start"
          value={formatInstant(runStartIso, timeZoneId, { withZone: true })}
          readOnly={readOnly}
          onClick={() => setBoundaryEdit("start")}
        />
        <ClickableStat
          label="Finish"
          value={formatInstant(runFinishIso, timeZoneId, { withZone: true })}
          readOnly={readOnly}
          onClick={() => setBoundaryEdit("finish")}
        />
        <Chip size="small" color="success" variant="outlined" label={`Productive ${formatDuration(totals.productive)}`} />
        <Chip size="small" color="warning" variant="outlined" label={`Downtime ${formatDuration(totals.downtime)}`} />
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: "auto" }}>
          <Tooltip title="Zoom out">
            <span>
              <IconButton size="small" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => clampZoom(z / 1.4, ZOOM_MIN, ZOOM_MAX))}>
                <ZoomOutOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <Tooltip title="Zoom in">
            <span>
              <IconButton size="small" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => clampZoom(z * 1.4, ZOOM_MIN, ZOOM_MAX))}>
                <ZoomInOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {!readOnly && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Use the blue side brackets to resize a time bar · drag the center grip to move one bar · swipe to pan · pinch with two fingers to zoom
          {zoneLabel ? ` · ${zoneLabel}` : ""}
        </Typography>
      )}

      <Box
        ref={containerRef}
        onScroll={(e) => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        sx={{
          overflowX: "auto",
          overflowY: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1.5,
          bgcolor: "background.default",
          userSelect: "none",
          touchAction: "pan-x pinch-zoom",
        }}
      >
        <Box
          sx={{ position: "relative", width: timelineWidth + 56, px: 3, py: 1.5 }}
          onPointerDown={(e) => {
            if (readOnly || (e.target as HTMLElement).dataset.interactive) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDrag({
              kind: "pan",
              pointerId: e.pointerId,
              startX: e.clientX,
              startScrollLeft: containerRef.current?.scrollLeft ?? 0,
            });
          }}
        >
          <Box sx={{ position: "relative", height: 20, mb: 0.5 }}>
            {axisTicks.map((ms) => (
              <Typography
                key={ms}
                variant="caption"
                color="text.secondary"
                sx={{
                  position: "absolute",
                  left: msToX(ms),
                  transform: "translateX(-50%)",
                  fontSize: "0.68rem",
                  whiteSpace: "nowrap",
                }}
              >
                {formatInstant(new Date(ms).toISOString(), timeZoneId, { date: false, time: true, withZone: false })}
              </Typography>
            ))}
          </Box>

          <Box sx={{ position: "relative", height: RULER_HEIGHT, mb: 0.5 }}>
            <Box sx={{ position: "absolute", left: 0, right: 0, top: RULER_HEIGHT / 2, height: 2, bgcolor: "divider", borderRadius: 1 }} />
            {boundaries.map((b, idx) => (
              <BoundaryBracketPin
                key={`${b.ms}-${idx}`}
                left={msToX(b.ms)}
                timeLabel={formatInstant(new Date(b.ms).toISOString(), timeZoneId, { date: false, time: true, withZone: false })}
                readOnly={readOnly}
                onPointerDown={(e) => {
                  if (readOnly) return;
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setDrag({
                    kind: "boundary",
                    ms: b.ms,
                    leftId: b.leftId,
                    rightId: b.rightId,
                    pointerId: e.pointerId,
                  });
                }}
              />
            ))}
          </Box>

          <Box
            sx={{
              position: "relative",
              height: TRACK_HEIGHT,
              borderRadius: 1,
              bgcolor: "action.hover",
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            {segments.map((s) => {
              const left = msToX(s.startMs);
              const width = Math.max(msToX(s.endMs) - left, 32);
              const color = s.entry.category === "downtime" ? COLORS.downtime : COLORS.productive;
              return (
                <Box
                  key={s.entry.id}
                  data-interactive="true"
                  onPointerDown={(e) => {
                    if (readOnly || (e.target as HTMLElement).dataset.handle) return;
                    const rect = containerRef.current!.getBoundingClientRect();
                    const x = e.clientX - rect.left + scrollLeft;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    movedDuringDrag.current = false;
                    setDrag({
                      kind: "move",
                      entryId: s.entry.id,
                      pointerId: e.pointerId,
                      startX: x,
                      origStartMs: s.startMs,
                      origEndMs: s.endMs,
                    });
                  }}
                  onPointerUp={(e) => {
                    if (drag?.kind === "move" && drag.entryId === s.entry.id) {
                      try {
                        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                      } catch { /* ignore */ }
                      setDrag(null);
                      if (!readOnly && !movedDuringDrag.current) {
                        setEditEntry(s.entry);
                      }
                      setTimeout(() => {
                        movedDuringDrag.current = false;
                      }, 0);
                    }
                  }}
                  sx={{
                    position: "absolute",
                    left,
                    width,
                    top: 4,
                    bottom: 4,
                    bgcolor: color,
                    borderRadius: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    px: 0.5,
                    cursor: readOnly ? "default" : "grab",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
                    "&:active": { cursor: readOnly ? "default" : "grabbing" },
                    overflow: "hidden",
                  }}
                >
                  {!readOnly && (
                    <>
                      <SegmentBracketHandle
                        side="left"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setDrag({ kind: "resize", entryId: s.entry.id, edge: "start", pointerId: e.pointerId });
                        }}
                      />
                      <SegmentBracketHandle
                        side="right"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setDrag({ kind: "resize", entryId: s.entry.id, edge: "end", pointerId: e.pointerId });
                        }}
                      />
                    </>
                  )}
                  <Stack direction="row" spacing={0.25} alignItems="center">
                    {!readOnly && <DragIndicatorOutlined sx={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }} />}
                    <Typography variant="caption" sx={{ color: "#fff", fontWeight: 700, fontSize: "0.72rem", lineHeight: 1.2 }}>
                      {formatDuration(Math.round((s.endMs - s.startMs) / 1000))}
                    </Typography>
                  </Stack>
                </Box>
              );
            })}
          </Box>

          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <LegendDot color={COLORS.productive} label="Productive" />
            <LegendDot color={COLORS.downtime} label="Downtime" />
          </Stack>
        </Box>
      </Box>

      <SegmentTimeEditorDialog
        open={Boolean(editEntry)}
        entry={editEntry}
        timeZoneId={timeZoneId}
        nowIso={nowIso}
        onClose={() => setEditEntry(null)}
        onSave={(updated) => {
          onChange(entries.map((e) => (e.id === updated.id ? updated : e)));
          setEditEntry(null);
        }}
      />

      <RunBoundaryEditorDialog
        open={boundaryEdit !== null}
        kind={boundaryEdit ?? "start"}
        iso={boundaryEdit === "finish" ? runFinishIso : runStartIso}
        timeZoneId={timeZoneId}
        onClose={() => setBoundaryEdit(null)}
        onSave={(iso) => {
          if (boundaryEdit) applyRunBoundary(boundaryEdit, iso);
        }}
      />
    </Box>
  );
}

function ClickableStat({
  label,
  value,
  readOnly,
  onClick,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  onClick: () => void;
}) {
  if (readOnly) {
    return (
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>{value}</Typography>
      </Box>
    );
  }
  return (
    <Button
      variant="text"
      onClick={onClick}
      sx={{ textAlign: "left", alignItems: "flex-start", px: 0.5, py: 0.25, minWidth: 0, textTransform: "none" }}
    >
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem", color: "info.main" }}>{value}</Typography>
      </Box>
    </Button>
  );
}

function BoundaryBracketPin({
  left,
  timeLabel,
  readOnly,
  onPointerDown,
}: {
  left: number;
  timeLabel: string;
  readOnly?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <Tooltip title={readOnly ? timeLabel : `Drag bracket — ${timeLabel}`} placement="top">
      <Box
        data-interactive="true"
        onPointerDown={onPointerDown}
        sx={{
          position: "absolute",
          left,
          top: 0,
          transform: "translateX(-50%)",
          width: BRACKET_HIT,
          height: RULER_HEIGHT,
          cursor: readOnly ? "default" : "col-resize",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          zIndex: 2,
        }}
      >
        <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "text.secondary", mb: 0.25, whiteSpace: "nowrap" }}>
          {timeLabel}
        </Typography>
        <BlueBracket side="left" height={22} />
      </Box>
    </Tooltip>
  );
}

function SegmentBracketHandle({
  side,
  onPointerDown,
}: {
  side: "left" | "right";
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <Box
      data-handle="true"
      data-interactive="true"
      onPointerDown={onPointerDown}
      sx={{
        position: "absolute",
        top: "50%",
        [side]: 0,
        transform: "translateY(-50%)",
        width: BRACKET_HIT,
        height: "78%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "col-resize",
        zIndex: 2,
      }}
    >
      <BlueBracket side={side} height="100%" />
    </Box>
  );
}

function BlueBracket({ side, height }: { side: "left" | "right"; height: number | string }) {
  return (
    <Box
      sx={{
        width: 10,
        height,
        boxSizing: "border-box",
        borderTop: "3px solid",
        borderBottom: "3px solid",
        borderColor: "info.main",
        ...(side === "left"
          ? { borderLeft: "3px solid", borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }
          : { borderRight: "3px solid", borderTopRightRadius: 4, borderBottomRightRadius: 4 }),
      }}
    />
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: color }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Stack>
  );
}
