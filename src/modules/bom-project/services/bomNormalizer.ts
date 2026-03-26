/**
 * bomNormalizer.ts
 * Converts raw workbook rows → canonical BOM rows using a column mapping.
 */
import type { RawWorkbookRow, ColumnMappingEntry } from "../types/sourceWorkbook";
import type { CanonicalBomRow, ItemScope } from "../types/canonicalBom";
import { safeNumber } from "../utils/safeNumber";

const ITEM_SCOPE_VALUES: ItemScope[] = [
  "per_asset",
  "project_total",
  "consumable",
  "reference",
];

function normalizeItemScope(raw: unknown): ItemScope | undefined {
  const s = String(raw ?? "").toLowerCase().replace(/[^a-z_]/g, "_");
  return ITEM_SCOPE_VALUES.find((v) => v === s);
}

/** Apply the column mapping to a single raw row and produce a CanonicalBomRow */
export function normalizeRow(
  raw: RawWorkbookRow,
  mappings: ColumnMappingEntry[]
): CanonicalBomRow {
  const get = (field: string): unknown => {
    const entry = mappings.find((m) => m.canonicalField === field);
    if (!entry) return undefined;
    let val = raw.cells[entry.sourceColumn];
    if (entry.transform === "string") val = String(val ?? "").trim() || null;
    if (entry.transform === "number") val = safeNumber(val) ?? null;
    if (entry.transform === "trim") val = typeof val === "string" ? val.trim() : val;
    if (entry.transform === "uppercase") val = typeof val === "string" ? val.toUpperCase() : val;
    if (entry.transform === "lowercase") val = typeof val === "string" ? val.toLowerCase() : val;
    return val;
  };

  const str = (f: string) => {
    const v = get(f);
    if (v === null || v === undefined) return undefined;
    const s = String(v).trim();
    return s.length > 0 ? s : undefined;
  };

  return {
    sourceRowId: raw.id,
    importRunId: raw.importRunId,
    sheetName: raw.sheetName,
    rowIndex: raw.rowIndex,
    partNumber: str("partNumber"),
    description: str("description") ?? `Row ${raw.rowIndex}`,
    supplier: str("supplier"),
    qty: safeNumber(get("qty")),
    unit: str("unit"),
    costUnit: safeNumber(get("costUnit")),
    costExtended: safeNumber(get("costExtended")),
    listPriceUnit: safeNumber(get("listPriceUnit")),
    listPriceExtended: safeNumber(get("listPriceExtended")),
    stockQty: safeNumber(get("stockQty")),
    requiredQty: safeNumber(get("requiredQty")),
    differenceQty: safeNumber(get("differenceQty")),
    vehicleType: str("vehicleType"),
    assetNameCandidate: str("assetNameCandidate"),
    groupName: str("groupName"),
    itemScope: normalizeItemScope(get("itemScope")),
    notes: str("notes"),
    itemTypeHint: str("itemTypeHint"),
  };
}

/** Normalize all raw rows for an import using the provided mappings */
export function normalizeAllRows(
  rawRows: RawWorkbookRow[],
  mappings: ColumnMappingEntry[]
): CanonicalBomRow[] {
  return rawRows
    .map((r) => normalizeRow(r, mappings))
    .filter((r) => r.description.trim().length > 0);
}

/** Auto-suggest column mappings by fuzzy-matching header names to canonical fields */
export function suggestMappings(headers: string[]): ColumnMappingEntry[] {
  const CANONICAL_ALIASES: Record<string, string[]> = {
    // itemTypeHint must come first — "type" is a substring of "vehicle type", "asset type", etc.
    // so if vehicleType were checked first, any "Type" column would incorrectly match it.
    itemTypeHint: ["type", "item type", "classification", "category type", "bom type"],
    partNumber: ["part number", "part#", "part no", "partno", "item number", "item#", "sku", "part_number"],
    description: ["description", "desc", "item description", "name", "item name", "product"],
    supplier: ["supplier", "vendor", "manufacturer", "mfr"],
    qty: ["qty", "quantity", "order qty", "required qty", "req qty", "amount"],
    unit: ["unit", "uom", "unit of measure"],
    costUnit: ["unit cost", "cost/unit", "cost per unit", "unit price", "price/unit"],
    costExtended: ["extended cost", "total cost", "ext cost", "ext. cost"],
    listPriceUnit: ["list price", "list price/unit", "msrp"],
    listPriceExtended: ["extended list", "ext list", "total list"],
    stockQty: ["stock", "stock qty", "on hand", "inventory", "current stock"],
    requiredQty: ["required", "required qty", "need"],
    differenceQty: ["difference", "diff", "shortage", "delta"],
    vehicleType: ["vehicle type", "vehicle", "machine type", "asset type", "fleet type"],
    assetNameCandidate: ["asset", "asset name", "unit name", "machine", "unit id"],
    groupName: ["group", "section", "category", "assembly"],
    itemScope: ["scope", "item scope", "level"],
    notes: ["notes", "comments", "remarks", "note"],
  };

  return headers.map((header) => {
    const normalized = header.toLowerCase().trim();
    let matched = "";
    for (const [field, aliases] of Object.entries(CANONICAL_ALIASES)) {
      if (aliases.some((a) => normalized.includes(a) || a.includes(normalized))) {
        matched = field;
        break;
      }
    }
    return { sourceColumn: header, canonicalField: matched };
  });
}
