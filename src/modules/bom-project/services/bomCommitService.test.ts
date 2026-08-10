import { describe, expect, it } from "vitest";
import { bomRowIsInventoryFeature } from "./bomCommitService";
import type { ClassificationResult } from "../types/classification";

function cl(itemType: ClassificationResult["itemType"]): ClassificationResult {
  return {
    classificationId: "c1",
    sourceRowId: "r1",
    importRunId: "run1",
    itemType,
    inventoryTracked: itemType === "component",
    serialRequired: false,
    configurable: false,
    installRequired: false,
    testRequired: false,
    photoRequired: false,
    confidenceScore: 1,
    ruleSource: "test",
    isManualOverride: false,
  };
}

describe("bomRowIsInventoryFeature", () => {
  it("returns true for component rows", () => {
    expect(bomRowIsInventoryFeature(cl("component"))).toBe(true);
  });

  it("returns false for consumable, asset, reference, and ignore", () => {
    expect(bomRowIsInventoryFeature(cl("consumable"))).toBe(false);
    expect(bomRowIsInventoryFeature(cl("asset"))).toBe(false);
    expect(bomRowIsInventoryFeature(cl("reference"))).toBe(false);
    expect(bomRowIsInventoryFeature(cl("ignore"))).toBe(false);
  });
});
