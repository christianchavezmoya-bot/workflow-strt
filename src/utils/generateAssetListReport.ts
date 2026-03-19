/**
 * generateAssetListReport
 *
 * Builds an A4 Landscape PDF (or triggers the browser print dialog) for a
 * filtered/selected list of project assets from the Installation page.
 *
 * The caller pre-resolves every display value (tech name, project label, etc.)
 * into flat PrintRow objects so this utility stays stateless and testable.
 *
 * Sections per page:
 *   • Navy header band — title, product name, filter summary, date
 *   • Optional group header (By Technician / By Status / By Project)
 *   • autoTable with selected columns, alternating row background, status colour
 *   • Grey footer — page number + date + "Confidential"
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Colour palette (shared with generateProjectReport) ──────────────────────
const NAVY:       [number, number, number] = [26,  39,  68];
const TEAL:       [number, number, number] = [0,  128, 128];
const TEAL_LIGHT: [number, number, number] = [224, 242, 242];
const GREY_BG:    [number, number, number] = [241, 243, 246];
const GREY_LABEL: [number, number, number] = [100, 110, 125];
const BLACK:      [number, number, number] = [20,  20,  20];
const WHITE:      [number, number, number] = [255, 255, 255];
const RED:        [number, number, number] = [211, 47,  47];
const GREEN:      [number, number, number] = [46,  125, 50];
const ORANGE:     [number, number, number] = [230, 119, 0];
const BLUE:       [number, number, number] = [25,  118, 210];
const BORDER:     [number, number, number] = [200, 208, 218];

// Landscape A4
const PAGE_W   = 297;
const PAGE_H   = 210;
const MARGIN   = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 22;
const FOOTER_H = 7;
const SAFE_BOT = PAGE_H - FOOTER_H - 6;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PrintRow {
  assetTag:     string;
  assetName:    string;
  serialNumber: string;
  assetModel:   string;
  manufacturer: string;
  location:     string;
  assignedTech: string;
  status:       string;   // "Not Started" | "In Progress" | "Complete" | "Issue"
  project:      string;   // "JN-001 — Acme Corp"
  siteName:     string;
  notes:        string;
  configType:   string;
  wfStatus:     string;   // e.g. "In Progress (Installation)"
  sigStatus:    string;   // e.g. "Pending Customer" | "Signed" | "—"
  // used for grouping only — not printed as column unless selected
  _techId:      string;
  _statusRaw:   string;
  _projectId:   string;
}

export interface PrintColumnDef {
  id:    keyof PrintRow;
  label: string;
  /** approximate relative weight for column width distribution */
  weight?: number;
}

export const ALL_PRINT_COLUMNS: PrintColumnDef[] = [
  { id: "assetTag",     label: "Asset Tag",        weight: 6 },
  { id: "assetName",    label: "Asset Name",        weight: 8 },
  { id: "serialNumber", label: "Serial #",          weight: 7 },
  { id: "assetModel",   label: "Asset Model",       weight: 7 },
  { id: "manufacturer", label: "Manufacturer",      weight: 7 },
  { id: "location",     label: "Location",          weight: 7 },
  { id: "assignedTech", label: "Assigned Tech",     weight: 8 },
  { id: "status",       label: "Status",            weight: 6 },
  { id: "project",      label: "Project",           weight: 10 },
  { id: "siteName",     label: "Site",              weight: 7 },
  { id: "configType",   label: "Config Type",       weight: 7 },
  { id: "wfStatus",     label: "Workflow Status",   weight: 8 },
  { id: "sigStatus",    label: "Signature Status",  weight: 8 },
  { id: "notes",        label: "Notes",             weight: 10 },
];

export type GroupByKey = "none" | "technician" | "status" | "project";

export interface AssetListReportOptions {
  rows:          PrintRow[];
  columns:       (keyof PrintRow)[];   // ordered list of column ids to include
  groupBy:       GroupByKey;
  meta: {
    productName:   string;
    filterSummary: string;
    exportDate:    string;
    logoBase64?:   string | null;
  };
  /** "download" saves as file; "print" opens browser print dialog */
  mode: "download" | "print";
  filename?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addHeader(doc: jsPDF, meta: AssetListReportOptions["meta"]) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  // Logo (optional)
  if (meta.logoBase64) {
    try {
      const fmt = meta.logoBase64.startsWith("data:image/png") ? "PNG"
        : meta.logoBase64.startsWith("data:image/jpeg") || meta.logoBase64.startsWith("data:image/jpg") ? "JPEG"
        : null;
      if (fmt) doc.addImage(meta.logoBase64, fmt, MARGIN, 3, 28, 16, undefined, "FAST");
    } catch { /* skip */ }
  }

  // Title
  doc.setTextColor(...WHITE);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Asset Installation Report", PAGE_W / 2, 8, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(meta.productName, PAGE_W / 2, 13, { align: "center" });

  // Filter summary on the right
  doc.setFontSize(7);
  doc.setTextColor(...TEAL_LIGHT);
  doc.text(meta.filterSummary, PAGE_W - MARGIN, 8, { align: "right" });
  doc.text(meta.exportDate, PAGE_W - MARGIN, 13, { align: "right" });
}

function addFooter(doc: jsPDF, pageNum: number, totalPages: number, exportDate: string) {
  const y = PAGE_H - FOOTER_H + 1;
  doc.setFillColor(...GREY_BG);
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, "F");
  doc.setFontSize(7);
  doc.setTextColor(...GREY_LABEL);
  doc.text(`Page ${pageNum} of ${totalPages}`, MARGIN, y + 4);
  doc.text("Asset Installation Report — Confidential", PAGE_W / 2, y + 4, { align: "center" });
  doc.text(`Generated ${exportDate}`, PAGE_W - MARGIN, y + 4, { align: "right" });
}

