// Timeline model (Model B): pause is the GAP between work sessions, not a segment.
//
// Productive and downtime are the two real, server-understood categories and the
// only proportional segments. A "pause" (work stopped, resumed later - e.g. day
// over) is NOT a coloured block: rendering a multi-day pause proportionally would
// swamp the actual work. Instead, a gap between one entry's end and the next
// entry's start is shown as a labelled BREAK (a thin divider), and the timeline
// proportions reflect only active work time.
//
// This keeps the whole thing frontend-only: we never introduce a "paused"
// category the server doesn't total. Totals are Productive, Downtime, Active
// (productive+downtime), and an Elapsed calendar span shown separately as context.

import type { RunTimeEntry } from "../types/assetWorkflowRun";

export type TimelineItemKind = "productive" | "downtime" | "break";

/** A proportional work segment (productive/downtime) or a non-proportional break. */
export interface TimelineItem {
  kind: TimelineItemKind;
  startUtc: string;
  endUtc: string;
  /** Duration in seconds. For breaks this is the real gap length (shown as a label, not width). */
  seconds: number;
  reason?: string | null;
  /** Fraction (0..1) of total ACTIVE time. Breaks are 0 (they don't take proportional width). */
  fraction: number;
}

export interface TimelineModel {
  items: TimelineItem[];
  productiveSeconds: number;
  downtimeSeconds: number;
  /** productive + downtime */
  activeSeconds: number;
  /** wall-clock span from first start to last end (includes breaks) */
  elapsedSeconds: number;
  /** total of all break gaps (elapsed - active), i.e. time paused/not working */
  breakSeconds: number;
  firstStartUtc: string | null;
  lastEndUtc: string | null;
  /** true if any break spans a calendar day boundary (multi-day job) */
  hasMultiDayBreak: boolean;
}

function toMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Threshold above which a gap between entries is treated as a visible break. */
const BREAK_THRESHOLD_SECONDS = 60; // gaps under a minute are noise, not a pause

/**
 * Build the Model-B timeline from run time entries.
 * - Sorts entries by start.
 * - Emits productive/downtime as proportional segments.
 * - Emits a "break" item for any gap > threshold between consecutive entries.
 * - Open entries (no endedAtUtc) are closed at `nowIso` for display.
 */
export function buildTimelineModel(
  entries: RunTimeEntry[],
  nowIso: string,
): TimelineModel {
  const clean = entries
    .filter((e) => e.startedAtUtc)
    .map((e) => ({
      ...e,
      _start: toMs(e.startedAtUtc),
      _end: toMs(e.endedAtUtc || nowIso),
    }))
    .filter((e) => e._end >= e._start)
    .sort((a, b) => a._start - b._start);

  let productiveSeconds = 0;
  let downtimeSeconds = 0;
  const rawItems: Array<Omit<TimelineItem, "fraction">> = [];

  for (let i = 0; i < clean.length; i++) {
    const e = clean[i];
    const secs = Math.max(0, Math.round((e._end - e._start) / 1000));
    if (e.category === "downtime") downtimeSeconds += secs;
    else productiveSeconds += secs;

    rawItems.push({
      kind: e.category,
      startUtc: e.startedAtUtc,
      endUtc: e.endedAtUtc || nowIso,
      seconds: secs,
      reason: e.reason ?? null,
    });

    // Gap to the next entry -> break (pause).
    if (i < clean.length - 1) {
      const next = clean[i + 1];
      const gapSecs = Math.max(0, Math.round((next._start - e._end) / 1000));
      if (gapSecs > BREAK_THRESHOLD_SECONDS) {
        rawItems.push({
          kind: "break",
          startUtc: e.endedAtUtc || nowIso,
          endUtc: next.startedAtUtc,
          seconds: gapSecs,
          reason: null,
        });
      }
    }
  }

  const activeSeconds = productiveSeconds + downtimeSeconds;
  const firstStartUtc = clean.length ? clean[0].startedAtUtc : null;
  const lastEndUtc = clean.length ? (clean[clean.length - 1].endedAtUtc || nowIso) : null;
  const elapsedSeconds =
    firstStartUtc && lastEndUtc
      ? Math.max(0, Math.round((toMs(lastEndUtc) - toMs(firstStartUtc)) / 1000))
      : 0;
  const breakSeconds = Math.max(0, elapsedSeconds - activeSeconds);

  const hasMultiDayBreak = rawItems.some(
    (it) =>
      it.kind === "break" &&
      new Date(it.startUtc).toDateString() !== new Date(it.endUtc).toDateString(),
  );

  // Proportional fraction over ACTIVE time only (breaks contribute 0 width).
  const items: TimelineItem[] = rawItems.map((it) => ({
    ...it,
    fraction: it.kind === "break" || activeSeconds === 0 ? 0 : it.seconds / activeSeconds,
  }));

  return {
    items,
    productiveSeconds,
    downtimeSeconds,
    activeSeconds,
    elapsedSeconds,
    breakSeconds,
    firstStartUtc,
    lastEndUtc,
    hasMultiDayBreak,
  };
}

/** Format a seconds duration as e.g. "2h 05m" or "45m" or "30s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}