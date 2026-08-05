/**
 * generateTechnicianReport
 * Builds a PDF workload summary for a single technician and triggers download.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";

// ── Colour palette ────────────────────────────────────────────────────────────
const NAVY: [number, number, number]       = [26,  39,  68];
const TEAL: [number, number, number]       = [0,   128, 128];
const TEAL_LIGHT: [number, number, number] = [224, 242, 242];
const GREY_BG: [number, number, number]    = [241, 243, 246];
const GREY_LABEL: [number, number, number] = [100, 110, 125];
const BLACK: [number, number, number]      = [20,  20,  20];
const WHITE: [number, number, number]      = [255, 255, 255];
const GREEN: [number, number, number]      = [46,  125, 50];
const ORANGE: [number, number, number]     = [230, 119, 0];
const RED: [number, number, number]        = [211, 47,  47];
const BORDER: [number, number, number]     = [200, 208, 218];

// ── Page geometry ─────────────────────────────────────────────────────────────
const PAGE_W   = 210;
const PAGE_H   = 297;
const MARGIN   = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H  = 22;
const FOOTER_H  = 8;
const SAFE_BOTTOM = PAGE_H - FOOTER_H - 10;

const LOGO_W = 38;
const LOGO_H = 14;
const LOGO_Y = (HEADER_H - LOGO_H) / 2;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Only the fields the report needs to label a row. Kept structural so callers can
 * pass whichever asset shape they already hold (e.g. the dashboard's OpenAssetItem)
 * without fetching full ProjectAsset records just to render a label.
 */
export interface TechnicianReportAsset {
  id: string;
  assetTag?: string | null;
  assetName?: string | null;
  jobNumber?: string | null;
  location?: string | null;
  status?: string | null;
  runStatus?: string | null;
  completedSteps?: number;
  totalSteps?: number;
}

