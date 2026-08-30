import { describe, expect, it, beforeEach } from "vitest";
import {
  isKnownMissingAssetId,
  markKnownMissingAssetId,
  reconcileKnownMissingAssetIds,
  resetKnownMissingAssetIdsForTests,
} from "./staleAssetIds";

describe("staleAssetIds", () => {
  beforeEach(() => {
    resetKnownMissingAssetIdsForTests();
  });

  it("marks and detects missing asset ids", () => {
    expect(isKnownMissingAssetId("ghost-1")).toBe(false);
    markKnownMissingAssetId("ghost-1");
    expect(isKnownMissingAssetId("ghost-1")).toBe(true);
  });

  it("reconciles when asset reappears on server list sync", () => {
    markKnownMissingAssetId("ghost-1");
    markKnownMissingAssetId("ghost-2");
    reconcileKnownMissingAssetIds(["ghost-1", "live-3"]);
    expect(isKnownMissingAssetId("ghost-1")).toBe(false);
    expect(isKnownMissingAssetId("ghost-2")).toBe(true);
  });
});
