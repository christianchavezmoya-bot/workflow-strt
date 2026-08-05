import * as XLSX from "xlsx";
import type { CaptureSpreadsheetAssetJobColumn } from "../features/installations/captureSpreadsheetTableLayout";
import type { ProjectAsset } from "../types/projectAsset";
import type { ProjectCaptureColumn, ProjectCaptureGroup } from "./projectCaptureTable";

export type CaptureExportFormat = "csv" | "json" | "xlsx";

export interface CaptureExportColumn {
  id: string;
  label: string;
  groupLabel: string;
  valueFor: (asset: ProjectAsset, cells: Record<string, string>) => string;
}

export interface CaptureExportContext {
  filenameBase: string;
  projectLabel?: string;
  columns: CaptureExportColumn[];
  assets: ProjectAsset[];
  rows: { asset: ProjectAsset; cells: Record<string, string> }[];
}

export function buildCaptureExportColumns(
  assetJobColumns: CaptureSpreadsheetAssetJobColumn[],
  orderedGroups: ProjectCaptureGroup[],
): CaptureExportColumn[] {
  return [
    {
      id: "assetTag",
      label: "Asset Tag",
      groupLabel: "ASSET & JOB",
      valueFor: (asset) => asset.assetTag || "-",
    },
    ...assetJobColumns.map((column) => ({
      id: `asset-job:${column.id}`,
      label: column.label,
      groupLabel: "ASSET & JOB",
      valueFor: (asset: ProjectAsset) => column.valueFor(asset) || "-",
    })),
    ...orderedGroups.flatMap((group) =>
      group.columns.map((column) => ({
        id: `capture:${column.id}`,
        label: column.displayLabel,
        groupLabel: group.displayName,
        valueFor: (_asset: ProjectAsset, cells: Record<string, string>) => {
          const raw = cells[column.id] ?? "";
          return raw.trim().length > 0 ? raw : "-";
        },
      })),
    ),
  ];
}

export function buildCaptureExportContext(
  filenameBase: string,
  projectLabel: string | undefined,
  columns: CaptureExportColumn[],
  rows: { asset: ProjectAsset; cells: Record<string, string> }[],
): CaptureExportContext {
  return { filenameBase, projectLabel, columns, assets: rows.map((row) => row.asset), rows };
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function exportCaptureCsv(ctx: CaptureExportContext): void {
  const header = ctx.columns.map((column) => column.label);
  const body = ctx.rows.map(({ asset, cells }) =>
    ctx.columns.map((column) => column.valueFor(asset, cells)),
  );
  const lines = [header, ...body].map((row) => row.map(escapeCsv).join(","));
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), `${ctx.filenameBase}.csv`);
}

export function exportCaptureJson(ctx: CaptureExportContext): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    project: ctx.projectLabel ?? null,
    columns: ctx.columns.map((column) => ({ id: column.id, label: column.label, group: column.groupLabel })),
    rows: ctx.rows.map(({ asset, cells }) => ({
      assetId: asset.id,
      assetTag: asset.assetTag,
      values: Object.fromEntries(
        ctx.columns.map((column) => [column.label, column.valueFor(asset, cells)]),
      ),
    })),
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${ctx.filenameBase}.json`);
}

export function exportCaptureXlsx(ctx: CaptureExportContext): void {
  const groupRow = ctx.columns.map((column) => column.groupLabel);
  const headerRow = ctx.columns.map((column) => column.label);
  const body = ctx.rows.map(({ asset, cells }) =>
    ctx.columns.map((column) => column.valueFor(asset, cells)),
  );
  const sheet = XLSX.utils.aoa_to_sheet([groupRow, headerRow, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Capture");
  XLSX.writeFile(workbook, `${ctx.filenameBase}.xlsx`);
}

export function runCaptureExport(ctx: CaptureExportContext, format: CaptureExportFormat): void {
  switch (format) {
    case "csv":
      exportCaptureCsv(ctx);
      break;
    case "json":
      exportCaptureJson(ctx);
      break;
    case "xlsx":
      exportCaptureXlsx(ctx);
      break;
    default:
      break;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Group amendable columns under their feature header for the run-amend dialog. */
export interface CaptureColumnFeatureGroup {
  key: string;
  label: string;
  subtitle?: string;
  columns: ProjectCaptureColumn[];
}

export function groupCaptureColumnsByFeature(
  columns: ProjectCaptureColumn[],
  groups: ProjectCaptureGroup[],
): CaptureColumnFeatureGroup[] {
  const byKey = new Map<string, CaptureColumnFeatureGroup>();

  for (const column of columns) {
    const group = groups.find((item) =>
      item.key === column.groupKey || item.columns.some((c) => c.id === column.id),
    );
    const key = group?.key ?? column.groupKey;
    const label = group?.displayName ?? column.featureName ?? "Feature";
    const pn = group?.businessPartNumber;
    const mfr = group?.manufacturerPartNumber;
    const subtitle = group?.groupType === "general"
      ? "Shared sign-off fields"
      : pn
        ? `P/N: ${pn}${mfr && mfr !== pn ? ` | Mfr: ${mfr}` : ""}`
        : mfr
          ? `Mfr: ${mfr}`
          : undefined;

    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { key, label, subtitle, columns: [] };
      byKey.set(key, bucket);
    }
    bucket.columns.push(column);
  }

  return Array.from(byKey.values());
}
