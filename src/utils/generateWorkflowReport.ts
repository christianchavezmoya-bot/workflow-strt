/**
 * generateWorkflowReport
 * Builds a professional A4 PDF installation record and triggers a browser download.
 *
 * Sections:
 *  1. Header band — business logo (left) + title (centre) + customer logo (right)
 *  2. Asset & run metadata — 2-column table
 *  3. Workflow steps — numbered list with captured inputs
 *  4. Issues — only when present
 *  5. Signature block
 *  6. Footer (every page) — page number, company name, date generated
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CellDef } from "jspdf-autotable";
import type { AssetWorkflowRun, RunIssue, StepResult } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import type { WorkflowStep } from "../types/workflow";

// ─── Colour palette ──────────────────────────────────────────────────────────
const NAVY: [number, number, number] = [26, 39, 68];    // #1a2744  header band
const GREY_BG: [number, number, number] = [241, 243, 246]; // section header bg
const GREY_LABEL: [number, number, number] = [100, 110, 125]; // label text
const BLACK: [number, number, number] = [20, 20, 20];
const WHITE: [number, number, number] = [255, 255, 255];
const RED_DOT: [number, number, number] = [244, 67, 54];
const ORANGE_DOT: [number, number, number] = [255, 152, 0];
const BLUE_DOT: [number, number, number] = [33, 150, 243];

// ─── Page geometry (all in mm) ───────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 24;
const FOOTER_H = 8;

// ─── Logo dimensions — fixed for consistent layout across all reports ─────────
// A4 header is 24 mm tall; logos are 14 mm tall (5 mm top + 5 mm bottom padding).
// 38 mm wide gives a 2.7 : 1 ratio that suits most corporate logos.
const LOGO_W = 38;   // mm
const LOGO_H = 14;   // mm
const LOGO_Y = (HEADER_H - LOGO_H) / 2;   // vertically centred in the header band

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectImageFormat(dataUrl: string): string | null {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  if (dataUrl.startsWith("data:image/gif")) return "GIF";
  return null;
}

/**
 * Resolves any image source (data URL or http/https URL) to a PNG/JPEG data URL
 * suitable for jsPDF's addImage. Returns null if the image cannot be loaded.
 */
