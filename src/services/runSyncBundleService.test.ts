import { beforeEach, describe, expect, it, vi } from "vitest";
import offlineStore from "./offlineStore";
import {
  buildRunSyncBundleRequest,
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
    getMappedId: vi.fn(async () => "srv-run-1"),
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

describe("runSyncBundleService explicit issue deletions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sig = { id: "s1", opType: "SIGNATURE_SUBMIT", status: "pending", createdAt: "2026-01-01T00:02:00Z", body: { signerRole: "Installer" } };

  it("carries the completion's deletions plus any from still-queued progress saves, de-duplicated", async () => {
    vi.mocked(pendingGetByEntityId).mockResolvedValue([
      { id: "u1", opType: "RUN_UPDATE", status: "pending", createdAt: "2026-01-01T00:00:00Z", body: { issuesJson: "[]", deletedIssueIds: ["a", "b"] } },
      { id: "c1", opType: "RUN_COMPLETE", status: "pending", createdAt: "2026-01-01T00:01:00Z", body: { stepResultsJson: "[]", issuesJson: "[]", deletedIssueIds: ["b", "c"] } },
      sig,
    ] as never);

    const bundle = await buildRunSyncBundleRequest("run-local-1");

    expect(bundle?.request.deletedIssueIds).toEqual(["a", "b", "c"]);
  });

  it("omits the field when nothing was deleted (older APIs and unchanged payloads)", async () => {
    vi.mocked(pendingGetByEntityId).mockResolvedValue([
      { id: "c1", opType: "RUN_COMPLETE", status: "pending", createdAt: "2026-01-01T00:01:00Z", body: { stepResultsJson: "[]", issuesJson: "[]" } },
      sig,
    ] as never);

    const bundle = await buildRunSyncBundleRequest("run-local-1");

    expect(bundle).not.toBeNull();
    expect(bundle!.request).not.toHaveProperty("deletedIssueIds");
  });
});
