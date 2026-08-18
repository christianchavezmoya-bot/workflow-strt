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
import type { AssetWorkflowRun, RunIssue, RunTimeEntry, StepResult } from "../types/assetWorkflowRun";
import type { Feature } from "../types/feature";
import type { ProjectAsset } from "../types/projectAsset";
import type { WorkflowStep } from "../types/workflow";
import { isOptionListInputType } from "../types/workflow";
import type { SignatureEvent } from "../types/signature";
import { getMissingWorkflowItems } from "./workflowCompleteness";
import { openObjectUrl } from "./printWindow";
import { formatInstant, resolveProjectTimeZone, zoneAbbreviation } from "./datetime";
import { normalizeCapturedValueForDisplay } from "./capturedValueFormat";
import { normalizeBinaryDataUrl } from "./reportMediaResolve";

// â”€â”€â”€ Colour palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Page geometry (all in mm) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function detectImageFormat(dataUrl: string): string | null {
  if (dataUrl.startsWith("data:image/png"))  return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  if (dataUrl.startsWith("data:image/gif"))  return "GIF";
  return null;
}

const OFFLINE_MEDIA_REF_PREFIX = "offline-media-ref:";

function extractPhotoSources(val: string | undefined, isSignature: boolean): string[] {
  if (!val?.trim()) return [];
  if (isSignature) return [val.trim()];
  try {
    const parsed = JSON.parse(val) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch { /* fall through */ }
  return [val.trim()];
}

function loadDataUrlAsPng(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 600;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function resolvePhotoForPdf(src: string): Promise<string | null> {
  if (!src?.trim()) return null;
  const normalized = normalizeBinaryDataUrl(src.trim());
  if (detectImageFormat(normalized)) return normalized;
  if (normalized.startsWith(OFFLINE_MEDIA_REF_PREFIX)) {
    try {
      const { mediaStore } = await import("../services/mediaStore");
      const resolved = await mediaStore.resolveMediaValue(normalized);
      const resolvedNormalized = normalizeBinaryDataUrl(resolved);
      if (detectImageFormat(resolvedNormalized)) return resolvedNormalized;
      if (resolvedNormalized.startsWith("data:")) return loadDataUrlAsPng(resolvedNormalized);
      return resolveImageToDataUrl(resolvedNormalized);
    } catch {
      return null;
    }
  }
  if (normalized.startsWith("data:")) return loadDataUrlAsPng(normalized);
  return resolveImageToDataUrl(normalized);
}

export async function resolveImageToDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  const normalized = normalizeBinaryDataUrl(src);
  if (detectImageFormat(normalized)) return normalized;
  if (normalized.startsWith("data:image/svg")) return svgDataUrlToPng(normalized);
  if (normalized.startsWith("data:")) return loadDataUrlAsPng(normalized);
  try {
    let fetchUrl = src;
    if (src.startsWith("/")) {
      const { getApiBaseUrl } = await import("../services/apiBase");
      const origin = getApiBaseUrl().replace(/\/api\/?$/i, "");
      fetchUrl = `${origin}${src}`;
    }
    const resp = await fetch(fetchUrl, { mode: "cors" });
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
  try {
    const parsed = JSON.parse(json) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const results: StepResult[] = [];
    for (const raw of parsed) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const stepId = item.stepId ?? item.StepId;
      if (typeof stepId !== "string" || stepId === "__nav__") continue;
      const valuesRaw = item.values ?? item.Values;
      const values =
        valuesRaw && typeof valuesRaw === "object" && !Array.isArray(valuesRaw)
          ? valuesRaw as Record<string, string>
          : {};
      const completedAt = String(item.completedAt ?? item.CompletedAt ?? "");
      const iterationIndex = item.iterationIndex ?? item.IterationIndex;
      results.push({
        stepId,
        values,
        completedAt,
        ...(typeof iterationIndex === "number" ? { iterationIndex } : {}),
      });
    }
    return results;
  } catch { return []; }
}

function buildStepResultMap(stepResults: StepResult[]): Map<string, StepResult> {
  const map = new Map<string, StepResult>();
  for (const sr of stepResults) {
    const existing = map.get(sr.stepId);
    if (!existing) {
      map.set(sr.stepId, sr);
      continue;
    }
    const mergedValues = { ...existing.values };
    for (const [key, val] of Object.entries(sr.values ?? {})) {
      if (!(key in mergedValues) || !mergedValues[key]) {
        mergedValues[key] = val;
        continue;
      }
      try {
        const left = JSON.parse(mergedValues[key]) as unknown;
        const right = JSON.parse(val) as unknown;
        if (Array.isArray(left) && Array.isArray(right)) {
          mergedValues[key] = JSON.stringify([...left, ...right]);
          continue;
        }
      } catch { /* keep existing */ }
      mergedValues[key] = val;
    }
    map.set(sr.stepId, {
      ...existing,
      values: mergedValues,
      completedAt: sr.completedAt || existing.completedAt,
    });
  }
  return map;
}

function parseVisitedStepIds(json: string): Set<string> {
  try {
    const parsed = JSON.parse(json) as Array<{ stepId?: string; values?: Record<string, string> }>;
    const visited = new Set<string>();
    for (const entry of parsed) {
      if (!entry?.stepId) continue;
      if (entry.stepId !== "__nav__") {
        visited.add(entry.stepId);
        continue;
      }

      const currentStepId = entry.values?.currentStepId;
      if (currentStepId) visited.add(currentStepId);

      const rawHistory = entry.values?.historyJson;
      if (!rawHistory) continue;
      try {
        const history = JSON.parse(rawHistory) as string[];
        for (const stepId of history) {
          if (stepId) visited.add(stepId);
        }
      } catch {
        // Ignore malformed history.
      }
    }
    return visited;
  } catch {
    return new Set<string>();
  }
}

function parseIssues(json: string): RunIssue[] {
  try { return JSON.parse(json) as RunIssue[]; } catch { return []; }
}

function fmtDur(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Date/time helpers are defined as closures inside generateWorkflowReport so they render in
// the project's timezone (reportTz) rather than whatever device generates the PDF. See below.

const CHOICE_ROW_PREFIX = "__choice_boxes__:";

type ChoiceRowPayload = {
  options: string[];
  selectedValue?: string;
  missing?: boolean;
};

function encodeChoiceRow(payload: ChoiceRowPayload): string {
  return `${CHOICE_ROW_PREFIX}${JSON.stringify(payload)}`;
}

function decodeChoiceRow(raw: unknown): ChoiceRowPayload | null {
  if (typeof raw !== "string" || !raw.startsWith(CHOICE_ROW_PREFIX)) return null;
  try {
    return JSON.parse(raw.slice(CHOICE_ROW_PREFIX.length)) as ChoiceRowPayload;
  } catch {
    return null;
  }
}

function layoutChoiceBoxes(doc: jsPDF, payload: ChoiceRowPayload, maxWidth: number) {
  const horizontalPadding = 3;
  const boxHeight = 6;
  const gap = 2;
  const lineGap = 2;
  const lines: Array<Array<{ label: string; width: number; selected: boolean }>> = [];
  let currentLine: Array<{ label: string; width: number; selected: boolean }> = [];
  let currentWidth = 0;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  for (const option of payload.options) {
    const width = Math.max(12, doc.getTextWidth(option) + horizontalPadding * 2 + 1);
    const selected = option === (payload.selectedValue ?? "");
    const requiredWidth = currentLine.length === 0 ? width : currentWidth + gap + width;
    if (currentLine.length > 0 && requiredWidth > maxWidth) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }
    currentLine.push({ label: option, width, selected });
    currentWidth = currentLine.length === 1 ? width : currentWidth + gap + width;
  }

  if (currentLine.length > 0) lines.push(currentLine);

  const contentHeight = Math.max(boxHeight, lines.length * boxHeight + Math.max(0, lines.length - 1) * lineGap);
  const noteHeight = payload.missing ? 4.5 : 0;
  return { lines, boxHeight, gap, lineGap, contentHeight: contentHeight + noteHeight };
}

// â”€â”€â”€ PDF generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  /** Installer and/or customer signature events — used to render the sign-off block. */
  signatureEvents?: SignatureEvent[];
  /** Product feature library used to enrich report rows with feature metadata like P/N. */
  productFeatures?: Feature[];
  /** Optional document type tag (e.g. "inspection") for report labelling. */
  documentType?: string;
  /** IANA timezone id (project site) to render all wall-clock timestamps in. Undefined = UTC. */
  timeZoneId?: string;
  /** "download" saves the PDF; "open" opens it in a browser viewer/tab; "blob" returns a Blob for in-app preview/export. */
  outputMode?: "download" | "open" | "blob";
  /** If preview opening fails, optionally fall back to downloading the PDF. */
  allowDownloadFallback?: boolean;
}

