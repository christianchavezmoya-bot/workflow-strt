/**
 * generateBomReport
 * Exports the project Bill of Materials in three formats:
 *   - PDF  (jsPDF + autoTable, business logo optional)
 *   - Excel (SheetJS / xlsx — two sheets: Summary + Inventory Register)
 *   - CSV  (flat, UTF-8 BOM for Excel compatibility)
 *
 * Sections (all formats):
 *   1. Parts Summary   — item, type, expected qty, actual qty, variance
 *   2. Inventory Register — per-unit serial/firmware/IP/MAC, asset, location, installer, date
 *   3. Variance Report — items where actual ≠ expected
 *   4. Missing BOM     — assets with completed runs but no BOM recorded
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatInstant } from "./datetime";

// ─── Colour palette (mirrors generateWorkflowReport) ─────────────────────────
const NAVY:       [number,number,number] = [26,  39,  68];
const TEAL:       [number,number,number] = [0,   128, 128];
const TEAL_LIGHT: [number,number,number] = [224, 242, 242];
const GREY_BG:    [number,number,number] = [241, 243, 246];
const GREY_LABEL: [number,number,number] = [100, 110, 125];
const BLACK:      [number,number,number] = [20,  20,  20];
const WHITE:      [number,number,number] = [255, 255, 255];
const RED:        [number,number,number] = [211, 47,  47];
const GREEN:      [number,number,number] = [46,  125, 50];
const ORANGE:     [number,number,number] = [230, 119, 0];
const BORDER:     [number,number,number] = [200, 208, 218];

const PAGE_W    = 210;
const PAGE_H    = 297;
const MARGIN    = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H  = 26;
const FOOTER_H  = 8;
const SAFE_BOT  = PAGE_H - FOOTER_H - 10;
const LOGO_W    = 38;
const LOGO_H    = 16;

// ─── Public data types ────────────────────────────────────────────────────────

export interface BomCaptureDetail {
  assetTag:     string;
  assetLocation: string;
  unitIdx:      number;
  fields:       Record<string, string>;
  installedBy:  string;
  installedAt:  string;
}

export interface BomExportRow {
  description:   string;
  isInventory:   boolean;
  unitOfMeasure: string;
  totalExpected: number;
  totalActual:   number;
  captures:      BomCaptureDetail[];
}

export interface MissingBomAsset {
  assetTag:  string;
  location:  string;
  status:    string;
}

export interface BomExportData {
  projectJobNumber:    string;
  projectCustomer:     string;
  projectSite:         string;
  projectManager:      string;
  exportDate:          string;
  totalAssets:         number;
  assetsWithBom:       number;
  rows:                BomExportRow[];
  missingBomAssets:    MissingBomAsset[];
  businessLogoBase64:  string | null;
  projectTimeZoneId?:  string | null;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmtDate(iso: string, timeZoneId?: string | null): string {
  if (!iso) return "—";
  return formatInstant(iso, timeZoneId, { time: false, withZone: false }) || iso;
}

function varianceLabel(expected: number, actual: number): string {
  const diff = actual - expected;
  if (diff === 0) return "—";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// Collect all unique capture field names across all inventory items
function allCaptureFields(rows: BomExportRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.isInventory) continue;
    for (const cap of row.captures) {
      Object.keys(cap.fields).forEach(k => seen.add(k));
    }
  }
  return Array.from(seen);
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function detectImageFormat(dataUrl: string): string | null {
  if (dataUrl.startsWith("data:image/png"))  return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  if (dataUrl.startsWith("data:image/gif"))  return "GIF";
  return null;
}

function drawPageHeader(doc: jsPDF, logoBase64: string | null, pageNum: number, timeZoneId?: string | null, totalPages?: number) {
  const p = doc.internal.pageSize;
  const w = p.getWidth();

  // Navy band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, HEADER_H, "F");

  // Logo
  if (logoBase64) {
    const fmt = detectImageFormat(logoBase64);
    if (fmt) {
      try {
        doc.addImage(logoBase64, fmt, MARGIN, (HEADER_H - LOGO_H) / 2, LOGO_W, LOGO_H, undefined, "FAST");
      } catch { /* ignore */ }
    }
  }

  // Title
  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("BILL OF MATERIALS", w / 2, HEADER_H / 2 + 2, { align: "center" });

  // Footer
  doc.setFillColor(...GREY_BG);
  doc.rect(0, PAGE_H - FOOTER_H, w, FOOTER_H, "F");
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(0, PAGE_H - FOOTER_H, w, PAGE_H - FOOTER_H);
  doc.setTextColor(...GREY_LABEL);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated ${formatInstant(new Date().toISOString(), timeZoneId, { withZone: true })}`, MARGIN, PAGE_H - 2.5);
  const pageLabel = totalPages ? `Page ${pageNum} of ${totalPages}` : `Page ${pageNum}`;
  doc.text(pageLabel, w - MARGIN, PAGE_H - 2.5, { align: "right" });
}

function sectionBar(doc: jsPDF, y: number, title: string): number {
  doc.setFillColor(...TEAL);
  doc.rect(MARGIN, y, CONTENT_W, 6, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(title.toUpperCase(), MARGIN + 3, y + 4.2);
  return y + 9;
}

export async function exportBomPdf(data: BomExportData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = HEADER_H + 8;

  drawPageHeader(doc, data.businessLogoBase64, 1, data.projectTimeZoneId);

  // ── Project metadata block ────────────────────────────────────────────────
  const meta: [string, string][] = [
    ["Job Number",      data.projectJobNumber || "—"],
    ["Customer",        data.projectCustomer  || "—"],
    ["Site",            data.projectSite      || "—"],
    ["Project Manager", data.projectManager   || "—"],
    ["Export Date",     data.exportDate],
    ["Total Assets",    `${data.totalAssets}`],
    ["Assets with BOM", `${data.assetsWithBom} / ${data.totalAssets}`],
    ["Total Line Items",`${data.rows.length}`],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    body: meta.map(([k, v]) => [k, v]),
    theme: "plain",
    styles: { fontSize: 8, cellPadding: { top: 1.2, bottom: 1.2, left: 3, right: 3 } },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 38, textColor: GREY_LABEL },
      1: { textColor: BLACK },
    },
    alternateRowStyles: { fillColor: GREY_BG },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Parts Summary table ───────────────────────────────────────────────────
  if (y > SAFE_BOT - 20) { doc.addPage(); y = HEADER_H + 8; drawPageHeader(doc, data.businessLogoBase64, doc.getNumberOfPages(), data.projectTimeZoneId); }
  y = sectionBar(doc, y, "Parts Summary");

  const summaryBody = data.rows.map(row => {
    const diff = row.totalActual - row.totalExpected;
    return [
      row.description,
      row.isInventory ? "Inventory" : "Consumable",
      row.unitOfMeasure,
      row.totalExpected === 0 ? "—" : `${row.totalExpected}`,
      `${row.totalActual}`,
      diff === 0 ? "—" : diff > 0 ? `+${diff}` : `${diff}`,
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    head: [["Item / Description", "Type", "UoM", "Expected", "Actual", "Variance"]],
    body: summaryBody,
    theme: "grid",
    headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: "bold", cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2, textColor: BLACK },
    alternateRowStyles: { fillColor: GREY_BG },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 25 },
      2: { cellWidth: 15, halign: "center" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 22, halign: "center" },
      5: { cellWidth: 22, halign: "center" },
    },
    didParseCell(hookData) {
      if (hookData.section === "body" && hookData.column.index === 5) {
        const v = hookData.cell.text[0];
        if (v && v !== "—") {
          hookData.cell.styles.textColor = v.startsWith("+") ? GREEN : RED;
          hookData.cell.styles.fontStyle = "bold";
        }
      }
      if (hookData.section === "body" && hookData.column.index === 1) {
        hookData.cell.styles.textColor = hookData.cell.text[0] === "Inventory" ? [25, 118, 210] : GREY_LABEL;
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Inventory Register ────────────────────────────────────────────────────
  const inventoryRows = data.rows.filter(r => r.isInventory && r.captures.length > 0);
  if (inventoryRows.length > 0) {
    if (y > SAFE_BOT - 20) { doc.addPage(); y = HEADER_H + 8; drawPageHeader(doc, data.businessLogoBase64, doc.getNumberOfPages(), data.projectTimeZoneId); }
    y = sectionBar(doc, y, "Inventory Register — Captured Unit Data");

    const captureFields = allCaptureFields(data.rows);
    const invHead = ["Asset", "Location", "Item", "Unit #", ...captureFields, "Installed By", "Date"];
    const invBody: string[][] = [];

    for (const row of inventoryRows) {
      for (const cap of row.captures) {
        invBody.push([
          cap.assetTag,
          cap.assetLocation || "—",
          row.description,
          `Unit ${cap.unitIdx}`,
          ...captureFields.map(f => cap.fields[f] || "—"),
          cap.installedBy || "—",
          cap.installedAt ? fmtDate(cap.installedAt, data.projectTimeZoneId) : "—",
        ]);
      }
    }

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      head: [invHead],
      body: invBody,
      theme: "striped",
      headStyles: { fillColor: TEAL, textColor: WHITE, fontSize: 7, fontStyle: "bold", cellPadding: 1.5 },
      bodyStyles: { fontSize: 7, cellPadding: 1.5, textColor: BLACK },
      alternateRowStyles: { fillColor: TEAL_LIGHT },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Variance Report ───────────────────────────────────────────────────────
  const varRows = data.rows.filter(r => r.totalActual !== r.totalExpected && r.totalExpected > 0);
  if (varRows.length > 0) {
    if (y > SAFE_BOT - 20) { doc.addPage(); y = HEADER_H + 8; drawPageHeader(doc, data.businessLogoBase64, doc.getNumberOfPages(), data.projectTimeZoneId); }
    y = sectionBar(doc, y, "Variance Report — Actual vs Expected");

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      head: [["Item", "UoM", "Expected", "Actual", "Variance", "Status"]],
      body: varRows.map(r => {
        const diff = r.totalActual - r.totalExpected;
        return [
          r.description,
          r.unitOfMeasure,
          `${r.totalExpected}`,
          `${r.totalActual}`,
          diff > 0 ? `+${diff}` : `${diff}`,
          diff > 0 ? "Over" : "Under",
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: ORANGE, textColor: WHITE, fontSize: 8, fontStyle: "bold", cellPadding: 2 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: {
        4: { halign: "center", fontStyle: "bold" },
        5: { halign: "center", fontStyle: "bold" },
      },
      didParseCell(hookData) {
        if (hookData.section === "body" && hookData.column.index >= 4) {
          const v = hookData.cell.text[0];
          hookData.cell.styles.textColor = (v === "Over" || (v && v.startsWith("+"))) ? RED : ORANGE;
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Missing BOM assets ────────────────────────────────────────────────────
  if (data.missingBomAssets.length > 0) {
    if (y > SAFE_BOT - 20) { doc.addPage(); y = HEADER_H + 8; drawPageHeader(doc, data.businessLogoBase64, doc.getNumberOfPages(), data.projectTimeZoneId); }
    y = sectionBar(doc, y, `Assets — BOM Not Recorded (${data.missingBomAssets.length})`);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      head: [["Asset Tag", "Location", "Status"]],
      body: data.missingBomAssets.map(a => [a.assetTag, a.location || "—", a.status]),
      theme: "plain",
      headStyles: { fillColor: RED, textColor: WHITE, fontSize: 8, fontStyle: "bold", cellPadding: 2 },
      bodyStyles: { fontSize: 8, cellPadding: 2, textColor: BLACK },
      alternateRowStyles: { fillColor: GREY_BG },
    });
  }

  const filename = `BOM_${safeFilename(data.projectJobNumber)}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// ─── Excel export ─────────────────────────────────────────────────────────────

