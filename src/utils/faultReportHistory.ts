/**
 * Builds the staircase history of an app fault report.
 *
 * The opening row carries the full report — what the user described, who reported it, on which
 * platform and screen. Each later event steps one level deeper, carrying only time, corrective
 * action and the status afterwards, so the indentation shows that an action followed from the one
 * above it. Static context is never repeated per row.
 */
import type {
  StaircaseContext,
  StaircaseRow,
  StaircaseStatusStyle,
  StaircaseView,
} from "./historyStaircase";
import { assignDepths } from "./historyStaircase";
import type { FaultReportRow, FaultReportUpdate } from "../services/faultReportAdminService";

/** The report's own vocabulary — not the maintenance-issue one. */
export const FAULT_REPORT_STATUS_ORDER = ["New", "Investigating", "Fixed", "WontFix", "Duplicate"];

export const FAULT_REPORT_STATUS_MEANING: Record<string, string> = {
  New: "Logged but triage has not started",
  Investigating: "Being looked into",
  Fixed: "Resolved and released",
  WontFix: "Understood, but no change will be made",
  Duplicate: "Already covered by another report",
};

const FAULT_REPORT_PALETTE: Record<string, StaircaseStatusStyle> = {
  New: {
    color: "#7cc4ff", bg: "rgba(58,161,255,0.14)", border: "rgba(58,161,255,0.42)",
    printFg: "#0b5c9c", printBg: "#e8f2fd", printBorder: "#b8d8f5",
  },
  Investigating: {
    color: "#e8b34a", bg: "rgba(215,155,36,0.14)", border: "rgba(215,155,36,0.42)",
    printFg: "#8a5a00", printBg: "#fff6e0", printBorder: "#f0d9a3",
  },
  Fixed: {
    color: "#6ede9a", bg: "rgba(46,155,94,0.16)", border: "rgba(46,155,94,0.45)",
    printFg: "#1c6b45", printBg: "#e9f7ef", printBorder: "#b6e0c7",
  },
  WontFix: {
    color: "#c9d6dc", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.2)",
    printFg: "#4a5f6b", printBg: "#eef2f4", printBorder: "#d3dde2",
  },
  Duplicate: {
    color: "#b9a6ff", bg: "rgba(150,120,255,0.14)", border: "rgba(150,120,255,0.4)",
    printFg: "#5a3fb0", printBg: "#f0ecff", printBorder: "#d6cbf7",
  },
};

function metaFor(report: FaultReportRow): StaircaseContext["meta"] {
  const meta: StaircaseContext["meta"] = [];
  const add = (label: string, value?: string | null) => {
    if (value) meta.push({ label, value });
  };

  add("Reference", report.referenceCode);
  add("Severity", report.severity);
  add("Reported by", report.userEmail ?? report.userId);
  add("Role", report.userRole);
  add("Platform", report.platform);
  add("App version", report.appVersion);
  add("Screen", report.routePath);
  add("Offline at the time", report.wasOffline ? "Yes" : "No");
  add("Kind", report.kind === "user-report" ? "Reported by user" : `Automatic (${report.kind})`);
  add("Current status", report.status);

  return meta;
}

/**
 * Updates recorded before this history existed have no row of their own, so a report that was
 * triaged only through the notes field still shows its notes as one event rather than losing them.
 */
function legacyNotesRow(report: FaultReportRow): StaircaseRow | null {
  const notes = report.notes?.trim();
  if (!notes) return null;
  return {
    id: `${report.id}-notes`,
    depth: 0,
    kind: "update",
    at: report.createdAtUtc,
    action: notes,
    status: report.status,
    label: "Triage notes",
    statusInferred: true,
  };
}

export function buildFaultReportHistory(
  report: FaultReportRow,
  updates: FaultReportUpdate[] = []
): StaircaseView {
  const rows: StaircaseRow[] = [];

  rows.push({
    id: `${report.id}-reported`,
    depth: 0,
    kind: "root",
    at: report.occurredAtUtc || report.createdAtUtc,
    action: [report.title, report.description?.trim()].filter(Boolean).join("\n\n"),
    status: "New",
    // Reporter is in the header context; repeating it on the row would duplicate static detail.
    label: "Original fault report",
  });

  const ordered = [...updates].sort((a, b) =>
    (a.createdAtUtc ?? "").localeCompare(b.createdAtUtc ?? "")
  );

  for (const update of ordered) {
    rows.push({
      id: update.id,
      depth: 0,
      kind: update.status === "Fixed" || update.status === "WontFix" || update.status === "Duplicate"
        ? "closing"
        : "update",
      at: update.createdAtUtc,
      action: update.action,
      status: update.status,
      author: update.authorName ?? undefined,
      label: update.systemGenerated ? "Status change" : "Corrective action",
    });
  }

  // Only fall back to the notes field when there is no real history to show.
  if (ordered.length === 0) {
    const legacy = legacyNotesRow(report);
    if (legacy) rows.push(legacy);
  }

  assignDepths(rows);

  return {
    rows,
    context: {
      reference: report.referenceCode,
      title: report.title,
      meta: metaFor(report),
    },
    currentStatus: rows[rows.length - 1]?.status ?? report.status,
    palette: FAULT_REPORT_PALETTE,
    meanings: FAULT_REPORT_STATUS_MEANING,
    statusOrder: FAULT_REPORT_STATUS_ORDER,
  };
}
