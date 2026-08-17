/**
 * Builds the staircase history of an asset maintenance fault from the issue record.
 *
 * The opening row carries the full fault detail; each later event steps one level deeper, carrying
 * only time, action and status, so the indentation shows that an event followed from the one above.
 * Static context (asset, location) appears once and is never repeated per row.
 *
 * Kept free of React so the same rows drive the on-screen view and the printable report.
 */
import type { AssetIssue, IssueComment, IssueEventStatus } from "../types/projectAsset";
import type { RunIssue } from "../types/assetWorkflowRun";
import {
  assignDepths,
  type StaircaseContext,
  type StaircaseRow,
  type StaircaseStatusStyle,
  type StaircaseView,
} from "./historyStaircase";

export type AnyIssue = AssetIssue | RunIssue;

export const ISSUE_EVENT_STATUSES: IssueEventStatus[] = [
  "Open",
  "In Progress",
  "Pending Verification",
  "Closed",
];

export const ISSUE_STATUS_MEANING: Record<string, string> = {
  Open: "Logged but no action taken yet",
  "In Progress": "Work is ongoing to resolve the fault",
  "Pending Verification": "Waiting to confirm the fix worked",
  Closed: "Resolved and signed off",
};

const ISSUE_PALETTE: Record<string, StaircaseStatusStyle> = {
  Open: {
    color: "#ff7a7a", bg: "rgba(244,67,54,0.14)", border: "rgba(244,67,54,0.42)",
    printFg: "#b3261e", printBg: "#fdecea", printBorder: "#f3c0bb",
  },
  "In Progress": {
    color: "#e8b34a", bg: "rgba(215,155,36,0.14)", border: "rgba(215,155,36,0.42)",
    printFg: "#8a5a00", printBg: "#fff6e0", printBorder: "#f0d9a3",
  },
  "Pending Verification": {
    color: "#7cc4ff", bg: "rgba(58,161,255,0.14)", border: "rgba(58,161,255,0.42)",
    printFg: "#0b5c9c", printBg: "#e8f2fd", printBorder: "#b8d8f5",
  },
  Closed: {
    color: "#6ede9a", bg: "rgba(46,155,94,0.16)", border: "rgba(46,155,94,0.45)",
    printFg: "#1c6b45", printBg: "#e9f7ef", printBorder: "#b6e0c7",
  },
};

/** Static context for the opening row and the report header. */
export interface IssueHistoryContext {
  faultId?: string;
  assetLabel?: string;
  projectLabel?: string;
  location?: string;
  severity?: string;
  reportedBy?: string;
}

function shortId(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return tail ? `FAULT-${tail}` : "FAULT";
}

/**
 * Updates recorded before per-event status existed are shown as "In Progress": by definition
 * someone was working the fault when they wrote it. Flagged as inferred so the UI can say so
 * rather than presenting a guess as recorded fact.
 */
function resolveUpdateStatus(comment: IssueComment): { status: IssueEventStatus; inferred: boolean } {
  if (comment.status) return { status: comment.status, inferred: false };
  return { status: "In Progress", inferred: true };
}

export function buildIssueHistory(
  issue: AnyIssue,
  context: IssueHistoryContext = {}
): StaircaseView {
  const reportedBy = context.reportedBy
    ?? ("createdBy" in issue ? issue.createdBy : undefined)
    ?? undefined;

  const rows: StaircaseRow[] = [
    {
      id: `${issue.id}-reported`,
      depth: 0,
      kind: "root",
      at: issue.reportedAt,
      action: issue.description,
      status: "Open",
      // Reporter is in the header context; repeating it on the row would duplicate static detail.
      label: "Original fault report",
    },
  ];

  const updates = [...(issue.comments ?? [])]
    .filter((c) => c && (c.text?.trim() || c.status))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  for (const comment of updates) {
    const { status, inferred } = resolveUpdateStatus(comment);
    rows.push({
      id: comment.id || `${issue.id}-update-${comment.createdAt}`,
      depth: 0,
      kind: "update",
      at: comment.createdAt,
      action: comment.text?.trim() ?? "",
      status,
      author: comment.author?.trim() || undefined,
      label: "Corrective action",
      statusInferred: inferred,
    });
  }

  if (issue.resolved) {
    const closingNote = issue.resolutionNote?.trim()
      || ("resolvedNote" in issue ? issue.resolvedNote?.trim() : "")
      || "Fault closed.";
    rows.push({
      id: `${issue.id}-closed`,
      depth: 0,
      kind: "closing",
      at: issue.resolvedAt ?? issue.reportedAt,
      action: closingNote,
      status: "Closed",
      author: issue.resolvedBy ?? undefined,
      label: "Closed",
    });
  }

  assignDepths(rows);

  const meta: StaircaseContext["meta"] = [];
  const add = (label: string, value?: string) => {
    if (value) meta.push({ label, value });
  };
  const reference = context.faultId ?? shortId(issue.id);
  add("Fault", reference);
  add("Asset / item", context.assetLabel);
  add("Project", context.projectLabel);
  add("Location", context.location);
  add("Severity", context.severity ?? issue.severity);
  add("Reported by", reportedBy);

  return {
    rows,
    context: { reference, title: issue.description, meta },
    currentStatus: rows[rows.length - 1]?.status ?? "Open",
    palette: ISSUE_PALETTE,
    meanings: ISSUE_STATUS_MEANING,
    statusOrder: ISSUE_EVENT_STATUSES,
  };
}
