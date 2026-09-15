import { describe, expect, it } from "vitest";
import {
  featureFlagToExportValue,
  parseFeatureFlagFromImportRow,
  parseFeatureImportRow,
  featureDependencyToExportRow,
  parseFeatureDependencyImportRow,
  resolveFeatureDependencyRow,
} from "./featureImportExport";

describe("featureFlagToExportValue", () => {
  it("exports true as 'Yes' and false/undefined as 'No'", () => {
    expect(featureFlagToExportValue(true)).toBe("Yes");
    expect(featureFlagToExportValue(false)).toBe("No");
    expect(featureFlagToExportValue(undefined)).toBe("No");
  });
});

describe("parseFeatureFlagFromImportRow — canonical 'Feature' column", () => {
  it("round-trips Yes/No through export→import for every feature", () => {
    for (const isInventory of [true, false]) {
      const exported = featureFlagToExportValue(isInventory);
      const reimported = parseFeatureFlagFromImportRow({ Feature: exported });
      expect(reimported).toBe(isInventory);
    }
  });

  it("accepts case-insensitive Yes/No and the lowercase 'feature' header", () => {
    expect(parseFeatureFlagFromImportRow({ feature: "yes" })).toBe(true);
    expect(parseFeatureFlagFromImportRow({ feature: "YES" })).toBe(true);
    expect(parseFeatureFlagFromImportRow({ Feature: "No" })).toBe(false);
  });

  it("also accepts true/false/1/0 on the canonical column", () => {
    expect(parseFeatureFlagFromImportRow({ Feature: "true" })).toBe(true);
    expect(parseFeatureFlagFromImportRow({ Feature: "1" })).toBe(true);
    expect(parseFeatureFlagFromImportRow({ Feature: "false" })).toBe(false);
    expect(parseFeatureFlagFromImportRow({ Feature: "0" })).toBe(false);
  });
});

describe("parseFeatureFlagFromImportRow — legacy 'isInventory'-style columns (backward compat)", () => {
  it("still accepts every previously-supported column name", () => {
    expect(parseFeatureFlagFromImportRow({ isInventory: "true" })).toBe(true);
    expect(parseFeatureFlagFromImportRow({ is_inventory: "yes" })).toBe(true);
    expect(parseFeatureFlagFromImportRow({ inventory: "1" })).toBe(true);
    expect(parseFeatureFlagFromImportRow({ Inventory: "true" })).toBe(true);
  });

  it("still rejects the legacy column's false-shaped values", () => {
    expect(parseFeatureFlagFromImportRow({ isInventory: "false" })).toBe(false);
    expect(parseFeatureFlagFromImportRow({ Inventory: "non-inventory" })).toBe(false);
  });

  it("prefers the canonical 'Feature' column when both are present", () => {
    expect(parseFeatureFlagFromImportRow({ Feature: "Yes", isInventory: "false" })).toBe(true);
    expect(parseFeatureFlagFromImportRow({ Feature: "No", isInventory: "true" })).toBe(false);
  });
});

describe("parseFeatureFlagFromImportRow — blank/invalid values are explicit, not guessed", () => {
  it("treats a column that is entirely absent as No", () => {
    expect(parseFeatureFlagFromImportRow({ name: "Widget" })).toBe(false);
  });

  it("treats a blank value as No", () => {
    expect(parseFeatureFlagFromImportRow({ Feature: "" })).toBe(false);
    expect(parseFeatureFlagFromImportRow({ Feature: "   " })).toBe(false);
  });

  it("treats an unrecognized value as No rather than throwing or guessing Yes", () => {
    expect(parseFeatureFlagFromImportRow({ Feature: "maybe" })).toBe(false);
    expect(parseFeatureFlagFromImportRow({ Feature: "N/A" })).toBe(false);
  });
});

