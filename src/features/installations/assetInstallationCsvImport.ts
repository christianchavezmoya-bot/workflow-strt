import type { WorkflowConfig } from "../../types/workflowConfig";

export type AssetInstallationCsvRow = Record<string, string>;

export type ParsedCsvAssetDraft = {
  assetTag: string;
  assetName?: string;
  serialNumber?: string;
  assetModel?: string;
  manufacturer?: string;
  productConfigId?: string;
};

/** Normalises CSV header cells to snake_case keys (matches legacy AssetInstallationPage parser). */
export function normalizeCsvHeaderCell(header: string): string {
  return header.trim().toLowerCase().replace(/[\s#]+/g, "_").replace(/^"|"$/g, "");
}

export function parseAssetInstallationCsv(text: string): AssetInstallationCsvRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const cols = lines[0].split(",").map(normalizeCsvHeaderCell);
  return lines
    .slice(1)
    .map((row) => {
      const vals = row.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""])) as AssetInstallationCsvRow;
    })
    .filter((r) => Object.values(r).some(Boolean));
}

export function csvRowAssetTag(row: AssetInstallationCsvRow): string {
  return row.asset_tag || row.assettag || "";
}

export function csvRowHasAssetTag(row: AssetInstallationCsvRow): boolean {
  return csvRowAssetTag(row).length > 0;
}

export function countCsvRowsWithAssetTag(rows: AssetInstallationCsvRow[]): number {
  return rows.filter(csvRowHasAssetTag).length;
}

export function buildWorkflowConfigTypeMap(configs: WorkflowConfig[]): Map<string, string> {
  return new Map(
    configs
      .filter((c) => c.configType)
      .map((c) => [c.configType!.trim().toLowerCase(), c.id]),
  );
}

export function mapCsvRowToAssetDraft(
  row: AssetInstallationCsvRow,
  configsByType: Map<string, string>,
): ParsedCsvAssetDraft | null {
  const assetTag = csvRowAssetTag(row);
  if (!assetTag) return null;

  const configType = (row.config_type || row.configtype || "").trim().toLowerCase();
  return {
    assetTag,
    assetName: row.asset_name || row.assetname || undefined,
    serialNumber: row.serial_number || row["serial_#"] || row.serialnumber || undefined,
    assetModel: row.model || row.asset_model || undefined,
    manufacturer: row.manufacturer || undefined,
    productConfigId: configType ? configsByType.get(configType) : undefined,
  };
}

export function mapCsvRowsToAssetDrafts(
  rows: AssetInstallationCsvRow[],
  configsByType: Map<string, string>,
): ParsedCsvAssetDraft[] {
  return rows
    .map((row) => mapCsvRowToAssetDraft(row, configsByType))
    .filter((draft): draft is ParsedCsvAssetDraft => draft !== null);
}

/** Preview fields for the import dialog table. */
export function csvRowPreview(row: AssetInstallationCsvRow) {
  return {
    assetTag: csvRowAssetTag(row),
    assetName: row.asset_name || row.assetname || "-",
    configType: row.config_type || row.configtype || "-",
    serialNumber: row.serial_number || row["serial_#"] || row.serialnumber || "-",
    model: row.model || row.asset_model || "-",
    valid: csvRowHasAssetTag(row),
  };
}
