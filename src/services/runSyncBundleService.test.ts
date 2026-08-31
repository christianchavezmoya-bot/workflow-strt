import { beforeEach, describe, expect, it, vi } from "vitest";
import offlineStore from "./offlineStore";
import {
  isRunBundleCandidate,
  isRunSyncBundleUnsupported,
  markRunSyncBundleUnsupported,
} from "./runSyncBundleService";
import { pendingGetByEntityId } from "./localDB";

vi.mock("./localDB", () => ({
  pendingGetByEntityId: vi.fn(),
}));

vi.mock("./offlineStore", () => ({
  default: {
    saveCache: vi.fn(),
    getCache: vi.fn(),
  },
}));

describe("runSyncBundleService bundle fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a run as bundle-unsupported in offline cache", async () => {
    await markRunSyncBundleUnsupported("run-local-1");
    expect(offlineStore.saveCache).toHaveBeenCalledWith(
      "sync-bundle-unsupported:run-local-1",
      true,
    );
  });

  it("skips bundle candidate when run was marked unsupported", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue(true);
    vi.mocked(pendingGetByEntityId).mockResolvedValue([
      { opType: "RUN_COMPLETE", status: "pending", id: "a1", createdAt: "2026-01-01T00:00:00Z" },
      { opType: "SIGNATURE_SUBMIT", status: "pending", id: "a2", createdAt: "2026-01-01T00:01:00Z" },
    ] as never);

    await expect(isRunSyncBundleUnsupported("run-local-2")).resolves.toBe(true);
    await expect(isRunBundleCandidate("run-local-2")).resolves.toBe(false);
    expect(pendingGetByEntityId).not.toHaveBeenCalled();
  });
});
