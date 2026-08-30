import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hydrateKnownMissingAssetIds,
  isKnownMissingAssetId,
  markKnownMissingAssetId,
  reconcileKnownMissingAssetIds,
  resetKnownMissingAssetIdsForTests,
  seedKnownMissingAssetIdsForTests,
} from "./staleAssetIds";

vi.mock("../services/offlineStore", () => ({
  default: {
    getCache: vi.fn(),
    saveCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

import offlineStore from "../services/offlineStore";

describe("staleAssetIds", () => {
  beforeEach(() => {
    resetKnownMissingAssetIdsForTests();
    vi.mocked(offlineStore.getCache).mockReset();
    vi.mocked(offlineStore.saveCache).mockClear();
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

  it("persists missing ids to offlineStore on native", async () => {
    markKnownMissingAssetId("ghost-1");
    await new Promise((r) => setTimeout(r, 0));
    expect(offlineStore.saveCache).toHaveBeenCalledWith(
      "stale-missing-asset-ids",
      ["ghost-1"],
    );
  });

  it("hydrates missing ids from offlineStore", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue(["ghost-3"]);
    await hydrateKnownMissingAssetIds();
    expect(isKnownMissingAssetId("ghost-3")).toBe(true);
  });

  it("seedKnownMissingAssetIdsForTests simulates post-hydrate state", () => {
    seedKnownMissingAssetIdsForTests(["ghost-9"]);
    expect(isKnownMissingAssetId("ghost-9")).toBe(true);
  });
});
