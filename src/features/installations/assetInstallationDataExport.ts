import { brandSettingsService } from "../../services/brandSettingsService";
import { customerService } from "../../services/customerService";
import type { Product } from "../../types/product";
import type { Project } from "../../types/project";
import type { ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import { escapeHtml } from "../../utils/printWindow";
import { STATUS_LABELS } from "./assetStatusDisplay";

export type AssetExportColumnOption = {
  id: string;
  label: string;
  headerLabel?: string;
  groupLabel: string;
  noteLabel?: string;
  valueFor: (asset: ProjectAsset) => string;
};

export type AssetExportPackageParams = {
  columnOptions: AssetExportColumnOption[];
  selectedColumnIds: string[];
  displayAssets: ProjectAsset[];
  products: Pick<Product, "id" | "name">[];
  projectMap: ReadonlyMap<string, Pick<Project, "customerName">>;
  projectContext: Pick<Project, "customerName" | "customerId" | "jobNumber" | "projectManager" | "startDate"> | null;
  activeProduct: Pick<Product, "name"> | null | undefined;
  archiveMode: boolean;
  showNoWorkflow: boolean;
  statusFilter: ProjectAssetStatus | "All";
  search: string;
  includeBusinessLogo: boolean;
  includeCustomerLogo: boolean;
  includeProjectMeta: boolean;
  exportMode: string;
};

export type AssetExportPackage = {
  filenameBase: string;
  title: string;
  subtitle: string;
  exportDateDisplay: string;
  columns: AssetExportColumnOption[];
  rows: string[][];
  metadata: { label: string; value: string }[];
  businessLogo: string | null;
  customerLogo: string | null;
  modeLabel: string;
};

export type AssetExportGroupSpan = {
  label: string;
  note: string;
  start: number;
  end: number;
};

export type ExportGroupPalette = {
  header: string;
  note: string;
  field: string;
  body: string;
  bodyAlt: string;
  text: string;
};

export async function buildAssetExportPackage(params: AssetExportPackageParams): Promise<AssetExportPackage> {
  const {
    columnOptions,
    selectedColumnIds,
    displayAssets,
    products,
    projectMap,
    projectContext,
    activeProduct,
    archiveMode,
    showNoWorkflow,
    statusFilter,
    search,
    includeBusinessLogo,
    includeCustomerLogo,
    includeProjectMeta,
    exportMode,
  } = params;

  const selectedColumns = columnOptions.filter((column) => selectedColumnIds.includes(column.id));
  if (selectedColumns.length === 0) {
    throw new Error("Select at least one column to export.");
  }

  const exportDate = new Date();
  const exportDateDisplay = exportDate.toLocaleString();
  const productNames = Array.from(new Set(displayAssets.map((asset) => products.find((product) => product.id === asset.productId)?.name).filter(Boolean))) as string[];
  const customerNames = Array.from(new Set(displayAssets.map((asset) => projectMap.get(asset.projectId)?.customerName).filter(Boolean))) as string[];
  const filtersSummary = [
    archiveMode ? "Archive view" : (showNoWorkflow ? "No workflow" : (statusFilter === "All" ? "All statuses" : `Status ${STATUS_LABELS[statusFilter] ?? statusFilter}`)),
    search.trim() ? `Search: ${search.trim()}` : null,
    "Operations view",
  ].filter(Boolean).join(" | ");

  let businessLogo: string | null = null;
  let customerLogo: string | null = null;

  if (includeBusinessLogo) {
    const rawBusinessLogo = await brandSettingsService.get().then((settings) => settings?.logoBase64 ?? null).catch(() => null);
    const { resolveImageToDataUrl } = await import("../../utils/generateWorkflowReport");
    businessLogo = rawBusinessLogo ? await resolveImageToDataUrl(rawBusinessLogo) : null;
  }

  if (includeCustomerLogo && projectContext?.customerId) {
    const rawCustomerLogo = await customerService.getCustomers()
      .then((all) => all.find((customer) => customer.customerId === projectContext.customerId || customer.id === projectContext.customerId)?.logo ?? null)
      .catch(() => null);
    const { resolveImageToDataUrl } = await import("../../utils/generateWorkflowReport");
    customerLogo = rawCustomerLogo ? await resolveImageToDataUrl(rawCustomerLogo) : null;
  }

  const metadata = includeProjectMeta
    ? [
        { label: "Customer", value: projectContext?.customerName || (customerNames.length === 1 ? customerNames[0] : customerNames.length > 1 ? "Multiple customers" : "-") },
        { label: "Project Number", value: projectContext?.jobNumber || (displayAssets.length > 0 ? `${new Set(displayAssets.map((asset) => asset.projectId)).size} project(s)` : "-") },
        { label: "Project Manager", value: projectContext?.projectManager || "-" },
        { label: "Start Date", value: projectContext?.startDate || "-" },
        { label: "Product", value: activeProduct?.name || (productNames.length === 1 ? productNames[0] : productNames.length > 1 ? productNames.join(", ") : "-") },
        { label: "Export Date", value: exportDateDisplay },
        { label: "Filters", value: filtersSummary || "Current view" },
      ]
    : [];

  const rows = displayAssets.map((asset) => selectedColumns.map((column) => column.valueFor(asset)));
  const modeLabel = "Operations";

  return {
    filenameBase: `project-assets-${exportMode}-${exportDate.toISOString().slice(0, 10)}`,
    title: `${modeLabel} Asset Export`,
    subtitle: `${displayAssets.length} row(s) | ${filtersSummary || "Current view"}`,
    exportDateDisplay,
    columns: selectedColumns,
    rows,
    metadata,
    businessLogo,
    customerLogo,
    modeLabel,
  };
}

export function normalizeExcelHeaderLabel(label: string) {
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean) return clean;
  if (clean.includes(" - ")) {
    const parts = clean.split(" - ");
    if (parts.length >= 2) return `${parts[0]}
${parts.slice(1).join(" - ")}`;
  }
  const words = clean.split(" ");
  if (words.length <= 2) return clean;
  const midpoint = Math.ceil(words.length / 2);
  return `${words.slice(0, midpoint).join(" ")}
${words.slice(midpoint).join(" ")}`;
}

