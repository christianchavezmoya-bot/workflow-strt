/**
 * Builds the staircase history of a fault from the issue record.
 *
 * The layout it feeds: the first row carries the full fault detail, and every later event is
 * indented one step deeper than the one before it, so the indentation itself shows that an event
 * followed from the one above. Later rows carry only date, action and status — static context
 * (asset, location) appears once on the root row and is never repeated.
 *
 * Kept free of React so the same rows drive the on-screen view and the printable report.
 */
import type { AssetIssue, IssueComment, IssueEventStatus } from "../types/projectAsset";
import type { RunIssue } from "../types/assetWorkflowRun";

export type AnyIssue = AssetIssue | RunIssue;

/** Depth stops increasing past this so a long history cannot indent off the page. */
export const MAX_HISTORY_DEPTH = 6;

export interface IssueHistoryRow {
  id: string;
  /** 0 for the original report; each later event is one step deeper, capped at MAX_HISTORY_DEPTH. */
  depth: number;
  kind: "reported" | "update" | "closed";
  at: string;
  /** The corrective action or comment. Empty only when an update carried no text. */
  action: string;
  status: IssueEventStatus;
  author?: string;
  /** True when the status was inferred rather than recorded — surfaced in the UI. */
  statusInferred: boolean;
}

/** Static context shown once, on the root row. */
export interface IssueHistoryContext {
  faultId?: string;
  assetLabel?: string;
  projectLabel?: string;
  location?: string;
  severity?: string;
  reportedBy?: string;
}

export interface IssueHistory {
  rows: IssueHistoryRow[];
  context: IssueHistoryContext;
  /** Status of the deepest (most recent) row — the fault's current state. */
  currentStatus: IssueEventStatus;
}

export const ISSUE_EVENT_STATUSES: IssueEventStatus[] = [
  "Open",
  "In Progress",
  "Pending Verification",
  "Closed",
];

/** Plain-language meaning of each status, used by the on-screen and printed legends. */
export const ISSUE_STATUS_MEANING: Record<IssueEventStatus, string> = {
  Open: "Logged but no action taken yet",
  "In Progress": "Work is ongoing to resolve the fault",
  "Pending Verification": "Waiting to confirm the fix worked",
  Closed: "Resolved and signed off",
};

function shortId(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return tail ? `FAULT-${tail}` : "FAULT";
}

function commentAuthor(comment: IssueComment): string | undefined {
  return comment.author?.trim() || undefined;
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
): IssueHistory {
  const reportedBy = context.reportedBy
    ?? ("createdBy" in issue ? issue.createdBy : undefined)
    ?? undefined;

  const rows: IssueHistoryRow[] = [];

  rows.push({
    id: `${issue.id}-reported`,
    depth: 0,
    kind: "reported",
    at: issue.reportedAt,
    action: issue.description,
    status: "Open",
    author: reportedBy,
    statusInferred: false,
  });

  const updates = [...(issue.comments ?? [])]
    .filter((c) => c && (c.text?.trim() || c.status))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  for (const comment of updates) {
    const { status, inferred } = resolveUpdateStatus(comment);
    rows.push({
      id: comment.id || `${issue.id}-update-${comment.createdAt}`,
      depth: 0, // assigned below
      kind: "update",
      at: comment.createdAt,
      action: comment.text?.trim() ?? "",
      status,
      author: commentAuthor(comment),
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
      kind: "closed",
      at: issue.resolvedAt ?? issue.reportedAt,
      action: closingNote,
      status: "Closed",
      author: issue.resolvedBy ?? undefined,
      statusInferred: false,
    });
  }

  // One step deeper per event, then hold at the cap so long histories stay on the page.
  rows.forEach((row, index) => {
    row.depth = Math.min(index, MAX_HISTORY_DEPTH);
  });

  return {
    rows,
    context: {
      ...context,
      faultId: context.faultId ?? shortId(issue.id),
      severity: context.severity ?? issue.severity,
      reportedBy,
    },
    currentStatus: rows[rows.length - 1]?.status ?? "Open",
  };
}