export async function generateWorkflowReport(params: GenerateReportParams): Promise<Blob | void> {
  const {
    run, asset, workflowConfigName,
    businessLogoBase64, customerLogoBase64, companyName = "Strata N-go",
    customerName, jobNumber, siteName, siteLocation, assignedTechnician,
    includeAllSteps = false,
    signatureEvents = [],
    productFeatures = [],
    outputMode = "download",
    allowDownloadFallback = true,
    timeZoneId,
  } = params;

  // All wall-clock timestamps render in the project's timezone so the report reads identically
  // to every office. Instants remain UTC; only display is localized here.
  const reportTz = resolveProjectTimeZone(timeZoneId);
  const fmt = (date?: string): string =>
    date ? formatInstant(date, reportTz, { time: false, withZone: false }) : "—";
  const fmtFull = (date?: string): string =>
    date ? formatInstant(date, reportTz, { withZone: true }) : "—";
  const fmtTime = (date?: string): string =>
    date ? formatInstant(date, reportTz, { date: false, withZone: false }) : "";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const totalPages = () => (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();

  const steps       = parseSteps(run.workflowSnapshotJson ?? "");
  const stepMap     = new Map(steps.map((s) => [s.id, s]));
  const featureMap  = new Map(productFeatures.map((feature) => [feature.id, feature]));
  const stepResults = parseStepResults(run.stepResultsJson);
  const visitedStepIds = parseVisitedStepIds(run.stepResultsJson);
  const issues      = parseIssues(run.issuesJson);
  const openIssues  = issues.filter((i) => !i.resolved);

  const generated = formatInstant(new Date().toISOString(), reportTz, { time: false, withZone: false });

  // â”€â”€ Footer helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Section header bar helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function drawSectionBar(y: number, label: string): number {
    doc.setFillColor(...TEAL);
    doc.rect(MARGIN, y, CONTENT_W, 6.5, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(label, MARGIN + 3, y + 4.4);
    return y + 8.5;
  }

  // â”€â”€ Page break helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function ensureSpace(y: number, needed: number): number {
    if (y + needed > SAFE_BOTTOM) {
      doc.addPage();
      return 14;
    }
    return y;
  }

  // â”€â”€ 1. Header band â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ 2. Asset & run metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ 2b. Time Tracking summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  y = ensureSpace(y, 20);
  y = drawSectionBar(y, "TIME TRACKING");
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...GREY_LABEL);
  doc.text(
    `All times shown in ${reportTz} (${zoneAbbreviation(reportTz, run.completedAt ?? run.startedAt)})`,
    MARGIN + 2,
    y + 0.5,
  );
  y += 4;

  const totalDurationSecs = run.completedAt && run.startedAt
    ? Math.max(0, Math.floor((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000))
    : null;

  const timeRows: [string, string, string, string][] = [
    ["Started",       fmtFull(run.startedAt),                  "Completed",        run.completedAt ? fmtFull(run.completedAt) : "—"],
    ["Productive",    fmtDur(run.productiveSeconds ?? 0),       "Downtime",         fmtDur(run.downtimeSeconds ?? 0)],
    ["Downtime Events", String(run.downtimeEvents ?? 0),        "Total Duration",   totalDurationSecs !== null ? fmtDur(totalDurationSecs) : "—"],
  ];

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
    body: timeRows,
    didDrawPage: (data) => { drawFooter(data.pageNumber); },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // â”€â”€ 2c. Downtime event breakdown (only if downtime occurred) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const allTimeEntries: RunTimeEntry[] = (() => {
    try {
      const parsed = JSON.parse(run.timeTrackingJson ?? "[]");
      return Array.isArray(parsed) ? parsed as RunTimeEntry[] : [];
    } catch { return []; }
  })();
  const downtimeEntries = allTimeEntries.filter((e) => e.category === "downtime");

  if (downtimeEntries.length > 0) {
    y = ensureSpace(y, 20);
    y = drawSectionBar(y, `DOWNTIME EVENTS  (${downtimeEntries.length})`);

    const downtimeRows = downtimeEntries.map((e) => {
      const endMs   = e.endedAtUtc ? new Date(e.endedAtUtc).getTime() : (run.completedAt ? new Date(run.completedAt).getTime() : null);
      const startMs = new Date(e.startedAtUtc).getTime();
      const durSecs = endMs ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : null;
      const startLabel = fmtTime(e.startedAtUtc);
      const endLabel   = e.endedAtUtc ? fmtTime(e.endedAtUtc) : "Open";
      return [
        e.reason ?? "—",
        startLabel,
        endLabel,
        durSecs !== null ? fmtDur(durSecs) : "—",
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "striped",
      head: [["Reason", "Start", "End", "Duration"]],
      body: downtimeRows,
      styles: { fontSize: 8, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 } },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: GREY_BG },
      columnStyles: {
        0: { cellWidth: CONTENT_W * 0.55 },
        1: { cellWidth: CONTENT_W * 0.15, halign: "center" },
        2: { cellWidth: CONTENT_W * 0.15, halign: "center" },
        3: { cellWidth: CONTENT_W * 0.15, halign: "center", textColor: ORANGE },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2 && String(data.cell.raw) === "Open") {
          data.cell.styles.textColor = ORANGE;
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawPage: (data) => { drawFooter(data.pageNumber); },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  } else {
    y += 4;
  }

  // â”€â”€ 3. Workflow Steps — individual cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // In "full" mode iterate ALL snapshot steps; in standard mode only captured results.
  const stepResultMap = buildStepResultMap(stepResults);
  const stepsToRender: Array<{ step: WorkflowStep; sr: StepResult | undefined }> = includeAllSteps
    ? [...steps].sort((a, b) => a.order - b.order).map((s) => ({ step: s, sr: stepResultMap.get(s.id) }))
    : [...steps]
        .sort((a, b) => a.order - b.order)
        .filter((step) => visitedStepIds.has(step.id) || stepResultMap.has(step.id))
        .map((step) => ({ step, sr: stepResultMap.get(step.id) }));

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
      const entries     = sr ? Object.entries(sr.values ?? {}).filter(([k, v]) => v && k !== "label") : [];
      const time        = sr?.completedAt ? fmtTime(sr.completedAt) : "";
      const desc        = step.description ?? "";
      const isCompleted = Boolean(sr);

      const estRows = Math.max(entries.length, inputDefs.length + (step.captureFields?.length ?? 0), 1) + (desc ? 1 : 0);
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

      // Collect media (photo/signature) entries to render after the text table
      const stepMediaItems: Array<{ label: string; photos: string[]; isSig: boolean }> = [];

      // Card body rows
      const bodyRows: string[][] = [];
      if (desc) bodyRows.push(["Description", desc]);

      const seenPartRows = new Set<string>();
      const pushPartRow = (featureId?: string) => {
        if (!featureId || seenPartRows.has(featureId)) return;
        const feature = featureMap.get(featureId);
        const businessPartNumber = feature?.alternativePartNumber?.trim();
        if (!feature || !businessPartNumber) return;
        bodyRows.push([`${feature.name} P/N`, businessPartNumber]);
        seenPartRows.add(featureId);
      };
      pushPartRow(step.stepFeatureId);
      for (const inputDef of inputDefs) pushPartRow(inputDef.featureId);
      for (const captureDef of step.captureFields ?? []) pushPartRow(captureDef.featureId);

      if (!isCompleted) {
        const missingItems = new Map(getMissingWorkflowItems(step, {}).map((item) => [item.id, item]));
        if (inputDefs.length > 0 || (step.captureFields?.length ?? 0) > 0) {
          for (const inp of inputDefs) {
            const missing = missingItems.get(inp.id);
            bodyRows.push([
              inp.label ?? inp.id,
              missing
                ? (missing.kind === "video" ? "MISSING - video not captured" : "MISSING - image not captured")
                : "—",
            ]);
          }
          for (const captureDef of step.captureFields ?? []) {
            const missing = missingItems.get(captureDef.id);
            bodyRows.push([
              captureDef.label ?? captureDef.key ?? captureDef.id,
              missing ? "MISSING - required capture not provided" : "—",
            ]);
          }
        } else {
          bodyRows.push(["(Step not completed)", ""]);
        }
      } else if (entries.length === 0) {
        bodyRows.push(["(No inputs captured)", ""]);
      } else {
        const values = sr?.values ?? {};

        // Detect an externally-imported step result: values only contain the generic canonical keys
        // (value / unit / pass / notes / label) and none match the workflow's specific inputDef IDs.
        // In that case skip the MISSING rows — the external tool uses its own schema.
        const IMPORT_ONLY_KEYS = new Set(["value", "unit", "pass", "label", "notes"]);
        const isImportedResult = inputDefs.length > 0
          && !inputDefs.some((def) => def.id in values)
          && Object.keys(values).every((k) => IMPORT_ONLY_KEYS.has(k));

        if (isImportedResult) {
          const IMPORT_LABELS: Record<string, string> = { value: "Measured Value", unit: "Unit", pass: "Result", notes: "Notes" };
          for (const [inputId, val] of entries) {
            const label   = IMPORT_LABELS[inputId] ?? inputId;
            const displayValue = normalizeCapturedValueForDisplay(val);
            const display = inputId === "pass"
              ? (val === "true" ? "✓ Pass" : "✗ Fail")
              : (displayValue === "true" ? "Yes" : displayValue === "false" ? "No" : displayValue);
            bodyRows.push([label, display]);
          }
        } else {
        // Normal workflow completion — compare against inputDefs, flag missing required fields.

        const missingItems = new Map(getMissingWorkflowItems(step, values).map((item) => [item.id, item]));
        const handledIds = new Set<string>();

        for (const inputDef of inputDefs) {
          const val = values[inputDef.id];
          const missing = missingItems.get(inputDef.id);
          const label = inputDef.label ?? inputDef.id;
          const shouldRender = Boolean(val) || Boolean(missing) || inputDef.type === "photo" || inputDef.type === "video" || inputDef.required;
          if (!shouldRender) continue;
          handledIds.add(inputDef.id);

          if (inputDef.type === "photo" || inputDef.type === "signature" || inputDef.type === "video") {
            if (missing) {
              bodyRows.push([label, inputDef.type === "video" ? "MISSING - video not captured" : "MISSING - image not captured"]);
              continue;
            }
            if (inputDef.type === "video") {
              bodyRows.push([label, "(video captured - not renderable in PDF)"]);
              continue;
            }

            let photos: string[] = [];
            if (inputDef.type === "signature") {
              photos = extractPhotoSources(val, true);
            } else {
              photos = extractPhotoSources(val, false);
            }

            if (photos.length > 0) {
              stepMediaItems.push({ label, photos, isSig: inputDef.type === "signature" });
            } else {
              bodyRows.push([label, "MISSING - image not captured"]);
            }
            continue;
          }

          if (inputDef.type === "component" && inputDef.subFields?.length && val) {
            try {
              const sub: Record<string, string> = JSON.parse(val);
              const parts = inputDef.subFields.filter((sf) => sub[sf.id]);
              if (parts.length > 0) {
                bodyRows.push([label, ""]);
                for (const sf of parts) {
                  bodyRows.push([`  > ${sf.name}`, sub[sf.id]]);
                }
                continue;
              }
            } catch { }
          }

          if (isOptionListInputType(inputDef.type) && (inputDef.options?.length ?? 0) > 0) {
            bodyRows.push([
              label,
              encodeChoiceRow({
                options: inputDef.options ?? [],
                selectedValue: val ?? "",
                missing: Boolean(missing),
              }),
            ]);
            continue;
          }

          if (missing) {
            bodyRows.push([label, missing.kind === "capture" ? "MISSING - required capture not provided" : "MISSING - required field not captured"]);
            continue;
          }

          const displayValue = normalizeCapturedValueForDisplay(val);
          const display = displayValue === "true" ? "Yes" : displayValue === "false" ? "No" : (displayValue || "-");
          bodyRows.push([label, display]);
        }

        for (const captureDef of step.captureFields ?? []) {
          if (handledIds.has(captureDef.id)) continue;
          const val = values[captureDef.id];
          const missing = missingItems.get(captureDef.id);
          const label = captureDef.label ?? captureDef.key ?? captureDef.id;
          const displayValue = normalizeCapturedValueForDisplay(val);
          bodyRows.push([label, missing ? "MISSING - required capture not provided" : (displayValue || "-")]);
          handledIds.add(captureDef.id);
        }

        const IMPORT_LABELS: Record<string, string> = { value: "Measured Value", unit: "Unit", pass: "Result", notes: "Notes" };
        for (const [inputId, val] of entries) {
          if (handledIds.has(inputId)) continue;
          const inputDef   = inputDefs.find((i) => i.id === inputId);
          const captureDef = !inputDef ? (step.captureFields ?? []).find((f) => f.id === inputId) : undefined;
          const label      = inputDef?.label ?? captureDef?.label ?? IMPORT_LABELS[inputId] ?? inputId;
          const displayValue = normalizeCapturedValueForDisplay(val);
          const display = inputId === "pass"
            ? (val === "true" ? "✓ Pass" : "✗ Fail")
            : (displayValue === "true" ? "Yes" : displayValue === "false" ? "No" : displayValue);
          bodyRows.push([label, display]);
        }
        } // end normal workflow completion block
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
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const choicePayload = decodeChoiceRow(data.cell.raw);
          if (choicePayload) {
            data.cell.text = [""];
            const layout = layoutChoiceBoxes(doc, choicePayload, Math.max(20, data.cell.width - 4));
            data.cell.styles.minCellHeight = Math.max(data.cell.styles.minCellHeight ?? 0, layout.contentHeight + 4);
            return;
          }
          const raw = String(data.cell.raw ?? "");
          if (raw.startsWith("MISSING")) {
            data.cell.styles.textColor = RED;
            data.cell.styles.fontStyle = "bold";
          }
        },
        didDrawCell: (data) => {
          if (data.section !== "body" || data.column.index !== 1) return;
          const choicePayload = decodeChoiceRow(data.cell.raw);
          if (!choicePayload) return;
          const layout = layoutChoiceBoxes(doc, choicePayload, Math.max(20, data.cell.width - 4));
          let cursorY = data.cell.y + 2.2;
          const startX = data.cell.x + 2;

          for (const line of layout.lines) {
            let cursorX = startX;
            for (const option of line) {
              doc.setDrawColor(...BORDER);
              if (option.selected) {
                doc.setFillColor(...BLUE);
                doc.roundedRect(cursorX, cursorY, option.width, layout.boxHeight, 1.2, 1.2, "FD");
                doc.setTextColor(...WHITE);
                doc.setFont("helvetica", "bold");
              } else {
                doc.setFillColor(255, 255, 255);
                doc.roundedRect(cursorX, cursorY, option.width, layout.boxHeight, 1.2, 1.2, "FD");
                doc.setTextColor(...BLACK);
                doc.setFont("helvetica", "normal");
              }
              doc.setFontSize(7.5);
              doc.text(option.label, cursorX + option.width / 2, cursorY + 4.05, { align: "center" });
              cursorX += option.width + layout.gap;
            }
            cursorY += layout.boxHeight + layout.lineGap;
          }

          if (choicePayload.missing) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(...RED);
            doc.text("No selection captured", startX, cursorY + 1.2);
          }
        },
        didDrawPage: (data) => { drawFooter(data.pageNumber); },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      // â”€â”€ Render photo / signature images captured in this step â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (stepMediaItems.length > 0) {
        const IMG_H = 36.4;         // mm height per image (30% larger than 28mm)
        const IMG_GAP = 2;          // mm gap between thumbnails
        const COLS = 3;             // fewer columns so report photos render visibly larger
        const imgW = (cardW - IMG_GAP * (COLS - 1)) / COLS;

        for (const media of stepMediaItems) {
          y = ensureSpace(y, IMG_H + 10);

          // Section label (italic)
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bolditalic");
          doc.setTextColor(...GREY_LABEL);
          doc.text(media.label, cardX + 2, y + 4);
          y += 6;

          let imgX = cardX;
          let colIdx = 0;

          for (const src of media.photos.slice(0, 8)) {
            const resolved = await resolvePhotoForPdf(src);
            if (!resolved) {
              console.warn(`[generateWorkflowReport] Could not resolve photo for "${media.label}" — skipping image, caption only.`);
              continue;
            }
            const fmt = detectImageFormat(resolved);
            if (!fmt) {
              console.warn(`[generateWorkflowReport] Unrecognized image format for "${media.label}" — skipping image, caption only.`);
              continue;
            }
            const size = await getImageNaturalSize(resolved);
            const aspect = size ? size.w / size.h : 4 / 3;
            const drawW  = media.isSig ? Math.min(78, IMG_H * aspect) : imgW;
            const drawH  = media.isSig ? Math.min(IMG_H, drawW / aspect) : IMG_H;

            y = ensureSpace(y, drawH + 4);
            let embedded = false;
            try {
              doc.addImage(resolved, fmt, imgX, y, drawW, drawH, undefined, "FAST");
              embedded = true;
            } catch {
              const converted = await loadDataUrlAsPng(resolved);
              const convertedFmt = converted ? detectImageFormat(converted) : null;
              if (converted && convertedFmt) {
                try {
                  doc.addImage(converted, convertedFmt, imgX, y, drawW, drawH, undefined, "FAST");
                  embedded = true;
                } catch {
                  /* fall through */
                }
              }
            }
            if (!embedded) {
              console.warn(`[generateWorkflowReport] jsPDF addImage failed for "${media.label}" — skipping image, caption only.`);
              continue;
            }
            // Thin border around image
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.2);
            doc.rect(imgX, y, drawW, drawH);

            colIdx++;
            if (colIdx >= COLS || media.isSig) {
              imgX = cardX;
              colIdx = 0;
              y += drawH + IMG_GAP;
            } else {
              imgX += imgW + IMG_GAP;
            }
          }
          if (colIdx > 0) y += IMG_H + IMG_GAP;
          y += 2;
        }
      }
      // â”€â”€ end media â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      // Thin bottom border to close the card
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.line(cardX, y, cardX + cardW, y);

      y += 5;
    }
  }

  // â”€â”€ 4. Issues — always included â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        ? `${issue.resolutionNote}${issue.resolvedBy ? `
