import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("../services/localDB", () => ({
  entityDeleteAsset: vi.fn().mockResolvedValue(undefined),
  entityGetAsset: vi.fn().mockResolvedValue(null),
  entityGetWorkflowRunsByAsset: vi.fn().mockResolvedValue([]),
  pendingGetAll: vi.fn().mockResolvedValue([]),
  pendingMarkConflict: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/offlineStore", () => ({
  default: {
    getCache: vi.fn(),
    saveCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../services/secureStorage", () => ({
  secureGet: vi.fn(() => JSON.stringify({ id: "user-1" })),
}));

import offlineStore from "../services/offlineStore";
import { entityDeleteAsset } from "../services/localDB";
import { purgeStaleAssetOnAuthoritative404 } from "./staleAssetPurge";
import { isKnownMissingAssetId, resetKnownMissingAssetIdsForTests } from "./staleAssetIds";

describe("purgeStaleAssetOnAuthoritative404", () => {
  beforeEach(() => {
    resetKnownMissingAssetIdsForTests();
    vi.mocked(entityDeleteAsset).mockClear();
    vi.mocked(offlineStore.getCache).mockReset();
    vi.mocked(offlineStore.saveCache).mockClear();
  });

  it("marks missing, deletes asset row, and strips workspace cache", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue({
      currentInstalls: [{ id: "ghost-1", projectId: "p1" }],
      currentInspections: [],
      installHistory: [],
      inspectionHistory: [{ id: "ghost-1", projectId: "p1" }],
    });

    await purgeStaleAssetOnAuthoritative404("ghost-1", "user-1");

    expect(isKnownMissingAssetId("ghost-1")).toBe(true);
    expect(entityDeleteAsset).toHaveBeenCalledWith("ghost-1");
    expect(offlineStore.saveCache).toHaveBeenCalledWith(
      "dashboard-workspace:user-1",
      expect.objectContaining({
        currentInstalls: [],
        inspectionHistory: [],
      }),
    );
  });
});
