/**
 * Printable fault-history report — the same staircase as the on-screen view, rendered light for
 * paper and PDF. Uses the app's print-window helper rather than a PDF library, so the printed
 * layout matches what was reviewed on screen and the browser handles pagination.
 *
 * Vocabulary-neutral: works for app fault reports and asset maintenance faults alike.
 */
import { escapeHtml, openPrintWindow } from "./printWindow";
import { formatInstant } from "./datetime";
import { statusesPresent, styleFor, type StaircaseView } from "./historyStaircase";

const INDENT_PX = 34;

export interface HistoryReportOptions {
  view: StaircaseView;
  timeZoneId?: string | null;
  /** Shown under the title — the app or customer name. */
  brandName?: string;
  /** Heading noun, e.g. "Fault report" or "Fault". */
  documentLabel?: string;
  autoPrint?: boolean;
}

function statusBadge(view: StaircaseView, status: string, inferred?: boolean): string {
  const s = styleFor(view, status);
  return `<span class="status" style="color:${s.printFg};background:${s.printBg};border-color:${s.printBorder}">${escapeHtml(
    inferred ? `${status} *` : status
  )}</span>`;
}

export function buildHistoryReportHtml({
  view,
  timeZoneId,
  brandName = "Strata NGo",
  documentLabel = "Fault report",
}: Omit<HistoryReportOptions, "autoPrint">): string {
  const { rows, context } = view;
  const when = (iso: string) => escapeHtml(formatInstant(iso, timeZoneId, { withZone: false }) || iso);

  const summary = context.meta
    .map(
      (item) =>
        `<div class="meta"><span class="meta-label">${escapeHtml(item.label)}</span><span class="meta-value">${escapeHtml(
          item.value
        )}</span></div>`
    )
    .join("");

  const historyRows = rows
    .map((row, index) => {
      const isRoot = index === 0;
      const indent = row.depth * INDENT_PX;
      // The elbow starts under the previous row's text and hooks right into this one, so the link
      // between consecutive events is visible rather than implied by indentation alone. Past the
      // depth cap consecutive rows share an indent, so a straight line is used instead.
      const sameDepth = index > 0 && rows[index - 1].depth === row.depth;
      const connectorLeft = Math.max(2, indent + 12 - (sameDepth ? 0 : 22));
      const connector = isRoot
        ? ""
        : `<span class="${sameDepth ? "elbow straight" : "elbow"}" style="left:${connectorLeft}px" aria-hidden="true"></span>`;
      const author = row.author ? `<span class="author">· ${escapeHtml(row.author)}</span>` : "";
      const label = row.label ?? (isRoot ? "Original report" : "Update");

      return `
        <tr class="${isRoot ? "row root" : "row"}">
          <td class="cell-when">${when(row.at)}${author}</td>
          <td class="cell-action" style="padding-left:${indent + 12}px">
            ${connector}
            <div class="action-label">${escapeHtml(label)}</div>
            <div class="action-text">${escapeHtml(row.action || "—")}</div>
          </td>
          <td class="cell-status">${statusBadge(view, row.status, row.statusInferred)}</td>
        </tr>`;
    })
    .join("");

  const legend = statusesPresent(view)
    .map((status) => {
      const s = styleFor(view, status);
      return `<div class="legend-row">
        <span class="status" style="color:${s.printFg};background:${s.printBg};border-color:${s.printBorder}">${escapeHtml(status)}</span>
        <span class="legend-text">${escapeHtml(view.meanings[status] ?? "")}</span>
      </div>`;
    })
    .join("");

  const inferredNote = rows.some((r) => r.statusInferred)
    ? `<p class="note">* Status inferred — recorded before updates carried their own status.</p>`
    : "";

  const generated = escapeHtml(formatInstant(new Date().toISOString(), timeZoneId, { withZone: true }) || "");
  const heading = `${documentLabel} — ${context.reference ?? ""}`.trim().replace(/—\s*$/, "").trim();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(heading)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font-family: Manrope, Sora, system-ui, -apple-system, Segoe UI, sans-serif;
    color: #1b2b33; background: #fff; font-size: 12px;
  }
  h1 { margin: 0 0 2px; font-size: 18px; }
  .subject { color: #29404c; font-size: 13px; font-weight: 600; margin-bottom: 2px; }
  .brand { color: #5b7280; font-size: 11px; margin-bottom: 16px; }
  .summary {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px 16px; padding: 12px 14px; margin-bottom: 18px;
    border: 1px solid #dce4e8; border-radius: 8px; background: #f7fafb;
  }
  .meta { display: flex; flex-direction: column; gap: 1px; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: #6b8290; }
  .meta-value { font-weight: 600; word-break: break-word; }
  .intro { color: #4a5f6b; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase;
    letter-spacing: .5px; background: #12313d; color: #fff;
  }
  thead th:first-child { border-radius: 6px 0 0 6px; }
  thead th:last-child { border-radius: 0 6px 6px 0; }
  .row td { padding: 9px 10px; border-bottom: 1px solid #e8eef1; vertical-align: top; }
  .row.root td { background: #f2f9fa; }
  .cell-when { white-space: nowrap; color: #4a5f6b; width: 150px; }
  .author { display: block; color: #7c8f9a; font-size: 10px; }
  .cell-action { position: relative; }
  .elbow {
    position: absolute; top: -14px; width: 18px; height: 26px;
    border-left: 1.5px solid #8fbfc7; border-bottom: 1.5px solid #8fbfc7;
    border-bottom-left-radius: 6px;
  }
  .elbow.straight { width: 0; height: 14px; border-bottom: none; border-bottom-left-radius: 0; }
  .action-label { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: #6b8290; }
  .action-text { font-weight: 500; white-space: pre-wrap; }
  .cell-status { width: 132px; white-space: nowrap; }
  .status {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    border: 1px solid; font-size: 10px; font-weight: 700;
  }
  .legend { margin-top: 18px; padding: 12px 14px; border: 1px solid #dce4e8; border-radius: 8px; }
  .legend h2 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #6b8290; }
  .legend-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .legend-text { color: #4a5f6b; }
  .note { color: #6b8290; font-size: 10px; margin: 10px 0 0; }
  footer { margin-top: 18px; color: #8598a3; font-size: 10px; }
  @media print {
    body { padding: 0; }
    .row { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .legend { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(heading)}</h1>
  ${context.title ? `<div class="subject">${escapeHtml(context.title)}</div>` : ""}
  <div class="brand">${escapeHtml(brandName)}</div>

  <div class="summary">${summary}</div>

  <p class="intro">
    Each row is an event in the life of this fault. Rows step to the right to show that an event
    followed from the one above it; the deepest row is the most recent.
  </p>

  <table>
    <thead>
      <tr><th>Date / time</th><th>Corrective action / comment</th><th>Status</th></tr>
    </thead>
    <tbody>${historyRows}</tbody>
  </table>

  <div class="legend">
    <h2>Status legend</h2>
    ${legend}
    ${inferredNote}
  </div>

  <footer>Generated ${generated}</footer>
</body>
</html>`;
}

/** Opens the report in a new window, optionally going straight to the print dialog. */
export function openHistoryReport(options: HistoryReportOptions): Window | null {
  return openPrintWindow(buildHistoryReportHtml(options), options.autoPrint ?? false);
}
