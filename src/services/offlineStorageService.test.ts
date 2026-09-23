import { beforeEach, describe, expect, it, vi } from "vitest";

const localDBMocks = vi.hoisted(() => ({
  droppedActionsGetAll: vi.fn().mockResolvedValue([]),
  entityGetAllProjects: vi.fn().mockResolvedValue([]),
  entityGetIssueRecordsByProject: vi.fn().mockResolvedValue([]),
  entityGetProjectRecord: vi.fn().mockResolvedValue(null),
  entityGetWorkflowRunRecordsByProject: vi.fn().mockResolvedValue([]),
  pendingCount: vi.fn().mockResolvedValue(0),
  storageManifestGetByCategory: vi.fn().mockResolvedValue([]),
  storageManifestGetByIssue: vi.fn().mockResolvedValue([]),
  storageManifestGetByProject: vi.fn().mockResolvedValue([]),
  storageManifestGetByWorkflowRun: vi.fn().mockResolvedValue([]),
}));

const discardMocks = vi.hoisted(() => ({
  checkProjectDiscardEligibility: vi.fn().mockResolvedValue({ eligibility: "SAFE_TO_REMOVE" }),
}));

const deviceMocks = vi.hoisted(() => ({
  readDeviceStorage: vi.fn().mockResolvedValue({ source: "UNAVAILABLE", freeBytes: null, totalBytes: null, quotaBytes: null, quotaUsageBytes: null }),
}));

vi.mock("./localDB", () => localDBMocks);
vi.mock("./projectDiscardService", () => discardMocks);
vi.mock("./deviceStorageCapability", () => deviceMocks);

import { getOfflineStorageOverview, getProjectStorageSummaries, getStorageBreakdown } from "./offlineStorageService";

beforeEach(() => {
  vi.clearAllMocks();
  localDBMocks.droppedActionsGetAll.mockResolvedValue([]);
  localDBMocks.entityGetAllProjects.mockResolvedValue([]);
  localDBMocks.entityGetIssueRecordsByProject.mockResolvedValue([]);
  localDBMocks.entityGetProjectRecord.mockResolvedValue(null);
  localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([]);
  localDBMocks.pendingCount.mockResolvedValue(0);
  localDBMocks.storageManifestGetByCategory.mockResolvedValue([]);
  localDBMocks.storageManifestGetByIssue.mockResolvedValue([]);
  localDBMocks.storageManifestGetByProject.mockResolvedValue([]);
  localDBMocks.storageManifestGetByWorkflowRun.mockResolvedValue([]);
  deviceMocks.readDeviceStorage.mockResolvedValue({ source: "UNAVAILABLE", freeBytes: null, totalBytes: null, quotaBytes: null, quotaUsageBytes: null });
});

describe("getStorageBreakdown", () => {
  it("sums bytes/count per category using ONLY the 5 indexed category queries — never a full-table scan", async () => {
    localDBMocks.storageManifestGetByCategory.mockImplementation(async (category: string) => {
      if (category === "CAPTURED_MEDIA") return [{ sizeBytes: 100 }, { sizeBytes: 250 }];
      if (category === "DOCUMENT") return [{ sizeBytes: 5000 }];
      return [];
    });

    const result = await getStorageBreakdown();

    expect(localDBMocks.storageManifestGetByCategory).toHaveBeenCalledTimes(5); // one call per category, no getAll
    const captured = result.byCategory.find((c) => c.category === "CAPTURED_MEDIA")!;
    expect(captured).toEqual({ category: "CAPTURED_MEDIA", count: 2, bytes: 350 });
    expect(result.manifestTotalBytes).toBe(350 + 5000);
  });
});

describe("getProjectStorageSummaries", () => {
  it("uses REAL fields only — closedAtUtc / status / lastSyncedAt(syncedAt), never an invented 'last used'", async () => {
    localDBMocks.entityGetAllProjects.mockResolvedValue([
      { id: "proj-1", jobNumber: "JOB-1", customerName: "Acme", status: "Closed", closedAtUtc: "2026-08-01T00:00:00.000Z" },
    ]);
    localDBMocks.entityGetProjectRecord.mockResolvedValue({ id: "proj-1", dirty: false, syncedAt: "2026-09-20T00:00:00.000Z" });

    const [summary] = await getProjectStorageSummaries();

    expect(summary).toMatchObject({
      projectId: "proj-1", name: "JOB-1", status: "Closed",
      lastSyncedAt: "2026-09-20T00:00:00.000Z", closedAtUtc: "2026-08-01T00:00:00.000Z",
      discardCheck: { eligibility: "SAFE_TO_REMOVE" },
    });
    expect(summary).not.toHaveProperty("lastUsed");
    expect(summary).not.toHaveProperty("lastOpened");
  });

  it("estimates bytes from run/issue JSON size plus attributed manifest entries, deduplicated across sources", async () => {
    localDBMocks.entityGetAllProjects.mockResolvedValue([{ id: "proj-1", jobNumber: "JOB-1", status: "In Progress" }]);
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([{ id: "run-1", data: { foo: "x".repeat(100) } }]);
    localDBMocks.storageManifestGetByProject.mockResolvedValue([{ id: "m1", sizeBytes: 1000 }]);
    localDBMocks.storageManifestGetByWorkflowRun.mockResolvedValue([{ id: "m1", sizeBytes: 1000 }, { id: "m2", sizeBytes: 2000 }]);

    const [summary] = await getProjectStorageSummaries();

    // m1 appears in both the direct-project query and the by-run query — must be counted ONCE.
    expect(summary.estimatedBytes).toBeGreaterThanOrEqual(1000 + 2000);
    expect(summary.estimatedBytes).toBeLessThan(1000 + 2000 + 200); // + a small JSON overhead, not double-counted
  });
});

describe("getOfflineStorageOverview", () => {
  it("computes a HEALTHY overview with no device-space signal (budget-only mode), using pending+dropped counts", async () => {
    localDBMocks.pendingCount.mockResolvedValue(3);
    localDBMocks.droppedActionsGetAll.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
    localDBMocks.entityGetAllProjects.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const overview = await getOfflineStorageOverview();

    expect(overview.pendingSyncOperations).toBe(3);
    expect(overview.droppedSyncOperations).toBe(2);
    expect(overview.offlineProjectCount).toBe(2);
    expect(overview.health.drivenBy).toBe("budget-only");
    expect(overview.health.level).toBe("HEALTHY");
  });

  it("does not query the storage_manifest full store — breakdown always goes through the 5 category-indexed queries", async () => {
    await getOfflineStorageOverview();
    expect(localDBMocks.storageManifestGetByCategory).toHaveBeenCalledTimes(5);
  });
});
