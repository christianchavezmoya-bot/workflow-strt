/**
 * generateWorkflowReport
 * Builds a professional A4 PDF installation record and triggers a browser download.
 *
 * Sections:
 *  1. Header band — business logo (left) + title (centre) + customer logo (right)
 *  2. Asset & run metadata — 2-column table
 *  3. Workflow steps — individual rounded-corner cards per step with input tables
 *  4. Issues — always included; table with resolution notes
 *  5. Signature block
 *  6. Footer (every page) — page number, company name, date generated
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AssetWorkflowRun, RunIssue, StepResult } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import type { WorkflowStep } from "../types/workflow";

// ─── Colour palette ──────────────────────────────────────────────────────────
const NAVY: [number, number, number]       = [26,  39,  68];   // header band / step card header
const TEAL: [number, number, number]       = [0,   128, 128];  // accent — section bars
const TEAL_LIGHT: [number, number, number] = [224, 242, 242];  // step card body bg
const GREY_BG: [number, number, number]    = [241, 243, 246];  // alternate row / meta table bg
const GREY_LABEL: [number, number, number] = [100, 110, 125];  // label text
const BLACK: [number, number, number]      = [20,  20,  20];
const WHITE: [number, number, number]      = [255, 255, 255];
const RED: [number, number, number]        = [211, 47,  47];
const ORANGE: [number, number, number]     = [230, 119, 0];
const BLUE: [number, number, number]       = [25,  118, 210];
const GREEN: [number, number, number]      = [46,  125, 50];
const BORDER: [number, number, number]     = [200, 208, 218];

// ─── Page geometry (all in mm) ───────────────────────────────────────────────
const PAGE_W   = 210;
const PAGE_H   = 297;
const MARGIN   = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 26;
const FOOTER_H = 8;
const SAFE_BOTTOM = PAGE_H - FOOTER_H - 10;

// Logo slot in header
const LOGO_W = 38;
const LOGO_H = 16;
const LOGO_Y = (HEADER_H - LOGO_H) / 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectImageFormat(dataUrl: string): string | null {
  if (dataUrl.startsWith("data:image/png"))  return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  if (dataUrl.startsWith("data:image/gif"))  return "GIF";
  return null;
}

export async function resolveImageToDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (detectImageFormat(src)) return src;
  if (src.startsWith("data:image/svg")) return svgDataUrlToPng(src);
  try {
    const resp = await fetch(src, { mode: "cors" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (blob.type.includes("svg")) {
      const text = await blob.text();
      const svgDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(text)));
      return svgDataUrlToPng(svgDataUrl);
    }
    return new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function svgDataUrlToPng(svgDataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width  = img.naturalWidth  || 300;
        canvas.height = img.naturalHeight || 100;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = svgDataUrl;
    } catch { resolve(null); }
  });
}

function getImageNaturalSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
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
  try { return (JSON.parse(json) as StepResult[]).filter((r) => r.stepId !== "__nav__"); }
  catch { return []; }
}

function parseIssues(json: string): RunIssue[] {
  try { return JSON.parse(json) as RunIssue[]; } catch { return []; }
}

function fmt(date: string | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtFull(date: string | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
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
  companyName?: string;
  customerName?: string;
  jobNumber?: string;
  siteName?: string;
  siteLocation?: string;
  assignedTechnician?: string;
  /** If true, renders ALL steps defined in the workflow snapshot (not just captured ones). */
  includeAllSteps?: boolean;
}

