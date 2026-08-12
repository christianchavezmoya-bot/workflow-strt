/**
 * generateProjectReport
 * Builds a richer A4 Project Completion Report PDF.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ProjectAsset } from "../types/projectAsset";
import type { AssetWorkflowRun, RunIssue } from "../types/assetWorkflowRun";
import type { BomExportRow, MissingBomAsset } from "./generateBomReport";
import { formatInstant } from "./datetime";

const NAVY: [number, number, number] = [26, 39, 68];
const TEAL: [number, number, number] = [0, 128, 128];
const TEAL_LIGHT: [number, number, number] = [224, 242, 242];
const GREY_BG: [number, number, number] = [241, 243, 246];
const GREY_LABEL: [number, number, number] = [100, 110, 125];
const BLACK: [number, number, number] = [20, 20, 20];
const WHITE: [number, number, number] = [255, 255, 255];
const RED: [number, number, number] = [211, 47, 47];
const GREEN: [number, number, number] = [46, 125, 50];
const ORANGE: [number, number, number] = [230, 119, 0];
const BLUE: [number, number, number] = [25, 118, 210];
const BORDER: [number, number, number] = [200, 208, 218];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 26;
const FOOTER_H = 8;
const SAFE_BOT = PAGE_H - FOOTER_H - 10;
const LOGO_W = 32;
const LOGO_H = 14;

export interface ProjectReportData {
  jobNumber: string;
  customerName: string;
  siteName: string;
  projectManager: string;
  status: string;
  startDate: string;
  finishDate: string;
  description: string;
  assets: ProjectAsset[];
  latestRuns: AssetWorkflowRun[];
  bomRows: BomExportRow[];
  missingBomAssets: MissingBomAsset[];
  businessLogoBase64: string | null;
  customerLogoBase64?: string | null;
  exportDate: string;
  projectTimeZoneId?: string | null;
  outputMode?: "download" | "blob";
  includeAssetList?: boolean;
  includeIssueList?: boolean;
}

type IssueRow = {
  assetTag: string;
  status: "Open" | "Closed";
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
  stepTitle?: string;
  reportedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
};

function detectImageFormat(dataUrl: string): string | null {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return null;
}

function fmtDate(iso: string | undefined | null, timeZoneId?: string | null): string {
  if (!iso) return "-";
  return formatInstant(iso, timeZoneId, { time: false, withZone: false }) || iso;
}

function fmtDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function issueCount(run: AssetWorkflowRun): number {
  try {
    return (JSON.parse(run.issuesJson || "[]") as RunIssue[]).filter((issue) => !issue.resolved).length;
  } catch {
    return 0;
  }
}

function addFooter(doc: jsPDF, pageNum: number, totalPages: number, exportDate: string) {
  const y = PAGE_H - FOOTER_H + 2;
  doc.setFillColor(...GREY_BG);
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, "F");
  doc.setFontSize(7);
  doc.setTextColor(...GREY_LABEL);
  doc.text(`Page ${pageNum} of ${totalPages}`, MARGIN, y + 3);
  doc.text("Project Completion Report - Confidential", PAGE_W / 2, y + 3, { align: "center" });
  doc.text(`Generated ${exportDate}`, PAGE_W - MARGIN, y + 3, { align: "right" });
}

function addHeader(doc: jsPDF, businessLogoBase64: string | null, customerLogoBase64: string | null) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  const addLogo = (logoBase64: string | null | undefined, x: number, align: "left" | "right") => {
    if (!logoBase64) return;
    const fmt = detectImageFormat(logoBase64);
    if (!fmt) return;
    try {
      const drawX = align === "left" ? x : x - LOGO_W;
      doc.addImage(logoBase64, fmt, drawX, (HEADER_H - LOGO_H) / 2, LOGO_W, LOGO_H, undefined, "FAST");
    } catch {
      // Skip bad image.
    }
  };

  addLogo(businessLogoBase64, MARGIN, "left");
  addLogo(customerLogoBase64, PAGE_W - MARGIN, "right");

  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Project Completion Report", PAGE_W / 2, HEADER_H / 2 - 1, { align: "center", baseline: "middle" });
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 220);
  doc.text("Strata N-go", PAGE_W / 2, HEADER_H / 2 + 5, { align: "center", baseline: "middle" });
}

function sectionBar(doc: jsPDF, y: number, title: string): number {
  doc.setFillColor(...TEAL);
  doc.rect(MARGIN, y, CONTENT_W, 6, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text(title.toUpperCase(), MARGIN + 3, y + 4.2);
  return y + 9;
}

function checkPageBreak(doc: jsPDF, y: number, exportDate: string, businessLogoBase64: string | null, customerLogoBase64: string | null, needed = 20): number {
  if (y + needed <= SAFE_BOT) return y;
  doc.addPage();
  addHeader(doc, businessLogoBase64, customerLogoBase64);
  return HEADER_H + 6;
}

function parseIssues(latestRuns: AssetWorkflowRun[], assets: ProjectAsset[]): IssueRow[] {
  const assetTagById = new Map(assets.map((asset) => [asset.id, asset.assetTag || asset.assetName || asset.id]));
  const rows: IssueRow[] = [];
  for (const run of latestRuns) {
    try {
      const issues = JSON.parse(run.issuesJson || "[]") as RunIssue[];
      for (const issue of issues) {
        rows.push({
          assetTag: assetTagById.get(run.assetId) ?? run.assetId,
          status: issue.resolved ? "Closed" : "Open",
          type: issue.isBlocking ? "Blocking" : issue.issueType === "scope-deviation" ? "Scope deviation" : "Observation",
          severity: issue.severity,
          description: issue.description,
          stepTitle: issue.stepTitle,
          reportedAt: issue.reportedAt,
          resolvedAt: issue.resolvedAt,
          resolvedBy: issue.resolvedBy,
          notes: issue.resolutionNote,
        });
      }
    } catch {
      // Ignore bad issue payloads.
    }
  }
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "Open" ? -1 : 1;
    const severityRank = { high: 0, medium: 1, low: 2 };
    return severityRank[a.severity] - severityRank[b.severity];
  });
  return rows;
}

function signatureStatusLabel(run: AssetWorkflowRun): string {
  if (run.customerSignedAt || run.signatureStatus === "Signed") return "Fully signed";
  if (run.installerSignedAt) return "Awaiting customer";
  if (run.signatureStatus === "PendingInstaller") return "Awaiting installer";
  return run.signatureStatus || "-";
}

export async function generateProjectReport(data: ProjectReportData): Promise<Blob | void> {
  const {
    jobNumber,
    customerName,
    siteName,
    projectManager,
    status,
    startDate,
    finishDate,
    description,
    assets,
    latestRuns,
    bomRows,
    missingBomAssets,
    businessLogoBase64,
    customerLogoBase64 = null,
    exportDate,
    projectTimeZoneId,
    outputMode = "download",
    includeAssetList = true,
    includeIssueList = true,
  } = data;

  const fmt = (iso: string | undefined | null) => fmtDate(iso, projectTimeZoneId);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  addHeader(doc, businessLogoBase64, customerLogoBase64);

  let y = HEADER_H + 6;

  const runByAsset = new Map(latestRuns.map((run) => [run.assetId, run]));
  const issueRows = parseIssues(latestRuns, assets);
  const openIssues = issueRows.filter((issue) => issue.status === "Open");
  const closedIssues = issueRows.filter((issue) => issue.status === "Closed");

  const totalAssets = assets.length;
  const completeAssets = assets.filter((asset) => asset.status === "Complete").length;
  const inProgressAssets = assets.filter((asset) => asset.status === "InProgress").length;
  const completionPct = totalAssets > 0 ? Math.round((completeAssets / totalAssets) * 100) : 0;
  const pendingSignatures = latestRuns.filter((run) => run.isLocked && !run.customerSignedAt && run.signatureStatus !== "WaivedCustomer").length;
  const lockedRuns = latestRuns.filter((run) => run.isLocked).length;
  const bomRecorded = latestRuns.filter((run) => run.isLocked && run.bomActualJson && run.bomActualJson !== "[]").length;
  const totalProductive = latestRuns.reduce((sum, run) => sum + (run.productiveSeconds || 0), 0);
  const totalDowntime = latestRuns.reduce((sum, run) => sum + (run.downtimeSeconds || 0), 0);
  const totalDowntimeEvents = latestRuns.reduce((sum, run) => sum + (run.downtimeEvents || 0), 0);

  const highIssues = openIssues.filter((issue) => issue.severity === "high").length;
  const mediumIssues = openIssues.filter((issue) => issue.severity === "medium").length;
  const lowIssues = openIssues.filter((issue) => issue.severity === "low").length;
  const highObservations = openIssues.filter((issue) => issue.type === "Observation" && issue.severity === "high").length;

  y = sectionBar(doc, y, "Project Details");
  const metadataRows = [
    ["Job Number", jobNumber || "-", "Status", status || "-"],
    ["Customer", customerName || "-", "Start Date", fmt(startDate)],
    ["Site", siteName || "-", "Finish Date", fmt(finishDate)],
    ["Project Manager", projectManager || "-", "Description", description || "-"],
  ];
  autoTable(doc, {
    startY: y,
    body: metadataRows,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2, textColor: BLACK },
    columnStyles: {
      0: { fontStyle: "bold", textColor: GREY_LABEL, cellWidth: 26 },
      1: { cellWidth: 64 },
      2: { fontStyle: "bold", textColor: GREY_LABEL, cellWidth: 26 },
      3: { cellWidth: 64 },
    },
    alternateRowStyles: { fillColor: GREY_BG },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  y = checkPageBreak(doc, y, exportDate, businessLogoBase64, customerLogoBase64, 28);
  y = sectionBar(doc, y, "Health Summary");
  const healthCards = [
    { label: "Assets Complete", value: `${completeAssets}/${totalAssets} (${completionPct}%)`, color: completionPct === 100 ? GREEN : TEAL },
    { label: "Assets In Progress", value: `${inProgressAssets}`, color: inProgressAssets > 0 ? BLUE : GREY_LABEL },
    { label: "Assets Pending Signatures", value: `${pendingSignatures}`, color: pendingSignatures > 0 ? ORANGE : GREEN },
    { label: "BOM Recorded", value: lockedRuns > 0 ? `${bomRecorded}/${lockedRuns}` : "N/A", color: TEAL },
    { label: "Open Issues", value: `${openIssues.length}`, color: openIssues.length > 0 ? RED : GREEN },
  ];
  const cardW = CONTENT_W / healthCards.length;
  healthCards.forEach((card, index) => {
    const x = MARGIN + index * cardW;
    doc.setFillColor(...GREY_BG);
    doc.roundedRect(x + 0.8, y, cardW - 1.6, 15, 1.4, 1.4, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    doc.text(card.label, x + cardW / 2, y + 4.8, { align: "center" });
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...card.color);
    doc.text(card.value, x + cardW / 2, y + 10.6, { align: "center" });
  });
  y += 21;

  y = checkPageBreak(doc, y, exportDate, businessLogoBase64, customerLogoBase64, 24);
  y = sectionBar(doc, y, "Issue Summary");
  const issueCards = [
    { label: "High", value: `${highIssues}`, color: RED },
    { label: "Medium", value: `${mediumIssues}`, color: ORANGE },
    { label: "Low", value: `${lowIssues}`, color: BLUE },
    { label: "High Observations", value: `${highObservations}`, color: TEAL },
  ];
  const issueCardW = CONTENT_W / issueCards.length;
  issueCards.forEach((card, index) => {
    const x = MARGIN + index * issueCardW;
    doc.setFillColor(...TEAL_LIGHT);
    doc.roundedRect(x + 0.8, y, issueCardW - 1.6, 15, 1.4, 1.4, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    doc.text(card.label, x + issueCardW / 2, y + 4.8, { align: "center" });
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...card.color);
    doc.text(card.value, x + issueCardW / 2, y + 10.6, { align: "center" });
  });
  y += 21;

  if (includeIssueList && issueRows.length > 0) {
    y = checkPageBreak(doc, y, exportDate, businessLogoBase64, customerLogoBase64, 34);
    y = sectionBar(doc, y, `Issue Register (${issueRows.length})`);
    autoTable(doc, {
      startY: y,
      head: [["Status", "Severity", "Type", "Asset", "Description", "Step", "When"]],
      body: issueRows.map((issue) => [
        issue.status,
        issue.severity.toUpperCase(),
        issue.type,
        issue.assetTag,
        issue.description,
        issue.stepTitle || "-",
        issue.status === "Closed" ? fmt(issue.resolvedAt || issue.reportedAt) : fmt(issue.reportedAt),
      ]),
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.2, cellPadding: 2, textColor: BLACK, overflow: "linebreak" },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 7.2 },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 16 },
        2: { cellWidth: 26 },
        3: { cellWidth: 20 },
        4: { cellWidth: 70 },
        5: { cellWidth: 22 },
        6: { cellWidth: 20 },
      },
      didParseCell: (hookData) => {
        if (hookData.section !== "body") return;
        if (hookData.column.index === 0) {
          const val = String(hookData.cell.raw);
          hookData.cell.styles.textColor = val === "Open" ? RED : GREEN;
          hookData.cell.styles.fontStyle = "bold";
        }
        if (hookData.column.index === 1) {
          const val = String(hookData.cell.raw);
          hookData.cell.styles.textColor = val === "HIGH" ? RED : val === "MEDIUM" ? ORANGE : BLUE;
          hookData.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  y = checkPageBreak(doc, y, exportDate, businessLogoBase64, customerLogoBase64, 28);
  y = sectionBar(doc, y, "Time Tracker");
  const timeCards = [
    { label: "Productive Time", value: fmtDuration(totalProductive), color: GREEN },
    { label: "Downtime", value: fmtDuration(totalDowntime), color: ORANGE },
    { label: "Downtime Events", value: `${totalDowntimeEvents}`, color: RED },
  ];
  const timeCardW = CONTENT_W / timeCards.length;
  timeCards.forEach((card, index) => {
    const x = MARGIN + index * timeCardW;
    doc.setFillColor(...GREY_BG);
    doc.roundedRect(x + 0.8, y, timeCardW - 1.6, 15, 1.4, 1.4, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    doc.text(card.label, x + timeCardW / 2, y + 4.8, { align: "center" });
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...card.color);
    doc.text(card.value, x + timeCardW / 2, y + 10.6, { align: "center" });
  });
  y += 21;

  const timeRows = latestRuns
    .filter((run) => (run.productiveSeconds || 0) > 0 || (run.downtimeSeconds || 0) > 0)
    .map((run) => {
      const asset = assets.find((candidate) => candidate.id === run.assetId);
      return [
        asset?.assetTag || asset?.assetName || run.assetId,
        fmtDuration(run.productiveSeconds || 0),
        fmtDuration(run.downtimeSeconds || 0),
        `${run.downtimeEvents || 0}`,
      ];
    });
  if (timeRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Asset", "Productive", "Downtime", "Events"]],
      body: timeRows,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.4, cellPadding: 2, textColor: BLACK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 7.4 },
      alternateRowStyles: { fillColor: GREY_BG },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  if (includeAssetList) {
    y = checkPageBreak(doc, y, exportDate, businessLogoBase64, customerLogoBase64, 36);
    y = sectionBar(doc, y, `Asset Status (${totalAssets} assets)`);
    autoTable(doc, {
      startY: y,
      head: [["Asset", "Tag", "Location", "Technician", "Status", "Completed", "Signature", "Open Issues"]],
      body: assets.map((asset) => {
        const run = runByAsset.get(asset.id);
        const technician = run?.completedByName || "-";
        return [
          asset.assetName || asset.assetTag || asset.id,
          asset.assetTag || "-",
          asset.location || "-",
          technician,
          asset.status,
          fmt(run?.completedAt),
          run ? signatureStatusLabel(run) : "-",
          run ? `${issueCount(run)}` : "0",
        ];
      }),
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.1, cellPadding: 2, textColor: BLACK },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 7.1 },
      alternateRowStyles: { fillColor: GREY_BG },
      didParseCell: (hookData) => {
        if (hookData.section !== "body") return;
        if (hookData.column.index === 4) {
          const val = String(hookData.cell.raw);
          if (val === "Closed") hookData.cell.styles.textColor = TEAL;
          else if (val === "Complete") hookData.cell.styles.textColor = GREEN;
          else if (val === "InProgress") hookData.cell.styles.textColor = BLUE;
          else if (val === "Issue" || val === "Paused" || val === "Pending") hookData.cell.styles.textColor = ORANGE;
        }
        if (hookData.column.index === 6) {
          const val = String(hookData.cell.raw);
          if (val === "Fully signed") hookData.cell.styles.textColor = GREEN;
          else if (val === "Awaiting customer" || val === "Awaiting installer") hookData.cell.styles.textColor = ORANGE;
        }
        if (hookData.column.index === 7 && Number(String(hookData.cell.raw)) > 0) {
          hookData.cell.styles.textColor = RED;
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  if (bomRows.length > 0 || missingBomAssets.length > 0) {
    y = checkPageBreak(doc, y, exportDate, businessLogoBase64, customerLogoBase64, 32);
    y = sectionBar(doc, y, "Parts & Materials");
    if (bomRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Item", "Type", "Expected", "Actual", "Variance"]],
        body: bomRows.map((row) => {
          const diff = row.totalActual - row.totalExpected;
          return [
            row.description,
            row.isInventory ? "Inventory" : "Consumable",
            row.totalExpected > 0 ? `${row.totalExpected} ${row.unitOfMeasure}` : "-",
            `${row.totalActual} ${row.unitOfMeasure}`,
            diff === 0 ? "-" : diff > 0 ? `+${diff}` : `${diff}`,
          ];
        }),
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 7.2, cellPadding: 2, textColor: BLACK },
        headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 7.2 },
        alternateRowStyles: { fillColor: TEAL_LIGHT },
        didParseCell: (hookData) => {
          if (hookData.section === "body" && hookData.column.index === 4) {
            const val = String(hookData.cell.raw);
            if (val.startsWith("+")) hookData.cell.styles.textColor = GREEN;
            else if (val !== "-") hookData.cell.styles.textColor = RED;
          }
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    }

    if (missingBomAssets.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Missing BOM Asset", "Location", "Status"]],
        body: missingBomAssets.map((asset) => [asset.assetTag, asset.location || "-", asset.status]),
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 7.2, cellPadding: 2, textColor: BLACK },
        headStyles: { fillColor: RED, textColor: WHITE, fontStyle: "bold", fontSize: 7.2 },
        alternateRowStyles: { fillColor: GREY_BG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
  }

  if (latestRuns.some((run) => run.isLocked)) {
    y = checkPageBreak(doc, y, exportDate, businessLogoBase64, customerLogoBase64, 30);
    y = sectionBar(doc, y, "Signature Status");
    autoTable(doc, {
      startY: y,
      head: [["Asset", "Technician", "Installer Sign-off", "Customer Sign-off"]],
      body: latestRuns.filter((run) => run.isLocked).map((run) => {
        const asset = assets.find((candidate) => candidate.id === run.assetId);
        return [
          asset?.assetTag || asset?.assetName || run.assetId,
          run.completedByName || "-",
          run.installerSignedAt ? fmt(run.installerSignedAt) : "Pending",
          run.customerSignedAt ? fmt(run.customerSignedAt) : run.signatureStatus === "WaivedCustomer" ? "Waived" : "Pending",
        ];
      }),
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.4, cellPadding: 2, textColor: BLACK },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 7.4 },
      alternateRowStyles: { fillColor: GREY_BG },
      didParseCell: (hookData) => {
        if (hookData.section !== "body" || hookData.column.index < 2) return;
        const val = String(hookData.cell.raw);
        if (val === "Pending") hookData.cell.styles.textColor = ORANGE;
        else if (val === "Waived") hookData.cell.styles.textColor = GREY_LABEL;
        else hookData.cell.styles.textColor = GREEN;
      },
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    addFooter(doc, page, totalPages, exportDate);
  }

  if (outputMode === "blob") {
    return doc.output("blob");
  }

  const filename = `ProjectReport_${jobNumber || "export"}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

