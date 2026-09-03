/**
 * Feature Library import/export mapping for the `isInventory` property, presented to users
 * as "Feature: Yes/No". Extracted from Settings.tsx so the export→import round trip can be
 * unit-tested directly, without simulating an XLSX file upload through the full component.
 *
 * `isInventory` itself is unchanged — see Feature.isInventory's doc comment: it means "this
 * item is itself individually tracked (serial/IP/MAC/etc.)", not "is this usable when
 * building a workflow" (every Feature Library row is already selectable there regardless of
 * this flag). "Feature: Yes/No" is a presentation-layer label for the existing property, not
 * a new concept — see the DEV acceptance follow-up PR description for the full rationale.
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
