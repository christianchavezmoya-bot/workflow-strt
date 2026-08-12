/**
 * Export Issues Board rows to PDF or Excel.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { ClosedIssueRecord, OpenIssueRecord } from "../services/assetWorkflowRunService";

const NAVY: [number, number, number] = [26, 39, 68];
const GREY_BG: [number, number, number] = [241, 243, 246];
const BLACK: [number, number, number] = [20, 20, 20];
const WHITE: [number, number, number] = [255, 255, 255];
const RED: [number, number, number] = [211, 47, 47];
const ORANGE: [number, number, number] = [230, 119, 0];
const BLUE: [number, number, number] = [25, 118, 210];

const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

export type IssuesExportMode = "open" | "history";

export interface IssuesExportData {
  mode: IssuesExportMode;
  exportDate: string;
  rows: OpenIssueRecord[] | ClosedIssueRecord[];
}

function typeLabel(t: string): string {
  if (t === "blocking") return "Blocking";
  if (t === "scope-deviation") return "Scope deviation";
  return "Observation";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 48) || "export";
}

function openRows(rows: OpenIssueRecord[]): string[][] {
  return rows.map((issue) => [
    issue.assetTag || issue.assetName || "-",
    issue.jobNumber || "-",
    typeLabel(issue.issueType),
    issue.severity.toUpperCase(),
    issue.description,
    issue.stepTitle || "-",
    fmtDate(issue.reportedAt),
    issue.createdBy || "-",
  ]);
}

function historyRows(rows: ClosedIssueRecord[]): string[][] {
  return rows.map((issue) => [
    issue.assetTag || issue.assetName || "-",
    issue.jobNumber || "-",
    typeLabel(issue.issueType),
    issue.severity.toUpperCase(),
    issue.description,
    issue.stepTitle || "-",
    fmtDate(issue.reportedAt),
    issue.createdBy || "-",
    fmtDate(issue.resolvedAt),
    issue.resolvedBy || "-",
    issue.resolutionNote || "-",
  ]);
}

export function exportIssuesPdf(data: IssuesExportData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const title = data.mode === "open" ? "Open Issues Export" : "Resolved Issues Export";

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 22, "F");
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.text(title, MARGIN, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 220);
  doc.text(`Generated ${data.exportDate} · ${data.rows.length} issue${data.rows.length === 1 ? "" : "s"}`, MARGIN, 16);

  const head =
    data.mode === "open"
      ? [["Asset", "Project", "Type", "Severity", "Description", "Step", "Reported", "By"]]
      : [["Asset", "Project", "Type", "Severity", "Description", "Step", "Reported", "By", "Closed", "Closed By", "Corrective Action"]];

  const body =
    data.mode === "open"
      ? openRows(data.rows as OpenIssueRecord[])
      : historyRows(data.rows as ClosedIssueRecord[]);

  autoTable(doc, {
    startY: 28,
    head,
    body,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 7.2, cellPadding: 2, textColor: BLACK, overflow: "linebreak" },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 7.2 },
    alternateRowStyles: { fillColor: GREY_BG },
    didParseCell: (hookData) => {
      if (hookData.section !== "body") return;
      if (hookData.column.index === 3) {
        const val = String(hookData.cell.raw);
        hookData.cell.styles.textColor = val === "HIGH" ? RED : val === "MEDIUM" ? ORANGE : BLUE;
        hookData.cell.styles.fontStyle = "bold";
      }
    },
  });

  const filename = `Issues_${data.mode}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

export function exportIssuesExcel(data: IssuesExportData): void {
  const wb = XLSX.utils.book_new();
  const header =
    data.mode === "open"
      ? ["Asset", "Project", "Type", "Severity", "Description", "Step", "Reported", "By"]
      : ["Asset", "Project", "Type", "Severity", "Description", "Step", "Reported", "By", "Closed", "Closed By", "Corrective Action"];

  const body =
    data.mode === "open"
      ? openRows(data.rows as OpenIssueRecord[])
      : historyRows(data.rows as ClosedIssueRecord[]);

  const sheet = XLSX.utils.aoa_to_sheet([
    [data.mode === "open" ? "Open Issues Export" : "Resolved Issues Export"],
    [`Generated ${data.exportDate}`],
    [],
    header,
    ...body,
  ]);
  sheet["!cols"] = header.map((label) => ({ wch: Math.max(12, Math.min(40, label.length + 4)) }));
  XLSX.utils.book_append_sheet(wb, sheet, data.mode === "open" ? "Open Issues" : "History");
  const filename = `Issues_${safeFilenamePart(data.mode)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