export function buildAssetExportGroupSpans(columns: AssetExportColumnOption[]): AssetExportGroupSpan[] {
  const spans: AssetExportGroupSpan[] = [];
  columns.forEach((column, index) => {
    const label = column.groupLabel || "DATA";
    const note = column.noteLabel || "";
    const previous = spans[spans.length - 1];
    if (previous && previous.label === label && previous.note === note) {
      previous.end = index;
    } else {
      spans.push({ label, note, start: index, end: index });
    }
  });
  return spans;
}

export function exportGroupPalette(label: string, index: number): ExportGroupPalette {
  const normalized = label.trim().toUpperCase();
  if (normalized.includes("ASSET") || normalized.includes("JOB")) {
    return { header: "1F4E78", note: "DCE6F1", field: "2F75B5", body: "EEF5FB", bodyAlt: "E6F0F8", text: "163447" };
  }
  if (normalized.includes("WORKFLOW")) {
    return { header: "1D6F68", note: "D9F0EC", field: "2B8C82", body: "ECF8F5", bodyAlt: "E2F3EF", text: "154C47" };
  }
  if (normalized.includes("GENERAL")) {
    return { header: "5B6576", note: "E9EDF2", field: "758195", body: "F5F7FA", bodyAlt: "EDF1F5", text: "3E4A59" };
  }
  const palettes = [
    { header: "2F5597", note: "E6ECF8", field: "4472C4", body: "EEF3FD", bodyAlt: "E4ECFA", text: "203864" },
    { header: "287271", note: "E3F1F0", field: "2F8F9D", body: "ECF8FA", bodyAlt: "E2F1F4", text: "174B4A" },
    { header: "7A5C2E", note: "F6EDDD", field: "A67C32", body: "FBF5E8", bodyAlt: "F7EFDF", text: "5E451E" },
    { header: "556B7B", note: "E9EEF2", field: "6C7F90", body: "F2F6F9", bodyAlt: "EAF0F4", text: "394955" },
  ];
  return palettes[index % palettes.length];
}