export async function generateWorkflowReport(params: GenerateReportParams): Promise<void> {
  const {
    run, asset, workflowConfigName,
    businessLogoBase64, customerLogoBase64, companyName = "Commtrac",
    customerName, jobNumber, siteName, siteLocation, assignedTechnician,
    includeAllSteps = false,
  } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const totalPages = () => (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();

  const steps       = parseSteps(run.workflowSnapshotJson ?? "");
  const stepMap     = new Map(steps.map((s) => [s.id, s]));
  const stepResults = parseStepResults(run.stepResultsJson);
  const issues      = parseIssues(run.issuesJson);
  const openIssues  = issues.filter((i) => !i.resolved);

  const generated = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  // ── Footer helper ────────────────────────────────────────────────────────────
  function drawFooter(pageNum: number) {
    const total = totalPages();
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);
    const footY = PAGE_H - 4;
    // light rule
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, PAGE_H - FOOTER_H, PAGE_W - MARGIN, PAGE_H - FOOTER_H);
    doc.text(`Page ${pageNum} of ${total}`, MARGIN, footY);
    doc.text(companyName, PAGE_W / 2, footY, { align: "center" });
    doc.text(`Generated: ${generated}`, PAGE_W - MARGIN, footY, { align: "right" });
  }

  // ── Section header bar helper ────────────────────────────────────────────────
  function drawSectionBar(y: number, label: string): number {
    doc.setFillColor(...TEAL);
    doc.rect(MARGIN, y, CONTENT_W, 6.5, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(label, MARGIN + 3, y + 4.4);
    return y + 8.5;
  }

  // ── Page break helper ────────────────────────────────────────────────────────
  function ensureSpace(y: number, needed: number): number {
    if (y + needed > SAFE_BOTTOM) {
      doc.addPage();
      return 14;
    }
    return y;
  }

  // ── 1. Header band ───────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  const addLogoOrText = async (logoSrc: string | null | undefined, slotX: number, textLabel: string) => {
    const fmtType = logoSrc ? detectImageFormat(logoSrc) : null;
    if (logoSrc && fmtType) {
      try {
        const size = await getImageNaturalSize(logoSrc);
        let drawW = LOGO_W, drawH = LOGO_H;
        if (size && size.w > 0 && size.h > 0) {
          const scaleByH = LOGO_H / size.h;
          drawH = LOGO_H;
          drawW = Math.min(size.w * scaleByH, LOGO_W);
        }
        const offsetX = (LOGO_W - drawW) / 2;
        doc.addImage(logoSrc, fmtType, slotX + offsetX, LOGO_Y, drawW, drawH, undefined, "FAST");
        return;
      } catch (e) { console.warn("[generateWorkflowReport] addImage failed:", e); }
    }
    if (textLabel) {
      doc.setTextColor(...WHITE);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(textLabel, slotX, HEADER_H / 2 + 2);
    }
  };

  await addLogoOrText(businessLogoBase64, MARGIN, companyName.toUpperCase());

  doc.setTextColor(...WHITE);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("INSTALLATION RECORD", PAGE_W / 2, HEADER_H / 2 - 1, { align: "center" });
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(asset.assetTag ?? "", PAGE_W / 2, HEADER_H / 2 + 4.5, { align: "center" });

  await addLogoOrText(customerLogoBase64, PAGE_W - MARGIN - LOGO_W, "");

  let y = HEADER_H + 6;

  // ── 2. Asset & run metadata ──────────────────────────────────────────────────
  y = ensureSpace(y, 40);
  y = drawSectionBar(y, "ASSET & RUN DETAILS");

  const metaRows: [string, string, string, string][] = [
    ["Asset Tag",     asset.assetTag     ?? "—", "Date Completed",  run.completedAt ? fmtFull(run.completedAt) : "—"],
    ["Asset Name",    asset.assetName    ?? "—", "Completed By",    run.completedByName ?? "—"],
    ["Model",         asset.assetModel   ?? "—", "Workflow",        workflowConfigName],
    ["Manufacturer",  asset.manufacturer ?? "—", "Run #",           String(run.runNumber ?? 1)],
    ["Serial #",      (asset.serialNumber ?? "—"), "Status",        run.status],
  ];
  if (customerName || jobNumber) metaRows.push(["Customer", customerName ?? "—", "Job #", jobNumber ?? "—"]);
  if (siteName || siteLocation)  metaRows.push(["Site",     siteName    ?? "—", "Location", siteLocation ?? "—"]);
  if (assignedTechnician)        metaRows.push(["Technician", assignedTechnician, "", ""]);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 } },
    columnStyles: {
      0: { fontStyle: "bold", textColor: GREY_LABEL, cellWidth: CONTENT_W * 0.18 },
      1: { textColor: BLACK,                          cellWidth: CONTENT_W * 0.30 },
      2: { fontStyle: "bold", textColor: GREY_LABEL, cellWidth: CONTENT_W * 0.18 },
      3: { textColor: BLACK,                          cellWidth: CONTENT_W * 0.30 },
    },
    alternateRowStyles: { fillColor: GREY_BG },
    body: metaRows,
    didDrawPage: (data) => { drawFooter(data.pageNumber); },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── 3. Workflow Steps — individual cards ──────────────────────────────────────
  // In "full" mode iterate ALL snapshot steps; in standard mode only captured results.
  const stepResultMap = new Map(stepResults.map((sr) => [sr.stepId, sr]));
  const stepsToRender: Array<{ step: WorkflowStep; sr: StepResult | undefined }> = includeAllSteps
    ? [...steps].sort((a, b) => a.order - b.order).map((s) => ({ step: s, sr: stepResultMap.get(s.id) }))
    : stepResults.map((sr) => ({ step: stepMap.get(sr.stepId) ?? ({ id: sr.stepId, title: sr.stepId, order: 0, inputs: [] } as unknown as WorkflowStep), sr }));

  const completedCount = stepResults.length;
  const totalCount     = steps.length;
  const sectionLabel   = includeAllSteps
    ? `WORKFLOW STEPS  (${completedCount} of ${totalCount} completed)`
    : `WORKFLOW STEPS  (${completedCount} completed)`;

  y = ensureSpace(y, 20);
  y = drawSectionBar(y, sectionLabel);

  if (stepsToRender.length === 0) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GREY_LABEL);
    doc.text("No step data available for this run.", MARGIN + 2, y + 5);
    y += 10;
  } else {
    for (let idx = 0; idx < stepsToRender.length; idx++) {
      const { step, sr } = stepsToRender[idx];
      const stepNumber  = includeAllSteps ? step.order : idx + 1;
      const title       = step.title ?? `Step ${stepNumber}`;
      const inputDefs   = step.inputs ?? [];
      const entries     = sr ? Object.entries(sr.values ?? {}).filter(([, v]) => v) : [];
      const time        = sr?.completedAt ? fmtTime(sr.completedAt) : "";
      const desc        = step.description ?? "";
      const isCompleted = Boolean(sr);

      const estRows = Math.max(entries.length, 1) + (desc ? 1 : 0);
      const estH    = 8 + estRows * 6.5 + 6;
      y = ensureSpace(y, estH + 4);

      const cardX = MARGIN;
      const cardW = CONTENT_W;
      const hdrH  = 8;

      // Card header — navy (completed) or muted grey (not completed)
      const hdrColor: [number, number, number] = isCompleted ? NAVY : [90, 100, 115];
      doc.setFillColor(...hdrColor);
      doc.roundedRect(cardX, y, cardW, hdrH, 2, 2, "F");

      // Step number badge — teal (completed) or grey (not completed)
      const badgeColor: [number, number, number] = isCompleted ? TEAL : [130, 140, 155];
      const badgeCX = cardX + 5;
      const badgeCY = y + hdrH / 2;
      doc.setFillColor(...badgeColor);
      doc.circle(badgeCX, badgeCY, 3, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...WHITE);
      doc.text(String(stepNumber).padStart(2, "0"), badgeCX, badgeCY + 2.5, { align: "center" });

      // Step title
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...WHITE);
      doc.text(title, cardX + 12, y + hdrH / 2 + 1.5);

      // Right label: time (completed) or "Not completed" badge
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      if (isCompleted && time) {
        doc.setTextColor(180, 200, 220);
        doc.text(time, cardX + cardW - 3, y + hdrH / 2 + 1.5, { align: "right" });
      } else if (!isCompleted) {
        doc.setTextColor(200, 210, 220);
        doc.text("Not completed", cardX + cardW - 3, y + hdrH / 2 + 1.5, { align: "right" });
      }

      y += hdrH;

      // Card body rows
      const bodyRows: string[][] = [];
      if (desc) bodyRows.push(["Description", desc]);

      if (!isCompleted) {
        // Show expected inputs as blank rows
        if (inputDefs.length > 0) {
          for (const inp of inputDefs) {
            bodyRows.push([inp.label ?? inp.id, "—"]);
          }
        } else {
          bodyRows.push(["(Step not completed)", ""]);
        }
      } else if (entries.length === 0) {
        bodyRows.push(["(No inputs captured)", ""]);
      } else {
        for (const [inputId, val] of entries) {
          const inputDef = inputDefs.find((i) => i.id === inputId);
          const label    = inputDef?.label ?? inputId;

          if (inputDef?.type === "component" && inputDef.subFields?.length && val) {
            try {
              const sub: Record<string, string> = JSON.parse(val);
              const parts = inputDef.subFields.filter((sf) => sub[sf.id]);
              if (parts.length > 0) {
                bodyRows.push([label, ""]);
                for (const sf of parts) {
                  bodyRows.push([`  › ${sf.name}`, sub[sf.id]]);
                }
                continue;
              }
            } catch { /* fall through */ }
          }

          const display = val === "true" ? "✓ Yes" : val === "false" ? "✗ No" : val;
          bodyRows.push([label, display]);
        }
      }

      // Card body background rect (drawn before table so table renders on top)
      const bodyBg: [number, number, number] = isCompleted ? TEAL_LIGHT : [245, 246, 248];
      const altBg:  [number, number, number] = isCompleted ? [232, 243, 243] : [238, 240, 243];

      autoTable(doc, {
        startY: y,
        margin: { left: cardX, right: MARGIN },
        theme: "plain",
        tableWidth: cardW,
        styles: {
          fontSize: 8.5,
          cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
          fillColor: bodyBg,
          textColor: BLACK,
          lineWidth: 0,       // no cell borders — prevents first-row line overlap
        },
        columnStyles: {
          0: { fontStyle: "bold", textColor: GREY_LABEL, cellWidth: cardW * 0.38 },
          1: { textColor: isCompleted ? BLACK : GREY_LABEL },
        },
        alternateRowStyles: { fillColor: altBg },
        body: bodyRows,
        didDrawPage: (data) => { drawFooter(data.pageNumber); },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      // Thin bottom border to close the card
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.line(cardX, y, cardX + cardW, y);

      y += 5;
    }
  }

  // ── 4. Issues — always included ───────────────────────────────────────────────
  y = ensureSpace(y, 30);
  const issueLabel = issues.length === 0
    ? "ISSUES  (none recorded)"
    : `ISSUES  (${issues.length} total · ${openIssues.length} open · ${issues.length - openIssues.length} resolved)`;
  y = drawSectionBar(y, issueLabel);

  if (issues.length === 0) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GREY_LABEL);
    doc.text("No issues were recorded for this run.", MARGIN + 2, y + 5);
    y += 10;
  } else {
    const issueRows = issues.map((issue) => {
      const statusLabel = issue.resolved
        ? "Closed"
        : issue.isBlocking ? "Blocking" : "Open";
      const resolution = issue.resolved && issue.resolutionNote
        ? `${issue.resolutionNote}${issue.resolvedBy ? `\n— ${issue.resolvedBy}` : ""}${issue.resolvedAt ? `, ${fmt(issue.resolvedAt)}` : ""}`
        : issue.resolved ? `Resolved${issue.resolvedBy ? ` by ${issue.resolvedBy}` : ""}` : "—";
      const commentsCount = (issue.comments ?? []).length;
      return [
        issue.description,
        issue.issueType === "blocking" ? "Blocking" : "Observation",
        issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1),
        issue.stepTitle ?? "—",
        statusLabel,
        fmt(issue.reportedAt),
        resolution,
        commentsCount > 0 ? String(commentsCount) : "—",
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "striped",
      head: [["Description", "Type", "Severity", "Step", "Status", "Reported", "Resolution / Action Taken", "Notes"]],
      body: issueRows,
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
        overflow: "linebreak",
        lineColor: BORDER,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: {
        0: { cellWidth: CONTENT_W * 0.22 },
        1: { cellWidth: CONTENT_W * 0.10 },
        2: { cellWidth: CONTENT_W * 0.09 },
        3: { cellWidth: CONTENT_W * 0.11 },
        4: { cellWidth: CONTENT_W * 0.09 },
        5: { cellWidth: CONTENT_W * 0.10 },
        6: { cellWidth: CONTENT_W * 0.22 },
        7: { cellWidth: CONTENT_W * 0.07, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        // Severity colour
        if (data.column.index === 2) {
          const sev = String(data.cell.raw).toLowerCase();
          if (sev === "high")   data.cell.styles.textColor = RED;
          else if (sev === "medium") data.cell.styles.textColor = ORANGE;
          else                  data.cell.styles.textColor = BLUE;
          data.cell.styles.fontStyle = "bold";
        }
        // Status colour
        if (data.column.index === 4) {
          const s = String(data.cell.raw);
          if (s === "Blocking") { data.cell.styles.textColor = RED;   data.cell.styles.fontStyle = "bold"; }
          else if (s === "Closed") { data.cell.styles.textColor = GREEN; }
          else if (s === "Open")   { data.cell.styles.textColor = ORANGE; }
        }
        // Type colour
        if (data.column.index === 1) {
          if (String(data.cell.raw) === "Blocking") data.cell.styles.textColor = RED;
        }
      },
      didDrawPage: (data) => { drawFooter(data.pageNumber); },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── 5. Signature block ───────────────────────────────────────────────────────
  const sigBlockH = 34;
  const sigY = PAGE_H - FOOTER_H - 6 - sigBlockH;

  if (y > sigY) {
    doc.addPage();
    drawFooter(totalPages());
  }

  const sy0 = sigY;
  doc.setFillColor(...GREY_BG);
  doc.rect(MARGIN, sy0, CONTENT_W, 6.5, "F");
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREY_LABEL);
  doc.text("SIGN-OFF", MARGIN + 3, sy0 + 4.4);

  const sigColW  = (CONTENT_W - 8) / 2;
  const sigCol1  = MARGIN;
  const sigCol2  = MARGIN + sigColW + 8;
  const sigLineW = sigColW * 0.64;
  const dateGap  = sigColW * 0.06;
  const dateStart = sigLineW + dateGap;
  const dateLineW = sigColW - dateStart;

  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.3);

  let sy = sy0 + 13;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLACK);
  doc.text("Technician", sigCol1, sy);
  doc.text("Customer Approval", sigCol2, sy);

  sy += 10;
  doc.line(sigCol1,             sy, sigCol1 + sigLineW,              sy);
  doc.line(sigCol1 + dateStart, sy, sigCol1 + dateStart + dateLineW, sy);
  doc.line(sigCol2,             sy, sigCol2 + sigLineW,              sy);
  doc.line(sigCol2 + dateStart, sy, sigCol2 + dateStart + dateLineW, sy);

  sy += 4;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY_LABEL);
  doc.text("Signature", sigCol1, sy);
  doc.text("Date:", sigCol1 + dateStart, sy);
  doc.text("Signature", sigCol2, sy);
  doc.text("Date:", sigCol2 + dateStart, sy);

  // ── Draw footer on every page ─────────────────────────────────────────────────
  const numPages = totalPages();
  for (let p = 1; p <= numPages; p++) {
    doc.setPage(p);
    drawFooter(p);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  const safeName = (asset.assetTag ?? "asset").replace(/[^a-zA-Z0-9-_]/g, "_");
  const runNum   = run.runNumber ?? 1;
  doc.save(`installation-record_${safeName}_run${runNum}.pdf`);
}
