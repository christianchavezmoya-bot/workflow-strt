/**
 * generateProjectReport
 * Builds a comprehensive A4 "Project Completion Report" PDF and triggers a download.
 *
 * Sections:
 *  1. Header band — business logo + "Project Completion Report" + export date
 *  2. Project metadata — two-column block
 *  3. Health KPI strip — completion %, blocking issues, pending signatures, BOM %
 *  4. Asset Status table — per asset with status, technician, completion date
 *  5. Open Issues — blocking first, then observations, scope deviations
 *  6. Parts & Materials — BOM summary (delegates to same BomExportRow data)
 *  7. Signature Status — who signed, when
 *  8. Footer (every page) — page number, date, company
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ProjectAsset } from "../types/projectAsset";
import type { AssetWorkflowRun, RunIssue } from "../types/assetWorkflowRun";
import type { BomExportRow, MissingBomAsset } from "./generateBomReport";

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

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ProjectReportData {
  jobNumber:     string;
  customerName:  string;
  siteName:      string;
  projectManager: string;
  status:        string;
  startDate:     string;
  finishDate:    string;
  description:   string;
  assets:        ProjectAsset[];
  latestRuns:    AssetWorkflowRun[];
  bomRows:       BomExportRow[];
  missingBomAssets: MissingBomAsset[];
  businessLogoBase64: string | null;
  exportDate:    string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectImageFormat(dataUrl: string): string | null {
  if (dataUrl.startsWith("data:image/png"))  return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return null;
}

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function addFooter(doc: jsPDF, pageNum: number, totalPages: number, exportDate: string) {
  const y = PAGE_H - FOOTER_H + 2;
  doc.setFillColor(...GREY_BG);
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, "F");
  doc.setFontSize(7);
  doc.setTextColor(...GREY_LABEL);
  doc.text(`Page ${pageNum} of ${totalPages}`, MARGIN, y + 3);
  doc.text("Project Completion Report — Confidential", PAGE_W / 2, y + 3, { align: "center" });
  doc.text(`Generated ${exportDate}`, PAGE_W - MARGIN, y + 3, { align: "right" });
}

function addHeader(doc: jsPDF, logoBase64: string | null) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  // Logo
  if (logoBase64) {
    const fmt = detectImageFormat(logoBase64);
    if (fmt) {
      try {
        doc.addImage(logoBase64, fmt, MARGIN, (HEADER_H - LOGO_H) / 2, LOGO_W, LOGO_H, undefined, "FAST");
      } catch { /* skip */ }
    }
  }

  // Title
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Project Completion Report", PAGE_W / 2, HEADER_H / 2 - 1, { align: "center", baseline: "middle" });
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 220);
  doc.text("Commtrac Field Operations", PAGE_W / 2, HEADER_H / 2 + 5, { align: "center", baseline: "middle" });
}