export interface TechnicianReportData {
  technicianName: string;
  technicianEmail?: string;
  reportPeriod: string;
  runs: AssetWorkflowRun[];
  assets: TechnicianReportAsset[];
  businessLogoBase64?: string | null;
  exportDate: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectImageFormat(dataUrl: string): string | null {
  if (dataUrl.startsWith("data:image/png"))  return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  if (dataUrl.startsWith("data:image/gif"))  return "GIF";
  return null;
}

function getImageNaturalSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

const fmtSecs = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function parseOpenIssueCount(issuesJson: string): number {
  try {
    const arr = JSON.parse(issuesJson) as Array<{ resolved: boolean }>;
    return arr.filter((i) => !i.resolved).length;
  } catch { return 0; }
}

function parseAllIssues(runs: AssetWorkflowRun[]): Array<{
  assetId: string;
  description: string;
  severity: string;
  issueType: string;
  reportedAt: string;
  resolved: boolean;
}> {
  const result: ReturnType<typeof parseAllIssues> = [];
  for (const run of runs) {
    try {
      const arr = JSON.parse(run.issuesJson) as Array<{
        description: string;
        severity: string;
        issueType?: string;
        reportedAt: string;
        resolved: boolean;
      }>;
      for (const i of arr) {
        result.push({
          assetId: run.assetId,
          description: i.description,
          severity: i.severity,
          issueType: i.issueType ?? "observation",
          reportedAt: i.reportedAt,
          resolved: i.resolved,
        });
      }
    } catch { /* skip */ }
  }
  return result;
}

/**
 * Asset tag first — it is the identifier field crews actually recognise (e.g. CAD-0039).
 * Falls back through the display name to the raw id. Empty strings are skipped, which
 * matters because API shapes return "" rather than undefined for absent values.
 */
function resolveAssetLabel(assetId: string, assets: TechnicianReportAsset[]): string {
  const a = assets.find((x) => x.id === assetId);
  if (!a) return assetId;
  const tag = a.assetTag?.trim();
  if (tag) return tag;
  const name = a.assetName?.trim();
  if (name) return name;
  return assetId;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateTechnicianReport(data: TechnicianReportData): Promise<void> {
  const { technicianName, technicianEmail, reportPeriod, runs, assets, businessLogoBase64, exportDate } = data;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const totalPages = () =>
    (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();

  // ── Footer helper ─────────────────────────────────────────────────────────
  function drawFooter(pageNum: number) {
    const total = totalPages();
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    const footY = PAGE_H - 4;
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, PAGE_H - FOOTER_H, PAGE_W - MARGIN, PAGE_H - FOOTER_H);
    doc.text(`Page ${pageNum} of ${total}`, MARGIN, footY);
    doc.text("Technician Performance Report — Confidential", PAGE_W / 2, footY, { align: "center" });
    doc.text(`Exported: ${exportDate}`, PAGE_W - MARGIN, footY, { align: "right" });
  }

  function drawSectionBar(y: number, label: string): number {
    doc.setFillColor(...TEAL);
    doc.rect(MARGIN, y, CONTENT_W, 6.5, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(label, MARGIN + 3, y + 4.4);
    return y + 8.5;
  }

  function ensureSpace(y: number, needed: number): number {
    if (y + needed > SAFE_BOTTOM) { doc.addPage(); return 14; }
    return y;
  }

  // ── 1. Header band ────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  // Business logo
  if (businessLogoBase64) {
    const fmt = detectImageFormat(businessLogoBase64);
    if (fmt) {
      try {
        const size = await getImageNaturalSize(businessLogoBase64);
        let drawW = LOGO_W, drawH = LOGO_H;
        if (size && size.w > 0 && size.h > 0) {
          const scale = LOGO_H / size.h;
          drawH = LOGO_H;
          drawW = Math.min(size.w * scale, LOGO_W);
        }
        const offsetX = (LOGO_W - drawW) / 2;
        doc.addImage(businessLogoBase64, fmt, MARGIN + offsetX, LOGO_Y, drawW, drawH, undefined, "FAST");
      } catch { /* skip logo */ }
    }
  }

  // Center title
  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("TECHNICIAN PERFORMANCE REPORT", PAGE_W / 2, HEADER_H / 2 - 1.5, { align: "center" });

  // Right: tech name + period
  const rightX = PAGE_W - MARGIN;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(technicianName, rightX, HEADER_H / 2 - 1.5, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(reportPeriod, rightX, HEADER_H / 2 + 3.5, { align: "right" });

  let y = HEADER_H + 7;

  // ── 2. Summary KPI strip ──────────────────────────────────────────────────
  const completedRuns = runs.filter((r) => r.status === "Complete");
  const totalProductive = runs.reduce((s, r) => s + (r.productiveSeconds ?? 0), 0);
  const totalDowntime   = runs.reduce((s, r) => s + (r.downtimeSeconds  ?? 0), 0);
  const efficiencyPct   = (totalProductive + totalDowntime) > 0
    ? Math.round((totalProductive / (totalProductive + totalDowntime)) * 100)
    : null;

  const kpis = [
    { label: "Total Runs",        value: String(runs.length) },
    { label: "Completed Runs",    value: String(completedRuns.length) },
    { label: "Total Productive",  value: fmtSecs(totalProductive) },
    { label: "Avg Efficiency",    value: efficiencyPct !== null ? `${efficiencyPct}%` : "N/A" },
  ];

  const boxW = CONTENT_W / 4 - 2;
  const boxH = 18;
  kpis.forEach((kpi, i) => {
    const bx = MARGIN + i * (boxW + 2.67);
    doc.setFillColor(...TEAL_LIGHT);
    doc.roundedRect(bx, y, boxW, boxH, 2, 2, "F");
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(kpi.value, bx + boxW / 2, y + 10, { align: "center" });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    doc.text(kpi.label, bx + boxW / 2, y + 15.5, { align: "center" });
  });

  y += boxH + 8;

  // Tech detail line
  if (technicianEmail) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    doc.text(`Email: ${technicianEmail}`, MARGIN, y);
    y += 5;
  }

  // ── 3. Assigned assets ────────────────────────────────────────────────────
  // A workload report has to show queued work too: an asset assigned but not yet
  // started has no run, so it would be invisible in the run history below.
  if (assets.length > 0) {
    y = ensureSpace(y, 30);
    y = drawSectionBar(y, `ASSIGNED ASSETS  (${assets.length})`);

    const assetRows = assets.map((a) => [
      resolveAssetLabel(a.id, assets),
      a.jobNumber?.trim() || "—",
      a.assetName?.trim() || "—",
      a.location?.trim() || "—",
      (a.runStatus?.trim() || a.status?.trim() || "—"),
      (a.totalSteps ?? 0) > 0 ? `${a.completedSteps ?? 0}/${a.totalSteps}` : "—",
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "striped",
      head: [["Asset", "Job", "Description", "Location", "State", "Steps"]],
      body: assetRows,
      styles: { fontSize: 8, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 }, overflow: "linebreak" },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: {
        0: { cellWidth: CONTENT_W * 0.18 },
        1: { cellWidth: CONTENT_W * 0.15 },
        2: { cellWidth: CONTENT_W * 0.25 },
        3: { cellWidth: CONTENT_W * 0.16 },
        4: { cellWidth: CONTENT_W * 0.14, halign: "center" },
        5: { cellWidth: CONTENT_W * 0.12, halign: "center" },
      },
      didDrawPage: (data) => { drawFooter(data.pageNumber); },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── 4. Run History table ──────────────────────────────────────────────────
  y = ensureSpace(y, 30);
  y = drawSectionBar(y, `RUN HISTORY  (${runs.length} run${runs.length !== 1 ? "s" : ""})`);

  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  const runRows = sortedRuns.map((run) => {
    const assetLabel   = resolveAssetLabel(run.assetId, assets);
    const totalSecs    = (run.productiveSeconds ?? 0) + (run.downtimeSeconds ?? 0);
    const effPct       = totalSecs > 0
      ? `${Math.round(((run.productiveSeconds ?? 0) / totalSecs) * 100)}%`
      : "N/A";
    const openIssues   = parseOpenIssueCount(run.issuesJson);
    return [
      assetLabel,
      fmtDate(run.startedAt),
      fmtSecs(totalSecs),
      fmtSecs(run.productiveSeconds ?? 0),
      fmtSecs(run.downtimeSeconds ?? 0),
      effPct,
      run.status,
      openIssues > 0 ? String(openIssues) : "—",
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "striped",
    head: [["Asset", "Started", "Duration", "Productive", "Downtime", "Efficiency", "Status", "Issues"]],
    body: runRows.length > 0
      ? runRows
      : [["No workflow runs recorded for the assets currently assigned.", "", "", "", "", "", "", ""]],
    styles: { fontSize: 8, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 } },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: GREY_BG },
    columnStyles: {
      0: { cellWidth: CONTENT_W * 0.22 },
      1: { cellWidth: CONTENT_W * 0.14 },
      2: { cellWidth: CONTENT_W * 0.10, halign: "center" },
      3: { cellWidth: CONTENT_W * 0.11, halign: "center" },
      4: { cellWidth: CONTENT_W * 0.11, halign: "center" },
      5: { cellWidth: CONTENT_W * 0.10, halign: "center" },
      6: { cellWidth: CONTENT_W * 0.12, halign: "center" },
      7: { cellWidth: CONTENT_W * 0.10, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 6) {
        const s = String(data.cell.raw);
        if (s === "Complete")   { data.cell.styles.textColor = GREEN;  data.cell.styles.fontStyle = "bold"; }
        else if (s === "Issue") { data.cell.styles.textColor = RED;    data.cell.styles.fontStyle = "bold"; }
        else                    { data.cell.styles.textColor = ORANGE; }
      }
      if (data.column.index === 7 && String(data.cell.raw) !== "—") {
        data.cell.styles.textColor = RED;
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (data) => { drawFooter(data.pageNumber); },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── 5. Issues summary ─────────────────────────────────────────────────────
  const allIssues = parseAllIssues(runs);
  if (allIssues.length > 0) {
    y = ensureSpace(y, 30);
    const openCount   = allIssues.filter((i) => !i.resolved).length;
    const closedCount = allIssues.length - openCount;
    y = drawSectionBar(y, `ISSUES  (${allIssues.length} total · ${openCount} open · ${closedCount} resolved)`);

    const issueRows = allIssues.map((i) => [
      resolveAssetLabel(i.assetId, assets),
      i.description,
      i.severity.charAt(0).toUpperCase() + i.severity.slice(1),
      i.issueType === "blocking" ? "Blocking"
        : i.issueType === "scope-deviation" ? "Scope Dev."
        : "Observation",
      fmtDate(i.reportedAt),
      i.resolved ? "Resolved" : "Open",
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "striped",
      head: [["Asset", "Description", "Severity", "Type", "Reported", "Status"]],
      body: issueRows,
      styles: { fontSize: 8, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 }, overflow: "linebreak" },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: {
        0: { cellWidth: CONTENT_W * 0.18 },
        1: { cellWidth: CONTENT_W * 0.32 },
        2: { cellWidth: CONTENT_W * 0.10 },
        3: { cellWidth: CONTENT_W * 0.14 },
        4: { cellWidth: CONTENT_W * 0.14 },
        5: { cellWidth: CONTENT_W * 0.12, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        if (data.column.index === 2) {
          const sev = String(data.cell.raw).toLowerCase();
          if (sev === "high")        data.cell.styles.textColor = RED;
          else if (sev === "medium") data.cell.styles.textColor = ORANGE;
          data.cell.styles.fontStyle = "bold";
        }
        if (data.column.index === 5) {
          if (String(data.cell.raw) === "Open") {
            data.cell.styles.textColor = ORANGE;
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.textColor = GREEN;
          }
        }
      },
      didDrawPage: (data) => { drawFooter(data.pageNumber); },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Draw footer on all pages ───────────────────────────────────────────────
  const numPages = totalPages();
  for (let p = 1; p <= numPages; p++) {
    doc.setPage(p);
    drawFooter(p);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeName = technicianName.replace(/\s+/g, "-");
  doc.save(`tech-report-${safeName}-${exportDate}.pdf`);
}