export async function buildAssetExportWorkbook(report: AssetExportPackage) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const normalizedHeaders = report.columns.map((column) => normalizeExcelHeaderLabel(column.headerLabel ?? column.label));
  const noteLabels = report.columns.map((column) => column.noteLabel || "");
  const groupSpans = buildAssetExportGroupSpans(report.columns).map((span, index) => ({
    ...span,
    palette: exportGroupPalette(span.label, index),
  }));
  const columnPalettes = report.columns.map((column, index) => {
    const span = groupSpans.find((candidate) => index >= candidate.start && index <= candidate.end);
    return span?.palette ?? exportGroupPalette(column.groupLabel || "DATA", index);
  });
  const metadataSummary = report.metadata.map((item) => `${item.label}: ${item.value}`).join(" | ");
  const totalColumns = Math.max(report.columns.length, 1);

  const sheetRows: (string | number)[][] = [
    [report.title, ...Array.from({ length: totalColumns - 1 }, () => "")],
    [report.subtitle, ...Array.from({ length: totalColumns - 1 }, () => "")],
    [metadataSummary || `Generated ${report.exportDateDisplay}`, ...Array.from({ length: totalColumns - 1 }, () => "")],
    report.columns.map(() => ""),
    noteLabels,
    normalizedHeaders,
    ...report.rows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalColumns - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: totalColumns - 1 } },
  ];

  groupSpans.forEach((span) => {
    worksheet[XLSX.utils.encode_cell({ r: 3, c: span.start })] = { t: "s", v: span.label };
    if (span.start !== span.end) {
      merges.push({ s: { r: 3, c: span.start }, e: { r: 3, c: span.end } });
    }
  });
  worksheet["!merges"] = merges;

  worksheet["!cols"] = normalizedHeaders.map((header, index) => {
    const headerLines = header.split("\n");
    const headerWidth = Math.max(...headerLines.map((line) => line.length));
    const values = report.rows.map((row) => String(row[index] ?? ""));
    const longestValue = values.reduce((max, value) => Math.max(max, value.length), headerWidth);
    const minWidth = index < 12 ? 12 : 14;
    return { wch: Math.min(Math.max(longestValue + 3, minWidth), 26) };
  });

  worksheet["!rows"] = [
    { hpt: 24 },
    { hpt: 18 },
    { hpt: 20 },
    { hpt: 22 },
    { hpt: 18 },
    { hpt: 42 },
    ...report.rows.map(() => ({ hpt: 20 })),
  ];
  worksheet["!freeze"] = { xSplit: Math.min(2, totalColumns), ySplit: 6 };
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 5, c: 0 }, e: { r: Math.max(sheetRows.length - 1, 5), c: totalColumns - 1 } }) };

  const setCellStyle = (ref: string, style: Record<string, unknown>) => {
    const cell = worksheet[ref];
    if (!cell) return;
    cell.s = style;
  };

  const applyBoxBorder = (rgb: string) => ({
    top: { style: "thin", color: { rgb } },
    bottom: { style: "thin", color: { rgb } },
    left: { style: "thin", color: { rgb } },
    right: { style: "thin", color: { rgb } },
  });

  setCellStyle(XLSX.utils.encode_cell({ r: 0, c: 0 }), {
    font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "163447" } },
    alignment: { horizontal: "center", vertical: "center" },
  });
  setCellStyle(XLSX.utils.encode_cell({ r: 1, c: 0 }), {
    font: { bold: true, sz: 10, color: { rgb: "163447" } },
    fill: { fgColor: { rgb: "DCE6F1" } },
    alignment: { horizontal: "center", vertical: "center" },
  });
  setCellStyle(XLSX.utils.encode_cell({ r: 2, c: 0 }), {
    font: { italic: true, sz: 9, color: { rgb: "587082" } },
    fill: { fgColor: { rgb: "EEF4F7" } },
    alignment: { horizontal: "left", vertical: "center" },
  });

  groupSpans.forEach((span) => {
    setCellStyle(XLSX.utils.encode_cell({ r: 3, c: span.start }), {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: span.palette.header } },
      alignment: { horizontal: "center", vertical: "center" },
      border: applyBoxBorder(span.palette.header),
    });
  });

  for (let col = 0; col < totalColumns; col += 1) {
    const palette = columnPalettes[col];
    setCellStyle(XLSX.utils.encode_cell({ r: 4, c: col }), {
      font: { italic: true, sz: 9, color: { rgb: noteLabels[col] ? palette.text : "8EA0AF" } },
      fill: { fgColor: { rgb: palette.note } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: applyBoxBorder(palette.header),
    });
    setCellStyle(XLSX.utils.encode_cell({ r: 5, c: col }), {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: palette.field } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: applyBoxBorder(palette.header),
    });
  }

  for (let row = 6; row < sheetRows.length; row += 1) {
    const isEven = (row - 6) % 2 === 0;
    for (let col = 0; col < totalColumns; col += 1) {
      const palette = columnPalettes[col];
      setCellStyle(XLSX.utils.encode_cell({ r: row, c: col }), {
        fill: { fgColor: { rgb: isEven ? palette.body : palette.bodyAlt } },
        alignment: { vertical: "top", wrapText: true },
        border: applyBoxBorder("D5DEE5"),
      });
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, report.modeLabel === "Capture" ? "Capture Table" : "Asset Export");
  const legendSheet = XLSX.utils.aoa_to_sheet([
    ["Legend"],
    ["Dark band", "Column group / feature group"],
    ["Tinted note row", "Business part number or group note when available"],
    ["Colored field row", "Field names"],
  ]);
  XLSX.utils.book_append_sheet(workbook, legendSheet, "Legend");
  return workbook;
}