export async function resolveImageToDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  // Already a supported data URL
  if (detectImageFormat(src)) return src;
  // SVG data URL → rasterise via canvas
  if (src.startsWith("data:image/svg")) return svgDataUrlToPng(src);
  // HTTP/HTTPS URL (or relative) — fetch and convert
  try {
    const resp = await fetch(src, { mode: "cors" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    // If SVG from URL, rasterise; otherwise read as data URL directly
    if (blob.type.includes("svg")) {
      const text = await blob.text();
      const svgDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(text)));
      return svgDataUrlToPng(svgDataUrl);
    }
    return new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function svgDataUrlToPng(svgDataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 300;
        canvas.height = img.naturalHeight || 100;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = svgDataUrl;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Measures the natural pixel dimensions of a data-URL image via an HTMLImageElement.
 * Returns null if the image fails to load.
 */
function getImageNaturalSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function parseSteps(snapshotJson: string): WorkflowStep[] {
  try {
    const snap = JSON.parse(snapshotJson) as { stepsJson?: string };
    if (snap?.stepsJson) {
      const parsed = JSON.parse(snap.stepsJson);
      if (Array.isArray(parsed)) return parsed as WorkflowStep[];
      if (parsed?.steps && Array.isArray(parsed.steps)) return parsed.steps as WorkflowStep[];
    }
  } catch {}
  return [];
}

function parseStepResults(json: string): StepResult[] {
  try {
    return (JSON.parse(json) as StepResult[]).filter((r) => r.stepId !== "__nav__");
  } catch { return []; }
}

function parseIssues(json: string): RunIssue[] {
  try { return JSON.parse(json) as RunIssue[]; } catch { return []; }
}

function fmt(date: string | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtTime(date: string | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ─── PDF generator ───────────────────────────────────────────────────────────

export interface GenerateReportParams {
  run: AssetWorkflowRun;
  asset: ProjectAsset;
  workflowConfigName: string;
  businessLogoBase64?: string | null;
  customerLogoBase64?: string | null;
  /** Display name for the company (shown in footer if no logo). */
  companyName?: string;
  /** Customer / project details — shown in the metadata table when provided. */
  customerName?: string;
  jobNumber?: string;
  siteName?: string;
  siteLocation?: string;
  assignedTechnician?: string;
}

export async function generateWorkflowReport(params: GenerateReportParams): Promise<void> {
  const {
    run, asset, workflowConfigName,
    businessLogoBase64, customerLogoBase64, companyName = "Commtrac",
    customerName, jobNumber, siteName, siteLocation, assignedTechnician,
  } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const totalPages = () => (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();

  const steps = parseSteps(run.workflowSnapshotJson ?? "");
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const stepResults = parseStepResults(run.stepResultsJson);
  const issues = parseIssues(run.issuesJson);
  const openIssues = issues.filter((i) => !i.resolved);

  const generated = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  // ── 1. Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  // ── Logo helper — fits logo proportionally inside the 38×14 mm slot ──────────
  // Scales the image so neither dimension exceeds the slot, then centres it.
  // Falls back to a text label when no image is available (left side only).
  const addLogoOrText = async (logoSrc: string | null | undefined, slotX: number, textLabel: string) => {
    const fmt_type = logoSrc ? detectImageFormat(logoSrc) : null;
    if (logoSrc && fmt_type) {
      try {
        const size = await getImageNaturalSize(logoSrc);
        let drawW = LOGO_W;
        let drawH = LOGO_H;
        if (size && size.w > 0 && size.h > 0) {
          // Scale to fill the full slot height — both logos share the same height
          // in the header band. Cap width at LOGO_W for very wide images.
          const scaleByH = LOGO_H / size.h;
          drawH = LOGO_H;
          drawW = Math.min(size.w * scaleByH, LOGO_W);
        }
        // Centre within the fixed slot (horizontally only; height is always filled)
        const offsetX = (LOGO_W - drawW) / 2;
        const offsetY = 0;
        doc.addImage(logoSrc, fmt_type, slotX + offsetX, LOGO_Y + offsetY, drawW, drawH, undefined, "FAST");
        return;
      } catch (e) {
        console.warn("[generateWorkflowReport] addImage failed:", e);
      }
    }
    // Fallback: text label (left side only — right side has no text fallback)
    if (textLabel) {
      doc.setTextColor(...WHITE);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(textLabel, slotX, HEADER_H / 2 + 2);
    }
  };

  await addLogoOrText(businessLogoBase64, MARGIN, companyName.toUpperCase());

  // Centre title — includes asset tag for immediate identification
  const assetTag = asset.assetTag ? ` — ${asset.assetTag}` : "";
  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`INSTALLATION RECORD${assetTag}`, PAGE_W / 2, HEADER_H / 2 + 2, { align: "center" });

  // Customer logo — right side, right-aligned to the slot's right edge
  await addLogoOrText(customerLogoBase64, PAGE_W - MARGIN - LOGO_W, "");

  let y = HEADER_H + 6;

  // ── Footer helper (called via didDrawPage hook on each page) ────────────────
  function drawFooter(pageNum: number) {
    const total = totalPages();
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    const footY = PAGE_H - 5;
    doc.text(`Page ${pageNum} of ${total}`, MARGIN, footY);
    doc.text(companyName, PAGE_W / 2, footY, { align: "center" });
    doc.text(`Generated: ${generated}`, PAGE_W - MARGIN, footY, { align: "right" });
  }

  // ── 2. Asset & run metadata ─────────────────────────────────────────────────
  const metaRows: [string, string, string, string][] = [
    ["Asset Tag", asset.assetTag ?? "—", "Date Completed", run.completedAt ? fmt(run.completedAt) : "—"],
    ["Asset Name", asset.assetName ?? "—", "Completed By", run.completedByName ?? "—"],
    ["Model", asset.assetModel ?? "—", "Workflow", workflowConfigName],
    ["Manufacturer", asset.manufacturer ?? "—", "Status", run.status],
  ];

  // Customer / project rows — only appended when data is available
  if (customerName || jobNumber) {
    metaRows.push(["Customer", customerName ?? "—", "Job #", jobNumber ?? "—"]);
  }
  if (siteName || siteLocation) {
    metaRows.push(["Site", siteName ?? "—", "Location", siteLocation ?? "—"]);
  }
  if (assignedTechnician) {
    metaRows.push(["Technician", assignedTechnician, "", ""]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
    columnStyles: {
      0: { fontStyle: "bold", textColor: GREY_LABEL, cellWidth: CONTENT_W * 0.18 },
      1: { textColor: BLACK, cellWidth: CONTENT_W * 0.30 },
      2: { fontStyle: "bold", textColor: GREY_LABEL, cellWidth: CONTENT_W * 0.18 },
      3: { textColor: BLACK, cellWidth: CONTENT_W * 0.30 },
    },
    body: metaRows,
    didDrawPage: (data) => { drawFooter(data.pageNumber); },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ── 3. Workflow Steps ────────────────────────────────────────────────────────

  // Section header
  if (y > PAGE_H - FOOTER_H - 30) { doc.addPage(); y = 14; }
  doc.setFillColor(...GREY_BG);
  doc.rect(MARGIN, y, CONTENT_W, 6, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREY_LABEL);
  doc.text("WORKFLOW STEPS", MARGIN + 2, y + 4.2);
  y += 8;

  if (stepResults.length === 0) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    doc.text("No step data captured.", MARGIN, y + 4);
    y += 8;
  } else {
    const stepTableBody: (string | CellDef)[][] = [];

    let stepNumber = 1;
    for (const sr of stepResults) {
      const step = stepMap.get(sr.stepId);
      const title = step?.title ?? sr.stepId.slice(0, 8) + "...";
      const inputDefs = step?.inputs ?? [];
      const entries = Object.entries(sr.values ?? {}).filter(([, v]) => v);
      const time = sr.completedAt ? fmtTime(sr.completedAt) : "";

      // Step title row
      stepTableBody.push([
        {
          content: `${stepNumber}. ${title}`,
          styles: { fontStyle: "bold" as const, textColor: BLACK },
        },
        { content: time, styles: { fontStyle: "normal" as const, textColor: GREY_LABEL } },
      ]);

      // Input rows
      for (const [inputId, val] of entries) {
        const inputDef = inputDefs.find((i) => i.id === inputId);
        const label = inputDef?.label ?? inputId;

        // Component inputs store a JSON object {subFieldId: value} — decode to named lines
        if (inputDef?.type === "component" && inputDef.subFields?.length && val) {
          try {
            const sub: Record<string, string> = JSON.parse(val);
            const parts = inputDef.subFields.filter((sf) => sub[sf.id]).map((sf) => `${sf.name}: ${sub[sf.id]}`);
            if (parts.length > 0) {
              stepTableBody.push([{ content: `     ${label}:`, styles: { fontStyle: "normal" as const, textColor: GREY_LABEL } }, ""]);
              for (const part of parts) {
                stepTableBody.push([{ content: `               > ${part}`, styles: { fontStyle: "normal" as const, textColor: BLACK } }, ""]);
              }
              continue;
            }
          } catch { /* fall through to plain display */ }
        }

        stepTableBody.push([`     ${label}: ${val}`, ""]);
      }

      stepNumber++;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "plain",
      styles: { fontSize: 8.5, cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 } },
      columnStyles: {
        0: { cellWidth: CONTENT_W - 22 },
        1: { cellWidth: 22, halign: "right", textColor: GREY_LABEL },
      },
      body: stepTableBody,
      didDrawPage: (data) => { drawFooter(data.pageNumber); },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── 4. Issues ────────────────────────────────────────────────────────────────
  if (issues.length > 0) {
    if (y > PAGE_H - FOOTER_H - 35) { doc.addPage(); y = 14; }

    doc.setFillColor(...GREY_BG);
    doc.rect(MARGIN, y, CONTENT_W, 6, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREY_LABEL);
    doc.text(`ISSUES FLAGGED (${openIssues.length} open)`, MARGIN + 2, y + 4.2);
    y += 8;

    const issueRows: string[][] = issues.map((issue) => {
      const status = issue.resolved ? "Resolved" : issue.isBlocking ? "Blocking" : "Open";
      const step = issue.stepTitle ?? "";
      return [
        issue.description,
        issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1),
        step,
        status,
        fmt(issue.reportedAt),
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "plain",
      head: [["Description", "Severity", "Step", "Status", "Reported"]],
      body: issueRows,
      styles: { fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
      headStyles: { fontStyle: "bold", textColor: GREY_LABEL, fillColor: false as unknown as [number, number, number] },
      columnStyles: {
        0: { cellWidth: CONTENT_W * 0.38 },
        1: { cellWidth: CONTENT_W * 0.14 },
        2: { cellWidth: CONTENT_W * 0.24 },
        3: { cellWidth: CONTENT_W * 0.12 },
        4: { cellWidth: CONTENT_W * 0.12 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          const sev = String(data.cell.raw).toLowerCase();
          if (sev === "high") data.cell.styles.textColor = RED_DOT;
          else if (sev === "medium") data.cell.styles.textColor = ORANGE_DOT;
          else data.cell.styles.textColor = BLUE_DOT;
        }
        if (data.section === "body" && data.column.index === 3) {
          const status = String(data.cell.raw);
          if (status === "Blocking") data.cell.styles.textColor = RED_DOT;
          else if (status === "Resolved") data.cell.styles.textColor = GREY_LABEL;
        }
      },
      didDrawPage: (data) => { drawFooter(data.pageNumber); },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── 5. Signature block — anchored to bottom of last page ────────────────────
  // Layout: two side-by-side columns, each with a long signature line + short date
  // line, labels printed BELOW their respective lines.
  // Block height: 6 (header bar) + 5 (gap) + 4 (col heading) + 10 (line) + 5 (label) = ~30 mm
  const sigBlockH = 32;
  const sigY = PAGE_H - FOOTER_H - 6 - sigBlockH;

  // If content has overflowed past the sign-off area, push to a new page
  if (y > sigY) {
    doc.addPage();
    drawFooter(totalPages());
  }
  // Always render sign-off at the fixed bottom anchor regardless of content height
  const sy0 = sigY;

  // Header bar
  doc.setFillColor(...GREY_BG);
  doc.rect(MARGIN, sy0, CONTENT_W, 6, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREY_LABEL);
  doc.text("SIGN-OFF", MARGIN + 2, sy0 + 4.2);

  // Column geometry — 8 mm gutter between the two halves
  const sigColW = (CONTENT_W - 8) / 2;   // ~87 mm each
  const sigCol1 = MARGIN;                  // left column start
  const sigCol2 = MARGIN + sigColW + 8;    // right column start

  // Within each column: signature line takes ~65%, date line takes remaining ~30%
  const sigLineW  = sigColW * 0.64;        // ~56 mm
  const dateGap   = sigColW * 0.06;        // ~5 mm gap between sig and date lines
  const dateStart = sigLineW + dateGap;    // offset from column start
  const dateLineW = sigColW - dateStart;   // ~26 mm

  doc.setDrawColor(180, 180, 180);
  doc.setFontSize(8);

  // Column headings
  let sy = sy0 + 12;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLACK);
  doc.text("Technician", sigCol1, sy);
  doc.text("Customer Approval", sigCol2, sy);

  // Signature + date lines
  sy += 10;
  doc.line(sigCol1,              sy, sigCol1 + sigLineW,               sy);
  doc.line(sigCol1 + dateStart,  sy, sigCol1 + dateStart + dateLineW,  sy);
  doc.line(sigCol2,              sy, sigCol2 + sigLineW,               sy);
  doc.line(sigCol2 + dateStart,  sy, sigCol2 + dateStart + dateLineW,  sy);

  // Labels below the lines
  sy += 4;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY_LABEL);
  doc.text("Signature", sigCol1, sy);
  doc.text("Date:", sigCol1 + dateStart, sy);
  doc.text("Signature", sigCol2, sy);
  doc.text("Date:", sigCol2 + dateStart, sy);

  // ── Draw footer on every page now that totalPages() is final ─────────────────
  const numPages = totalPages();
  for (let p = 1; p <= numPages; p++) {
    doc.setPage(p);
    drawFooter(p);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const safeName = (asset.assetTag ?? "asset").replace(/[^a-zA-Z0-9-_]/g, "_");
  const runNum = run.runNumber ?? 1;
  doc.save(`installation-record_${safeName}_run${runNum}.pdf`);
}
