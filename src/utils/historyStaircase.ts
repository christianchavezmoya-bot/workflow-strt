/**
 * Shared model for the staircase history layout.
 *
 * Two features use it with different status vocabularies — asset faults run
 * Open → In Progress → Pending Verification → Closed, while app fault reports run
 * New → Investigating → Fixed/WontFix/Duplicate — so status is a plain string here and the
 * palette and legend are supplied by the caller.
 */

/** Indentation stops deepening past this so a long history cannot run off the page. */
export const MAX_HISTORY_DEPTH = 6;

export interface StaircaseRow {
  id: string;
  /** 0 for the opening row; each later event is one step deeper, capped at MAX_HISTORY_DEPTH. */
  depth: number;
  kind: "root" | "update" | "closing";
  at: string;
  /** The corrective action or comment. */
  action: string;
  status: string;
  author?: string;
  /** Shown above the action, e.g. "Original fault report" or "Status change". */
  label?: string;
  /** True when the status was inferred rather than recorded — surfaced in the UI. */
  statusInferred?: boolean;
}

/** Static context shown once, above the staircase and in the report header. */
export interface StaircaseContext {
  reference?: string;
  title?: string;
  /** Label/value pairs — asset, location, reporter, platform, and so on. */
  meta: { label: string; value: string }[];
}

export interface StaircaseStatusStyle {
  /** Foreground for the dark on-screen theme. */
  color: string;
  bg: string;
  border: string;
  /** Print palette — light, so it does not wash out or burn ink on paper. */
  printFg: string;
  printBg: string;
  printBorder: string;
}

export interface StaircaseView {
  rows: StaircaseRow[];
  context: StaircaseContext;
  /** Status of the deepest (most recent) row. */
  currentStatus: string;
  /** Style per status, keyed by the status string. */
  palette: Record<string, StaircaseStatusStyle>;
  /** Plain-language meaning per status, for the legend. */
  meanings: Record<string, string>;
  /** Legend order — only statuses present in `rows` are shown. */
  statusOrder: string[];
}

/** Assigns one step of depth per event, holding at the cap. */
export function assignDepths<T extends { depth: number }>(rows: T[]): T[] {
  rows.forEach((row, index) => {
    row.depth = Math.min(index, MAX_HISTORY_DEPTH);
  });
  return rows;
}

/** Statuses that actually occur, in lifecycle order — the legend should not explain the unused. */
export function statusesPresent(view: Pick<StaircaseView, "rows" | "statusOrder">): string[] {
  const present = new Set(view.rows.map((r) => r.status));
  return view.statusOrder.filter((s) => present.has(s));
}

const FALLBACK_STYLE: StaircaseStatusStyle = {
  color: "#c9d6dc",
  bg: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.18)",
  printFg: "#40535e",
  printBg: "#eef2f4",
  printBorder: "#d3dde2",
};

/** Keeps an unrecognised status renderable rather than crashing the view. */
export function styleFor(view: StaircaseView, status: string): StaircaseStatusStyle {
  return view.palette[status] ?? FALLBACK_STYLE;
}