describe("parseFeatureImportRow — full row round trip", () => {
  it("maps every field, including the Feature flag, from a canonical-format row", () => {
    const row = {
      name: "IP Camera 4MP",
      description: "Indoor dome camera",
      valueType: "text",
      brand: "Hikvision",
      supplier: "AV Security",
      partNumber: "DS-2CD2143G2-I",
      manufacturerPartNumber: "MFR-DS-2143G2",
      unitPrice: "149.00",
      Feature: "Yes",
    };

    expect(parseFeatureImportRow(row)).toEqual({
      name: "IP Camera 4MP",
      description: "Indoor dome camera",
      valueType: "text",
      brand: "Hikvision",
      supplier: "AV Security",
      partNumber: "DS-2CD2143G2-I",
      manufacturerPartNumber: "MFR-DS-2143G2",
      unitPrice: "149.00",
      isInventory: true,
    });
  });

  it("defaults valueType to 'text' when omitted, and Feature to false when omitted", () => {
    const row = { name: "Simple Attribute" };
    const parsed = parseFeatureImportRow(row);
    expect(parsed.valueType).toBe("text");
    expect(parsed.isInventory).toBe(false);
  });

  it("still parses a legacy-format export (old 'Inventory' column, no 'Feature' column)", () => {
    const legacyRow = {
      name: "Legacy Widget",
      description: "",
      valueType: "text",
      brand: "",
      supplier: "",
      partNumber: "",
      manufacturerPartNumber: "",
      unitPrice: "",
      Inventory: "Inventory", // old chip-label-shaped value some hand-edited files might carry
    };
    // "Inventory" (the old chip label) is not itself a recognized true-value spelling — this
    // documents current, unchanged behavior: only true/yes/1 are recognized on the legacy
    // column too, matching what the pre-existing importer already accepted.
    expect(parseFeatureImportRow(legacyRow).isInventory).toBe(false);

    const legacyTrueRow = { ...legacyRow, Inventory: "true" };
    expect(parseFeatureImportRow(legacyTrueRow).isInventory).toBe(true);
  });
});

// WF-6: Feature Library XLSX extension — FeatureDependency rows on a second "Dependencies" sheet.
describe("featureDependencyToExportRow / parseFeatureDependencyImportRow — round trip", () => {
  const HEADERS = ["featureName", "name", "isInventory", "captureFields", "defaultQty", "unit", "unitPrice"];

  function rowToRecord(row: (string | number)[]): Record<string, string> {
    return Object.fromEntries(HEADERS.map((h, i) => [h, String(row[i])]));
  }

  it("round-trips an inventory dependency (multiple capture fields) through export→import", () => {
    const dep = { name: "Camera Unit", isInventory: true, captureFields: ["serialNo", "firmware"], defaultQty: 1, unit: undefined, unitPrice: 0 };
    const exported = featureDependencyToExportRow(dep, "Junction Box");
    const reimported = parseFeatureDependencyImportRow(rowToRecord(exported));

    expect(reimported).toEqual({
      featureName: "Junction Box",
      name: "Camera Unit",
      isInventory: true,
      captureFields: ["serialNo", "firmware"],
      defaultQty: "1",
      unit: "",
      unitPrice: "0",
    });
  });

  it("round-trips a non-inventory dependency (qty/unit/price, no capture fields)", () => {
    const dep = { name: "Mounting Bracket", isInventory: false, captureFields: [], defaultQty: 4, unit: "ea", unitPrice: 12.5 };
    const exported = featureDependencyToExportRow(dep, "Junction Box");
    const reimported = parseFeatureDependencyImportRow(rowToRecord(exported));

    expect(reimported).toEqual({
      featureName: "Junction Box",
      name: "Mounting Bracket",
      isInventory: false,
      captureFields: [],
      defaultQty: "4",
      unit: "ea",
      unitPrice: "12.5",
    });
  });

  it("defaults defaultQty/unitPrice to sensible values and captureFields to [] when columns are blank", () => {
    const parsed = parseFeatureDependencyImportRow({ featureName: "Junction Box", name: "Widget" });
    expect(parsed.defaultQty).toBe("1");
    expect(parsed.unitPrice).toBe("0");
    expect(parsed.captureFields).toEqual([]);
  });
});

describe("resolveFeatureDependencyRow — never invents or remaps an id", () => {
  const row = (featureName: string): ReturnType<typeof parseFeatureDependencyImportRow> =>
    ({ featureName, name: "Camera Unit", isInventory: true, captureFields: [], defaultQty: "1", unit: "", unitPrice: "0" });

  it("resolves a single case/punctuation-insensitive match", () => {
    const result = resolveFeatureDependencyRow(row("junction box"), ["Junction Box", "Generator"]);
    expect(result).toEqual({ status: "resolved", featureName: "Junction Box" });
  });

  it("reports unknown when no candidate feature name matches", () => {
    const result = resolveFeatureDependencyRow(row("Nonexistent Feature"), ["Junction Box", "Generator"]);
    expect(result).toEqual({ status: "unknown" });
  });

  it("reports ambiguous (never guesses) when more than one candidate matches", () => {
    const result = resolveFeatureDependencyRow(row("Junction Box"), ["Junction Box", "Junction Box"]);
    expect(result).toEqual({ status: "ambiguous", matchCount: 2 });
  });
});