export function exportBomExcel(data: BomExportData): void {
  const wb = XLSX.utils.book_new();
  const captureFields = allCaptureFields(data.rows);

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    ["BILL OF MATERIALS"],
    [],
    ["Job Number",       data.projectJobNumber],
    ["Customer",         data.projectCustomer],
    ["Site",             data.projectSite],
    ["Project Manager",  data.projectManager],
    ["Export Date",      data.exportDate],
    ["Total Assets",     data.totalAssets],
    ["Assets with BOM",  `${data.assetsWithBom} / ${data.totalAssets}`],
    [],
    ["Item / Description", "Type", "UoM", "Expected Qty", "Actual Qty", "Variance", "Inventory Units"],
    ...data.rows.map(row => [
      row.description,
      row.isInventory ? "Inventory" : "Consumable",
      row.unitOfMeasure,
      row.totalExpected,
      row.totalActual,
      row.totalActual - row.totalExpected,
      row.isInventory ? row.captures.length : "",
    ]),
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 45 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: Inventory Register ───────────────────────────────────────────
  const invHead = ["Asset Tag", "Location", "Item / Description", "Unit #", ...captureFields, "Installed By", "Installed Date"];
  const invRows: (string | number)[][] = [invHead];

  for (const row of data.rows) {
    if (!row.isInventory) continue;
    for (const cap of row.captures) {
      invRows.push([
        cap.assetTag,
        cap.assetLocation || "",
        row.description,
        cap.unitIdx,
        ...captureFields.map(f => cap.fields[f] || ""),
        cap.installedBy || "",
        cap.installedAt ? fmtDate(cap.installedAt, data.projectTimeZoneId) : "",
      ]);
    }
  }

  const wsInv = XLSX.utils.aoa_to_sheet(invRows);
  const invColWidths = [14, 20, 45, 8, ...captureFields.map(() => 20), 20, 16];
  wsInv["!cols"] = invColWidths.map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsInv, "Inventory Register");

  // ── Sheet 3: Missing BOM ─────────────────────────────────────────────────
  if (data.missingBomAssets.length > 0) {
    const missingRows: string[][] = [
      ["Asset Tag", "Location", "Status"],
      ...data.missingBomAssets.map(a => [a.assetTag, a.location || "", a.status]),
    ];
    const wsMissing = XLSX.utils.aoa_to_sheet(missingRows);
    wsMissing["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsMissing, "Missing BOM");
  }

  const filename = `BOM_${safeFilename(data.projectJobNumber)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function exportBomCsv(data: BomExportData): void {
  const captureFields = allCaptureFields(data.rows);

  // Header rows
  const lines: string[] = [
    `"BILL OF MATERIALS"`,
    `"Job Number","${data.projectJobNumber}"`,
    `"Customer","${data.projectCustomer}"`,
    `"Site","${data.projectSite}"`,
    `"Export Date","${data.exportDate}"`,
    ``,
    // Summary table
    `"--- PARTS SUMMARY ---"`,
    [`"Item / Description"`, `"Type"`, `"UoM"`, `"Expected Qty"`, `"Actual Qty"`, `"Variance"`].join(","),
    ...data.rows.map(row => [
      `"${row.description}"`,
      `"${row.isInventory ? "Inventory" : "Consumable"}"`,
      `"${row.unitOfMeasure}"`,
      row.totalExpected,
      row.totalActual,
      row.totalActual - row.totalExpected,
    ].join(",")),
  ];

  // Inventory register
  if (data.rows.some(r => r.isInventory && r.captures.length > 0)) {
    lines.push(``, `"--- INVENTORY REGISTER ---"`);
    const invHead = [`"Asset Tag"`, `"Location"`, `"Item"`, `"Unit #"`, ...captureFields.map(f => `"${f}"`), `"Installed By"`, `"Installed Date"`];
    lines.push(invHead.join(","));

    for (const row of data.rows) {
      if (!row.isInventory) continue;
      for (const cap of row.captures) {
        lines.push([
          `"${cap.assetTag}"`,
          `"${cap.assetLocation || ""}"`,
          `"${row.description}"`,
          cap.unitIdx,
          ...captureFields.map(f => `"${cap.fields[f] || ""}"`),
          `"${cap.installedBy || ""}"`,
          `"${cap.installedAt ? fmtDate(cap.installedAt, data.projectTimeZoneId) : ""}"`,
        ].join(","));
      }
    }
  }

  // Missing BOM
  if (data.missingBomAssets.length > 0) {
    lines.push(``, `"--- ASSETS — BOM NOT RECORDED ---"`);
    lines.push(`"Asset Tag","Location","Status"`);
    data.missingBomAssets.forEach(a => lines.push(`"${a.assetTag}","${a.location || ""}","${a.status}"`));
  }

  // UTF-8 BOM prefix for Excel compatibility
  const content = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BOM_${safeFilename(data.projectJobNumber)}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
