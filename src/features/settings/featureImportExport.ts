/**
 * Feature Library import/export mapping for the `isInventory` property, presented to users
 * as "Feature: Yes/No". Extracted from Settings.tsx so the export→import round trip can be
 * unit-tested directly, without simulating an XLSX file upload through the full component.
 *
 * No new DB/API field — this reuses the existing `isInventory` property end to end. It now
 * also governs Workflow Builder availability: Feature: Yes is offered as a new choice when
 * building a workflow; Feature: No is not. An existing workflow that already references a
 * Feature: No item keeps resolving and displaying it — only *new* selection is gated. See
 * `src/utils/featureAvailability.ts` for the selection-availability rule itself.
 */

export interface FeatureImportRow {
  name: string;
  description: string;
  valueType: string;
  supplier: string;
  partNumber: string;
  manufacturerPartNumber: string;
  unitPrice: string;
  brand: string;
  isInventory: boolean;
}

/** Canonical export value for the "Feature" column. */
export function featureFlagToExportValue(isInventory: boolean | undefined): "Yes" | "No" {
  return isInventory ? "Yes" : "No";
}

/**
 * Recognizes the canonical "Feature"/"feature" column (Yes/No, also accepting true/false/1/0)
 * and, for backward compatibility, the older "isInventory"/"is_inventory"/"inventory"/
 * "Inventory" column names/values that exports wrote before this change. A column that is
 * absent or blank is explicitly treated as "No" — not a guess: most files exported before
 * this change never had this column at all, so "column not present" is a legitimate, common,
 * and unambiguous case, not a data anomaly. A column that IS present with a genuinely
 * unrecognized value (not yes/true/1 and not no/false/0/blank) is also treated as "No",
 * matching the pre-existing behavior for this field rather than silently guessing "Yes".
 */
export function parseFeatureFlagFromImportRow(row: Record<string, unknown>): boolean {
  const raw = String(
    row["Feature"] ?? row["feature"] ?? row["isInventory"] ?? row["is_inventory"] ?? row["inventory"] ?? row["Inventory"] ?? ""
  ).trim().toLowerCase();
  return raw === "yes" || raw === "true" || raw === "1";
}

export function parseFeatureImportRow(row: Record<string, unknown>): FeatureImportRow {
  return {
    name: String(row["name"] || row["Name"] || "").trim(),
    description: String(row["description"] || row["Description"] || "").trim(),
    valueType: String(row["valueType"] || row["type"] || row["Type"] || "text").trim() || "text",
    supplier: String(row["supplier"] || row["Supplier"] || "").trim(),
    partNumber: String(row["partNumber"] || row["part_number"] || row["PartNumber"] || row["part#"] || "").trim(),
    manufacturerPartNumber: String(
      row["manufacturerPartNumber"] || row["manufacturer_part_number"] || row["ManufacturerPartNumber"] || row["mfr_part"] || "",
    ).trim(),
    unitPrice: String(row["unitPrice"] || row["unit_price"] || row["UnitPrice"] || row["price"] || "").trim(),
    brand: String(row["brand"] || row["Brand"] || "").trim(),
    isInventory: parseFeatureFlagFromImportRow(row),
  };
}

/**
 * WF-6 Feature Library extension: FeatureDependency rows, exported to (and parsed from) a second
 * "Dependencies" sheet alongside the existing "Features" sheet. A dependency row references its
 * parent feature by NAME (not id — XLSX is a human-editable format and ids aren't stable/known
 * to a spreadsheet author), matching how the "Features" sheet itself has no id column either;
 * resolving that name back to a real featureId is the importing caller's job (it has the
 * feature-name -> id map from the Features sheet's own import pass), not this module's.
 */
export interface FeatureDependencyImportRow {
  featureName: string;
  name: string;
  isInventory: boolean;
  captureFields: string[];
  defaultQty: string;
  unit: string;
  unitPrice: string;
}

/** Canonical export row (as an array, matching the aoa_to_sheet convention already used for the
 *  Features sheet) for one FeatureDependency, given its parent feature's name. */
export function featureDependencyToExportRow(
  dep: { name: string; isInventory: boolean; captureFields: string[]; defaultQty: number; unit?: string; unitPrice: number },
  featureName: string,
): (string | number)[] {
  return [
    featureName,
    dep.name,
    featureFlagToExportValue(dep.isInventory),
    dep.captureFields.join(";"),
    String(dep.defaultQty),
    dep.unit ?? "",
    String(dep.unitPrice),
  ];
}

export function parseFeatureDependencyImportRow(row: Record<string, unknown>): FeatureDependencyImportRow {
  const captureFieldsRaw = String(row["captureFields"] || row["capture_fields"] || row["CaptureFields"] || "").trim();
  return {
    featureName: String(row["featureName"] || row["feature"] || row["Feature"] || row["FeatureName"] || "").trim(),
    name: String(row["name"] || row["Name"] || "").trim(),
    isInventory: parseFeatureFlagFromImportRow(row),
    captureFields: captureFieldsRaw ? captureFieldsRaw.split(";").map((s) => s.trim()).filter(Boolean) : [],
    defaultQty: String(row["defaultQty"] || row["default_qty"] || row["DefaultQty"] || "1").trim() || "1",
    unit: String(row["unit"] || row["Unit"] || "").trim(),
    unitPrice: String(row["unitPrice"] || row["unit_price"] || row["UnitPrice"] || row["price"] || "0").trim() || "0",
  };
}

export type FeatureDependencyResolution =
  | { status: "resolved"; featureName: string }
  | { status: "unknown" }
  | { status: "ambiguous"; matchCount: number };

function normalizeFeatureName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Resolves a dependency row's `featureName` against a set of candidate feature names (typically
 * existing library features UNION the names of feature rows in the same import batch). Never
 * invents or remaps an id: zero matches is "unknown" and more than one match is "ambiguous" —
 * both are reported, never guessed, so the caller can skip/report that row rather than attach it
 * to the wrong (or a nonexistent) feature.
 */
export function resolveFeatureDependencyRow(
  row: FeatureDependencyImportRow,
  candidateFeatureNames: string[],
): FeatureDependencyResolution {
  const target = normalizeFeatureName(row.featureName);
  const matches = candidateFeatureNames.filter((name) => normalizeFeatureName(name) === target);
  if (matches.length === 0) return { status: "unknown" };
  if (matches.length > 1) return { status: "ambiguous", matchCount: matches.length };
  return { status: "resolved", featureName: matches[0] };
}
