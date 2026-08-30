/**
 * Regression tests A–E for stale asset 404 handling (native offline-first).
 *
 * A — one authoritative 404 on first encounter
 * B — durably removed from assets store + dashboard-workspace cache
 * C — same session: no repeat GET after mark
 * D — after restart: hydrate restores missing-id guard
 * E — network/timeout errors do not purge valid local assets
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./connectivityMonitor", () => ({
  shouldSkipBlockingFetch: vi.fn(() => false),
  shouldSkipRunMutation: vi.fn(() => false),
}));

vi.mock("./localDB", () => ({
  entityGetAsset: vi.fn(),
  entityPutAsset: vi.fn().mockResolvedValue(undefined),
  entityDeleteAsset: vi.fn().mockResolvedValue(undefined),
  entityGetAllAssets: vi.fn(),
  entityGetAllProjects: vi.fn(),
  entityGetWorkflowRunsByAsset: vi.fn(),
}));

vi.mock("./offlineStore", () => ({
  default: {
    getCache: vi.fn(),
    saveCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./api", () => ({
  default: { get: vi.fn() },
}));

import api from "./api";
import offlineStore from "./offlineStore";
import { entityDeleteAsset, entityGetAsset } from "./localDB";
import { projectAssetService } from "./projectAssetService";
import {
  hydrateKnownMissingAssetIds,
  isKnownMissingAssetId,
  resetKnownMissingAssetIdsForTests,
} from "../utils/staleAssetIds";
import { purgeStaleAssetOnAuthoritative404 } from "../utils/staleAssetPurge";

describe("stale asset persistence regressions", () => {
  beforeEach(() => {
    resetKnownMissingAssetIdsForTests();
    vi.mocked(entityGetAsset).mockReset();
    vi.mocked(entityDeleteAsset).mockClear();
    vi.mocked(api.get).mockReset();
    vi.mocked(offlineStore.getCache).mockReset();
    vi.mocked(offlineStore.saveCache).mockClear();
  });

  it("A — getById returns null once on authoritative 404 and marks missing", async () => {
    vi.mocked(entityGetAsset).mockResolvedValue(null);
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const first = await projectAssetService.getById("ghost-1");
    const second = await projectAssetService.getById("ghost-1");

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(isKnownMissingAssetId("ghost-1")).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("B — authoritative 404 purge drops asset row and workspace cache entry", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue({
      currentInstalls: [{ id: "ghost-1", projectId: "p1" }],
      currentInspections: [],
      installHistory: [],
      inspectionHistory: [],
    });

    await purgeStaleAssetOnAuthoritative404("ghost-1", "user-1");

    expect(entityDeleteAsset).toHaveBeenCalledWith("ghost-1");
    expect(offlineStore.saveCache).toHaveBeenCalledWith(
      "dashboard-workspace:user-1",
      expect.objectContaining({ currentInstalls: [] }),
    );
  });

  it("C — verifyAssetExistsOnline skips repeat GET when already known missing", async () => {
    await purgeStaleAssetOnAuthoritative404("ghost-1", "user-1");
    vi.mocked(api.get).mockClear();

    const exists = await projectAssetService.verifyAssetExistsOnline("ghost-1");

    expect(exists).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("D — hydrateKnownMissingAssetIds restores guard across app restart", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue(["ghost-1", "ghost-2"]);

    await hydrateKnownMissingAssetIds();

    expect(isKnownMissingAssetId("ghost-1")).toBe(true);
    expect(isKnownMissingAssetId("ghost-2")).toBe(true);
  });

  it("E — network error during verify preserves local asset (no purge)", async () => {
    vi.mocked(entityGetAsset).mockResolvedValue({
      id: "live-1",
      productId: "prod-1",
      projectId: "p1",
      data: { id: "live-1", productId: "prod-1", projectId: "p1" },
      dirty: false,
    });
    vi.mocked(api.get).mockRejectedValue(new Error("Network Error"));
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);

    const exists = await projectAssetService.verifyAssetExistsOnline("live-1");

    expect(exists).toBe(true);
    expect(entityDeleteAsset).not.toHaveBeenCalled();
    expect(isKnownMissingAssetId("live-1")).toBe(false);
  });
});