function statusTextColor(status: string): [number, number, number] {
  const s = status.toLowerCase();
  if (s === "complete" || s === "completed") return GREEN;
  if (s === "in progress" || s === "inprogress") return BLUE;
  if (s === "issue" || s === "issues") return RED;
  return GREY_LABEL;
}

function groupLabel(row: PrintRow, groupBy: GroupByKey): string {
  switch (groupBy) {
    case "technician": return row.assignedTech || "Unassigned";
    case "status":     return row.status        || "Unknown";
    case "project":    return row.project       || "No Project";
    default:           return "";
  }
}

function groupKey(row: PrintRow, groupBy: GroupByKey): string {
  switch (groupBy) {
    case "technician": return row._techId     || "__unassigned__";
    case "status":     return row._statusRaw  || "__unknown__";
    case "project":    return row._projectId  || "__none__";
    default:           return "__all__";
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateAssetListReport(opts: AssetListReportOptions): Promise<void> {
  const { rows, columns, groupBy, meta, mode, filename } = opts;

  if (rows.length === 0) return;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Resolve column definitions in requested order
  const colDefs = columns
    .map((id) => ALL_PRINT_COLUMNS.find((c) => c.id === id))
    .filter((c): c is PrintColumnDef => !!c);

  // Compute column widths from weights
  const totalWeight = colDefs.reduce((s, c) => s + (c.weight ?? 6), 0);
  const colWidths = colDefs.map((c) => Math.round(CONTENT_W * ((c.weight ?? 6) / totalWeight) * 10) / 10);

  // Group rows
  type Group = { key: string; label: string; rows: PrintRow[] };
  const groups: Group[] = [];
  if (groupBy === "none") {
    groups.push({ key: "__all__", label: "", rows });
  } else {
    const seen = new Map<string, Group>();
    for (const row of rows) {
      const k = groupKey(row, groupBy);
      if (!seen.has(k)) {
        const g: Group = { key: k, label: groupLabel(row, groupBy), rows: [] };
        seen.set(k, g);
        groups.push(g);
      }
      seen.get(k)!.rows.push(row);
    }
    // Sort groups alphabetically by label
    groups.sort((a, b) => a.label.localeCompare(b.label));
  }

  let firstPage = true;

  for (const group of groups) {
    if (!firstPage) doc.addPage();
    firstPage = false;

    let startY = HEADER_H + 4;

    // Group header band
    if (groupBy !== "none") {
      doc.setFillColor(...TEAL_LIGHT);
      doc.rect(MARGIN, startY, CONTENT_W, 8, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      const groupTitle = groupBy.charAt(0).toUpperCase() + groupBy.slice(1) + ": " + group.label;
      doc.text(groupTitle, MARGIN + 3, startY + 5.5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GREY_LABEL);
      doc.text(`${group.rows.length} asset${group.rows.length !== 1 ? "s" : ""}`, PAGE_W - MARGIN, startY + 5.5, { align: "right" });
      startY += 10;
    }

    // Build table body
    const body = group.rows.map((row) => {
      return colDefs.map((col) => row[col.id] ?? "");
    });

    autoTable(doc, {
      startY,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      head: [colDefs.map((c) => c.label)],
      body,
      columnStyles: Object.fromEntries(colWidths.map((w, i) => [i, { cellWidth: w }])),
      styles: {
        fontSize: 8,
        cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 },
        valign: "middle",
        overflow: "linebreak",
        lineColor: BORDER,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 7.5,
        cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
      },
      alternateRowStyles: {
        fillColor: GREY_BG,
      },
      didParseCell: (data) => {
        // Colour-code the "Status" column text
        const statusColIdx = colDefs.findIndex((c) => c.id === "status");
        if (data.section === "body" && data.column.index === statusColIdx) {
          const raw = String(data.cell.raw ?? "");
          data.cell.styles.textColor = statusTextColor(raw);
          data.cell.styles.fontStyle = "bold";
        }
        // Colour "Signature Status"
        const sigColIdx = colDefs.findIndex((c) => c.id === "sigStatus");
        if (data.section === "body" && data.column.index === sigColIdx) {
          const raw = String(data.cell.raw ?? "").toLowerCase();
          if (raw.includes("pending")) data.cell.styles.textColor = ORANGE;
          else if (raw.includes("signed") || raw.includes("waived")) data.cell.styles.textColor = GREEN;
        }
      },
      // Add running header + footer on every page
      didDrawPage: (data) => {
        addHeader(doc, meta);
        // Footer placeholder — overwritten after we know totalPages
        addFooter(doc, doc.getCurrentPageInfo().pageNumber, 1, meta.exportDate);
      },
      pageBreak: "auto",
    });
  }

  // Overwrite footers now that we know the real page count
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addFooter(doc, p, totalPages, meta.exportDate);
  }

  // Output
  const outFilename = filename || `asset-report-${meta.exportDate.replace(/\//g, "-")}.pdf`;
  if (mode === "print") {
    doc.autoPrint();
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.addEventListener("load", () => {
        setTimeout(() => {
          win.focus();
          win.print();
          URL.revokeObjectURL(url);
        }, 400);
      });
    }
  } else {
    doc.save(outFilename);
  }
}
