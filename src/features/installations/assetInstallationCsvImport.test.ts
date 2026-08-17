import { describe, expect, it } from "vitest";
import type { WorkflowConfig } from "../../types/workflowConfig";
import {
  buildWorkflowConfigTypeMap,
  countCsvRowsWithAssetTag,
  csvRowPreview,
  mapCsvRowsToAssetDrafts,
  normalizeCsvHeaderCell,
  parseAssetInstallationCsv,
  type AssetInstallationCsvRow,
} from "./assetInstallationCsvImport";
import { mergeImportedAssets } from "./useAssetInstallationCsvImport";
import type { ProjectAsset } from "../../types/projectAsset";

describe("parseAssetInstallationCsv", () => {
  it("parses headers with spaces and hash signs into snake_case keys", () => {
    const csv = [
      "Asset Tag,Asset Name,Serial #,Config Type",
      "TAG-001,Widget A,SN-1,Installation",
    ].join("\n");

    const rows = parseAssetInstallationCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      asset_tag: "TAG-001",
      asset_name: "Widget A",
      serial_: "SN-1",
      config_type: "Installation",
    });
  });

  it("returns empty array when file has header only", () => {
    expect(parseAssetInstallationCsv("Asset Tag\n")).toEqual([]);
  });

  it("strips wrapping quotes from values", () => {
    const csv = 'Asset Tag,Asset Name\n"TAG-002","Named asset"';
    expect(parseAssetInstallationCsv(csv)[0].asset_tag).toBe("TAG-002");
  });
});

describe("normalizeCsvHeaderCell", () => {
  it("lowercases and normalises separators", () => {
    expect(normalizeCsvHeaderCell(" Serial # ")).toBe("serial_");
  });
});

describe("mapCsvRowsToAssetDrafts", () => {
  const configs: WorkflowConfig[] = [
    {
      id: "cfg-install",
      productId: "prod-1",
      name: "Install Config",
      configType: "Installation",
      status: "Published",
      version: 1,
      stepsJson: "[]",
      mediaJson: "[]",
      featureSelectionsJson: "[]",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    } as WorkflowConfig,
  ];

  it("maps valid rows and matches config type to productConfigId", () => {
    const rows = parseAssetInstallationCsv(
      "Asset Tag,Config Type,Model\nTAG-1,installation,Model-X\n,Installation,Skip me",
    );
    const drafts = mapCsvRowsToAssetDrafts(rows, buildWorkflowConfigTypeMap(configs));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({
      assetTag: "TAG-1",
      assetName: undefined,
      serialNumber: undefined,
      assetModel: "Model-X",
      manufacturer: undefined,
      productConfigId: "cfg-install",
    });
  });

  it("accepts legacy assettag column alias", () => {
    const drafts = mapCsvRowsToAssetDrafts([{ assettag: "LEG-1" }], new Map());
    expect(drafts[0]?.assetTag).toBe("LEG-1");
  });
});

describe("csvRowPreview and counts", () => {
  it("reports validity and display fields", () => {
    const preview = csvRowPreview({ asset_tag: "A-1", asset_name: "Alpha" });
    expect(preview.valid).toBe(true);
    expect(preview.assetName).toBe("Alpha");

    const rows: AssetInstallationCsvRow[] = [{ asset_tag: "A" }, { asset_name: "no tag" }];
    expect(countCsvRowsWithAssetTag(rows)).toBe(1);
  });
});

describe("mergeImportedAssets", () => {
  it("appends new assets without duplicating ids", () => {
    const existing = [{ id: "a1" }] as ProjectAsset[];
    const created = [{ id: "a2" }, { id: "a1" }] as ProjectAsset[];
    expect(mergeImportedAssets(existing, created).map((a) => a.id)).toEqual(["a1", "a2"]);
  });
});