export function buildAssetExportHtml(report: AssetExportPackage, options: { excel: boolean }) {
  const logoCell = (src: string | null, fallback: string) => src
    ? `<div class="logo-slot"><img src="${src}" alt="${escapeHtml(fallback)}" /></div>`
    : `<div class="logo-slot logo-fallback">${escapeHtml(fallback)}</div>`;

  const metadataHtml = report.metadata.length > 0
    ? `<section class="meta-grid">${report.metadata.map((item) => `<div class="meta-card"><div class="meta-label">${escapeHtml(item.label)}</div><div class="meta-value">${escapeHtml(item.value)}</div></div>`).join("")}</section>`
    : "";

  const groupSpans = buildAssetExportGroupSpans(report.columns).map((span, index) => ({
    ...span,
    palette: exportGroupPalette(span.label, index),
  }));
  const columnPalettes = report.columns.map((column, index) => {
    const span = groupSpans.find((candidate) => index >= candidate.start && index <= candidate.end);
    return span?.palette ?? exportGroupPalette(column.groupLabel || "DATA", index);
  });
  const groupCells = groupSpans
    .map((group) => `<th class="group-cell" colspan="${group.end - group.start + 1}" style="background:#${group.palette.header};border-color:#${group.palette.header};">${escapeHtml(group.label)}</th>`)
    .join("");
  const noteCells = groupSpans
    .map((group) => `<th class="note-cell" colspan="${group.end - group.start + 1}" style="background:#${group.palette.note};border-color:#${group.palette.header};color:#${group.palette.text};">${group.note ? escapeHtml(group.note) : "&nbsp;"}</th>`)
    .join("");
  const headerCells = report.columns
    .map((column, index) => `<th class="field-cell" style="background:#${columnPalettes[index].field};border-color:#${columnPalettes[index].header};">${escapeHtml(normalizeExcelHeaderLabel(column.headerLabel ?? column.label)).replace(/\n/g, "<br />")}</th>`)
    .join("");
  const rowsHtml = report.rows.map((row, rowIndex) => `<tr>${row.map((cell, index) => `<td style="background:#${rowIndex % 2 === 0 ? columnPalettes[index].body : columnPalettes[index].bodyAlt};color:#${columnPalettes[index].text};">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(report.title)}</title><style>
      body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:20px;background:${options.excel ? "#ffffff" : "#f3f7fa"};color:#102027}
      .sheet{max-width:1700px;margin:0 auto;background:#fff;border:1px solid #c7d1db;box-shadow:${options.excel ? "none" : "0 12px 40px rgba(16,32,39,0.12)"}}
      .hero{display:grid;grid-template-columns:180px 1fr 180px;gap:16px;align-items:center;padding:20px 24px;background:linear-gradient(135deg,#163447 0%,#28536b 100%);color:#f5fbff;border-bottom:4px solid #2bb3a3}
      .title-block h1{margin:0;font-size:24px;letter-spacing:.02em}
      .title-block p{margin:6px 0 0;font-size:12px;color:#d6e5ee}
      .logo-slot{height:72px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.2);border-radius:10px;background:rgba(255,255,255,0.08);overflow:hidden}
      .logo-slot img{max-width:100%;max-height:64px;object-fit:contain}
      .logo-fallback{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#d6e5ee}
      .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:18px 24px;background:#eef4f7;border-bottom:1px solid #d5dee5}
      .meta-card{padding:10px 12px;border:1px solid #d4dde5;border-radius:8px;background:#fff}
      .meta-label{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#587082;margin-bottom:4px}
      .meta-value{font-size:13px;font-weight:600;color:#102027;white-space:pre-wrap}
      .table-wrap{padding:18px 24px 24px;overflow:auto}
      table{border-collapse:collapse;width:100%;table-layout:auto;min-width:1200px}
      th,td{border:1px solid #c7d1db;padding:7px 9px;font-size:11px;vertical-align:top;text-align:left;word-break:break-word}
      .group-cell{color:#f4fbff;font-weight:700;text-align:center;font-size:13px}
      .note-cell{font-style:italic;font-size:9px;text-align:center}
      .field-cell{color:#fff;font-weight:700;line-height:1.35;text-align:center;min-width:92px}
      td{color:#102027}
      .footer-note{padding:0 24px 18px;color:#587082;font-size:11px}
    </style></head><body><div class="sheet"><section class="hero">${logoCell(report.businessLogo, "Business Logo")}
      <div class="title-block"><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.subtitle)}</p></div>
      ${logoCell(report.customerLogo, "Customer Logo")}</section>${metadataHtml}<section class="table-wrap"><table><thead><tr>${groupCells}</tr><tr>${noteCells}</tr><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table></section><div class="footer-note">Generated ${escapeHtml(report.exportDateDisplay)}</div></div></body></html>`;
}