— ${issue.resolvedBy}` : ""}${issue.resolvedAt ? `, ${fmt(issue.resolvedAt)}` : ""}`
        : issue.resolved ? `Resolved${issue.resolvedBy ? ` by ${issue.resolvedBy}` : ""}` : "—";
      const commentsCount = (issue.comments ?? []).length;
      const typeLabel = issue.issueType === "blocking" ? "Blocking"
        : issue.issueType === "scope-deviation" ? "Scope Dev." : "Observation";
      const impact = issue.issueType === "scope-deviation"
        ? [
            issue.extraHours != null ? `+${issue.extraHours}h` : null,
            issue.costImpact ?? null,
            issue.approvedBy ? `Approved: ${issue.approvedBy}` : null,
          ].filter(Boolean).join(" · ") || "—"
        : "—";
      return [
        issue.description,
        typeLabel,
        issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1),
        issue.stepTitle ?? "—",
        statusLabel,
        fmt(issue.reportedAt),
        resolution,
        impact,
        commentsCount > 0 ? String(commentsCount) : "—",
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "striped",
      head: [["Description", "Type", "Severity", "Step", "Status", "Reported", "Resolution / Action Taken", "Impact", "Notes"]],
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
        0: { cellWidth: CONTENT_W * 0.20 },
        1: { cellWidth: CONTENT_W * 0.10 },
        2: { cellWidth: CONTENT_W * 0.08 },
        3: { cellWidth: CONTENT_W * 0.10 },
        4: { cellWidth: CONTENT_W * 0.08 },
        5: { cellWidth: CONTENT_W * 0.09 },
        6: { cellWidth: CONTENT_W * 0.18 },
        7: { cellWidth: CONTENT_W * 0.10 },
        8: { cellWidth: CONTENT_W * 0.07, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        // Severity colour
        if (data.column.index === 2) {
          const sev = String(data.cell.raw).toLowerCase();
          if (sev === "high")        data.cell.styles.textColor = RED;
          else if (sev === "medium") data.cell.styles.textColor = ORANGE;
          else                       data.cell.styles.textColor = BLUE;
          data.cell.styles.fontStyle = "bold";
        }
        // Status colour
        if (data.column.index === 4) {
          const s = String(data.cell.raw);
          if (s === "Blocking")     { data.cell.styles.textColor = RED;    data.cell.styles.fontStyle = "bold"; }
          else if (s === "Closed")  { data.cell.styles.textColor = GREEN; }
          else if (s === "Open")    { data.cell.styles.textColor = ORANGE; }
        }
        // Type colour
        if (data.column.index === 1) {
          const t = String(data.cell.raw);
          if (t === "Blocking")    data.cell.styles.textColor = RED;
          if (t === "Scope Dev.")  { data.cell.styles.textColor = ORANGE; data.cell.styles.fontStyle = "bold"; }
        }
      },
      didDrawPage: (data) => { drawFooter(data.pageNumber); },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // â”€â”€ 5. Signature block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const installer = signatureEvents.find((e) => e.signerRole === "Installer") ?? null;
  const customer  = signatureEvents.find((e) => e.signerRole === "Customer")  ?? null;
  const sigBlockH = 58;

  y = ensureSpace(y, sigBlockH + 10);

  const sy0 = y;
  y = drawSectionBar(sy0, "SIGN-OFF");

  const sigColW = (CONTENT_W - 8) / 2;
  const sigCol1 = MARGIN;
  const sigCol2 = MARGIN + sigColW + 8;
  const imgH    = 22;   // height of the drawn-signature image box
  const imgW    = sigColW;

  // Helper: draw one signature column
  async function drawSigColumn(
    colX: number,
    title: string,
    event: SignatureEvent | null,
    sigStatus: string,
  ): Promise<void> {
    let cy = y;

    // Column title
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(title, colX, cy);
    cy += 5;

    // Signature image box or blank rectangle
    doc.setDrawColor(180, 180, 190);
    doc.setLineWidth(0.3);
    doc.rect(colX, cy, imgW, imgH);

    if (event?.signatureData && event.hasDrawnSignature) {
      const fmt = detectImageFormat(event.signatureData);
      if (fmt) {
        try {
          const size = await getImageNaturalSize(event.signatureData);
          let dw = imgW - 4, dh = imgH - 4;
          if (size && size.w > 0 && size.h > 0) {
            const scale = Math.min((imgW - 4) / size.w, (imgH - 4) / size.h);
            dw = size.w * scale;
            dh = size.h * scale;
          }
          doc.addImage(
            event.signatureData, fmt,
            colX + (imgW - dw) / 2,
            cy  + (imgH - dh) / 2,
            dw, dh, undefined, "FAST",
          );
        } catch { /* leave box blank */ }
      }
    } else if (!event) {
      // Blank — label inside box for manual signing
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(180, 180, 190);
      doc.text("Sign here", colX + imgW / 2, cy + imgH / 2 + 1.5, { align: "center" });
    } else if (event && !event.hasDrawnSignature) {
      // Name typed, no drawing
      doc.setFontSize(11);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...GREY_LABEL);
      doc.text(event.signerName, colX + imgW / 2, cy + imgH / 2 + 2, { align: "center" });
    }

    cy += imgH + 3;

    // Info rows below the box
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY_LABEL);

    if (event) {
      const dateStr = fmtFull(event.signedAtUtc);
      const lines: string[] = [
        `Name: ${event.signerName}`,
        event.signerTitle ? `Title: ${event.signerTitle}` : "",
        `Date: ${dateStr}`,
        `Outcome: ${event.reasonCode}`,
        event.notes ? `Notes: ${event.notes}` : "",
      ].filter(Boolean);
      for (const line of lines) {
        doc.text(line, colX, cy);
        cy += 4.5;
      }
    } else {
      // Blank lines for manual fill
      const blankLineW = imgW * 0.7;
      doc.setDrawColor(160, 160, 160);
      doc.setLineWidth(0.25);
      doc.line(colX, cy + 3,  colX + blankLineW, cy + 3);  cy += 8;
      doc.text("Name / Date", colX, cy);
      // Check waived status
      if (sigStatus === "WaivedCustomer" && title.includes("Customer")) {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...ORANGE);
        doc.text("Customer signature waived", colX, cy - 4);
      }
    }
  }

  await drawSigColumn(sigCol1, "TECHNICIAN SIGN-OFF",  installer, run.signatureStatus);
  await drawSigColumn(sigCol2, "CUSTOMER APPROVAL",    customer,  run.signatureStatus);

  // â”€â”€ Draw footer on every page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const numPages = totalPages();
  for (let p = 1; p <= numPages; p++) {
    doc.setPage(p);
    drawFooter(p);
  }

  // â”€â”€ Save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const safeName = (asset.assetTag ?? "asset").replace(/[^a-zA-Z0-9-_]/g, "_");
  const runNum   = run.runNumber ?? 1;
  const fileName = `installation-record_${safeName}_run${runNum}.pdf`;
  if (outputMode === "blob") {
    return doc.output("blob");
  }
  if (outputMode === "open") {
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    const opened = openObjectUrl(blobUrl);
    if (!opened) {
      URL.revokeObjectURL(blobUrl);
      if (!allowDownloadFallback) {
        throw new Error("Report preview popup was blocked.");
      }
      doc.save(fileName);
    }
    return;
  }
  doc.save(fileName);
}