function sectionBar(doc: jsPDF, y: number, title: string): number {
  doc.setFillColor(...TEAL);
  doc.rect(MARGIN, y, CONTENT_W, 6, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text(title.toUpperCase(), MARGIN + 3, y + 4.2);
  return y + 6 + 3;
}

function checkPageBreak(doc: jsPDF, y: number, needed = 20): number {
  if (y + needed > SAFE_BOT) {
    doc.addPage();
    addHeader(doc, null);
    return HEADER_H + 4;
  }
  return y;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateProjectReport(data: ProjectReportData): Promise<void> {
  const {
    jobNumber, customerName, siteName, projectManager,
    status, startDate, finishDate, description,
    assets, latestRuns, bomRows, missingBomAssets,
    businessLogoBase64, exportDate,
  } = data;

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  addHeader(doc, businessLogoBase64);

  let y = HEADER_H + 6;

  // ── 1. Project Metadata ────────────────────────────────────────────────────
  y = sectionBar(doc, y, "Project Details");

  const metaLeft: [string, string][] = [
    ["Job Number",       jobNumber || "—"],
    ["Customer",         customerName || "—"],
    ["Site",             siteName || "—"],
    ["Project Manager",  projectManager || "—"],
  ];
  const metaRight: [string, string][] = [
    ["Status",           status || "—"],
    ["Start Date",       fmtDate(startDate)],
    ["Finish Date",      fmtDate(finishDate)],
    ["Description",      description || "—"],
  ];

  const colW = CONTENT_W / 2 - 2;
  const metaRowH = 5.5;
  metaLeft.forEach(([label, value], i) => {
    const ry = y + i * metaRowH;
    doc.setFillColor(...(i % 2 === 0 ? GREY_BG : WHITE));
    doc.rect(MARGIN, ry, colW, metaRowH, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY_LABEL);
    doc.setFont("helvetica", "normal");
    doc.text(label, MARGIN + 2, ry + metaRowH * 0.65);
    doc.setTextColor(...BLACK);
    doc.setFont("helvetica", "bold");
    doc.text(value, MARGIN + 38, ry + metaRowH * 0.65);
  });
  metaRight.forEach(([label, value], i) => {
    const ry = y + i * metaRowH;
    const rx = MARGIN + colW + 4;
    doc.setFillColor(...(i % 2 === 0 ? GREY_BG : WHITE));
    doc.rect(rx, ry, colW, metaRowH, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY_LABEL);
    doc.setFont("helvetica", "normal");
    doc.text(label, rx + 2, ry + metaRowH * 0.65);
    doc.setTextColor(...BLACK);
    doc.setFont("helvetica", "bold");
    doc.text(value, rx + 38, ry + metaRowH * 0.65);
  });

  y += metaLeft.length * metaRowH + 5;

  // ── 2. Health KPI strip ────────────────────────────────────────────────────
  const runByAsset = new Map(latestRuns.map(r => [r.assetId, r]));
  const totalAssets    = assets.length;
  const completeAssets = assets.filter(a => a.status === "Complete").length;
  const pctComplete    = totalAssets > 0 ? Math.round((completeAssets / totalAssets) * 100) : 0;

  const blockingIssues = latestRuns.reduce((acc, r) => {
    try {
      const issues = JSON.parse(r.issuesJson || "[]") as RunIssue[];
      return acc + issues.filter(i => !i.resolved && i.isBlocking).length;
    } catch { return acc; }
  }, 0);

  const pendingSignatures = latestRuns.filter(r => r.isLocked && !r.customerSignedAt && r.signatureStatus !== "WaivedCustomer").length;
  const lockedRuns        = latestRuns.filter(r => r.isLocked).length;
  const bomComplete       = latestRuns.filter(r => r.isLocked && r.bomActualJson).length;

  y = checkPageBreak(doc, y, 22);
  y = sectionBar(doc, y, "Health Summary");

  const kpis = [
    { label: "Assets Complete", value: `${completeAssets}/${totalAssets} (${pctComplete}%)`, color: pctComplete === 100 ? GREEN : TEAL },
    { label: "Blocking Issues", value: `${blockingIssues}`, color: blockingIssues > 0 ? RED : GREEN },
    { label: "Pending Signatures", value: `${pendingSignatures}`, color: pendingSignatures > 0 ? ORANGE : GREEN },
    { label: "BOM Recorded", value: lockedRuns > 0 ? `${bomComplete}/${lockedRuns}` : "N/A", color: TEAL },
  ];

  const kpiW = CONTENT_W / kpis.length;
  kpis.forEach(({ label, value, color }, i) => {
    const rx = MARGIN + i * kpiW;
    doc.setFillColor(...GREY_BG);
    doc.roundedRect(rx + 1, y, kpiW - 2, 14, 1.5, 1.5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    doc.text(label, rx + kpiW / 2, y + 4.5, { align: "center" });
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...color);
    doc.text(value, rx + kpiW / 2, y + 11, { align: "center" });
  });

  y += 14 + 6;

  // ── 3. Asset Status Table ──────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 30);
  y = sectionBar(doc, y, `Asset Status (${totalAssets} assets)`);

  const assetRows = assets.map(a => {
    const run = runByAsset.get(a.id);
    const issues = (() => {
      try { return JSON.parse(run?.issuesJson || "[]") as RunIssue[]; } catch { return []; }
    })();
    const openBlocking = issues.filter(i => !i.resolved && i.isBlocking).length;
    const statusLabel =
      run?.isLocked && !run.customerSignedAt && run.signatureStatus !== "WaivedCustomer" ? "Awaiting Signature" :
      a.status === "Complete"   ? "Complete"   :
      a.status === "InProgress" ? "In Progress" :
      a.status === "Issue"      ? "Issue"       : a.status;

    return [
      a.assetName ?? a.assetTag,
      a.assetTag,
      a.location ?? "—",
      run?.completedByName ?? "—",
      statusLabel,
      fmtDate(run?.completedAt),
      openBlocking > 0 ? `${openBlocking} blocking` : "—",
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Asset Name", "Tag", "Location", "Technician", "Status", "Completed", "Issues"]],
    body: assetRows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 7.5, cellPadding: 2, textColor: BLACK },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
    alternateRowStyles: { fillColor: GREY_BG },
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 22 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 26 },
      5: { cellWidth: 20 },
      6: { cellWidth: 24 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 4) {
        const val = String(hookData.cell.raw);
        if (val === "Complete") hookData.cell.styles.textColor = GREEN;
        else if (val === "Issue" || val === "Awaiting Signature") hookData.cell.styles.textColor = ORANGE;
        else if (val === "In Progress") hookData.cell.styles.textColor = TEAL;
      }
      if (hookData.section === "body" && hookData.column.index === 6) {
        const val = String(hookData.cell.raw);
        if (val !== "—") hookData.cell.styles.textColor = RED;
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // ── 4. Open Issues ────────────────────────────────────────────────────────
  const allIssues: Array<{ issue: RunIssue; assetTag: string; run: AssetWorkflowRun }> = [];
  for (const run of latestRuns) {
    const asset = assets.find(a => a.id === run.assetId);
    try {
      const issues = JSON.parse(run.issuesJson || "[]") as RunIssue[];
      for (const iss of issues) {
        if (!iss.resolved) allIssues.push({ issue: iss, assetTag: asset?.assetTag ?? run.assetId, run });
      }
    } catch { /* skip */ }
  }
  allIssues.sort((a, b) => (a.issue.isBlocking === b.issue.isBlocking ? 0 : a.issue.isBlocking ? -1 : 1));

  if (allIssues.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = sectionBar(doc, y, `Open Issues (${allIssues.length})`);

    const issueRows = allIssues.map(({ issue, assetTag }) => [
      issue.isBlocking ? "BLOCKING" : issue.issueType === "scope-deviation" ? "SCOPE" : "OBS",
      issue.severity?.toUpperCase() ?? "—",
      issue.description,
      issue.stepTitle ?? "—",
      assetTag,
      fmtDate(issue.reportedAt),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Type", "Severity", "Description", "Step", "Asset", "Reported"]],
      body: issueRows,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.5, cellPadding: 2, textColor: BLACK },
      headStyles: { fillColor: RED, textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: {
        0: { cellWidth: 18, fontStyle: "bold" },
        1: { cellWidth: 16 },
        2: { cellWidth: 62 },
        3: { cellWidth: 32 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
      },
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 0) {
          const val = String(hookData.cell.raw);
          hookData.cell.styles.textColor = val === "BLOCKING" ? RED : val === "SCOPE" ? ORANGE : TEAL;
        }
        if (hookData.section === "body" && hookData.column.index === 1) {
          const val = String(hookData.cell.raw);
          hookData.cell.styles.textColor = val === "HIGH" ? RED : val === "MEDIUM" ? ORANGE : GREY_LABEL;
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  // ── 5. Parts & Materials (BOM) ────────────────────────────────────────────
  if (bomRows.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = sectionBar(doc, y, `Parts & Materials (${bomRows.length} line items)`);

    const bomTableRows = bomRows.map(row => {
      const diff = row.totalActual - row.totalExpected;
      return [
        row.description,
        row.isInventory ? "Inventory" : "Consumable",
        row.totalExpected > 0 ? `${row.totalExpected} ${row.unitOfMeasure}` : "—",
        `${row.totalActual} ${row.unitOfMeasure}`,
        diff === 0 ? "—" : diff > 0 ? `+${diff}` : `${diff}`,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Item", "Type", "Expected", "Actual", "Variance"]],
      body: bomTableRows,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.5, cellPadding: 2, textColor: BLACK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: TEAL_LIGHT },
      columnStyles: {
        0: { cellWidth: 82 },
        1: { cellWidth: 22 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 18 },
      },
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 4) {
          const val = String(hookData.cell.raw);
          if (val.startsWith("+")) hookData.cell.styles.textColor = GREEN;
          else if (val !== "—") hookData.cell.styles.textColor = RED;
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  // ── 6. Signature Status ───────────────────────────────────────────────────
  const signRows = latestRuns.filter(r => r.isLocked).map(r => {
    const asset = assets.find(a => a.id === r.assetId);
    const custStatus =
      r.signatureStatus === "WaivedCustomer" ? "Waived" :
      r.customerSignedAt ? `Signed ${fmtDate(r.customerSignedAt)}` :
      "Pending";
    return [
      asset?.assetTag ?? r.assetId,
      r.completedByName ?? "—",
      r.installerSignedAt ? fmtDate(r.installerSignedAt) : "Pending",
      custStatus,
    ];
  });

  if (signRows.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = sectionBar(doc, y, "Signature Status");

    autoTable(doc, {
      startY: y,
      head: [["Asset", "Technician", "Installer Sign-off", "Customer Sign-off"]],
      body: signRows,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.5, cellPadding: 2, textColor: BLACK },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: GREY_BG },
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index >= 2) {
          const val = String(hookData.cell.raw);
          if (val === "Pending") hookData.cell.styles.textColor = ORANGE;
          else if (val === "Waived") hookData.cell.styles.textColor = GREY_LABEL;
          else hookData.cell.styles.textColor = GREEN;
        }
      },
    });
  }

  // ── Footers on every page ─────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addFooter(doc, p, totalPages, exportDate);
  }

  const filename = `ProjectReport_${jobNumber || "export"}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
