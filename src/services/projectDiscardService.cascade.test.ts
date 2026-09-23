import { beforeEach, describe, expect, it, vi } from "vitest";

const localDBMocks = vi.hoisted(() => ({
  droppedActionsGetAll: vi.fn().mockResolvedValue([]),
  entityDeleteAsset: vi.fn().mockResolvedValue(undefined),
  entityDeleteProject: vi.fn().mockResolvedValue(undefined),
  entityDeleteWorkflowRun: vi.fn().mockResolvedValue(undefined),
  entityGetAssetRecordsByProject: vi.fn().mockResolvedValue([]),
  entityGetIssueRecordsByProject: vi.fn().mockResolvedValue([]),
  entityGetProjectRecord: vi.fn().mockResolvedValue(null),
  entityGetWorkflowRunRecordsByProject: vi.fn().mockResolvedValue([]),
  entityReplaceIssuesForAsset: vi.fn().mockResolvedValue(undefined),
  pendingGetAll: vi.fn().mockResolvedValue([]),
  storageManifestDelete: vi.fn().mockResolvedValue(undefined),
  storageManifestGetByAsset: vi.fn().mockResolvedValue([]),
  storageManifestGetByConfig: vi.fn().mockResolvedValue([]),
  storageManifestGetByDocument: vi.fn().mockResolvedValue([]),
  storageManifestGetByIssue: vi.fn().mockResolvedValue([]),
  storageManifestGetByProject: vi.fn().mockResolvedValue([]),
  storageManifestGetByWorkflowRun: vi.fn().mockResolvedValue([]),
}));

const mediaStoreMocks = vi.hoisted(() => ({
  deleteMedia: vi.fn().mockResolvedValue(undefined),
}));

// Behavioral guarantee for required test #12: if ANY code path in the discard cascade ever
// reaches the shared axios instance (directly or transitively), these spies register the call.
const apiMocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
}));

vi.mock("./localDB", () => localDBMocks);
vi.mock("./mediaStore", () => ({ default: mediaStoreMocks, mediaStore: mediaStoreMocks }));
vi.mock("./api", () => ({ default: apiMocks, ...apiMocks }));

import { discardProjectFromDevice } from "./projectDiscardService";

function manifestEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "media-1", category: "CAPTURED_MEDIA", path: "offline-media/x.jpg",
    locationKind: "filesystem", sizeBytes: 100, shared: false, createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localDBMocks.droppedActionsGetAll.mockResolvedValue([]);
  localDBMocks.entityDeleteAsset.mockResolvedValue(undefined);
  localDBMocks.entityDeleteProject.mockResolvedValue(undefined);
  localDBMocks.entityDeleteWorkflowRun.mockResolvedValue(undefined);
  localDBMocks.entityGetAssetRecordsByProject.mockResolvedValue([]);
  localDBMocks.entityGetIssueRecordsByProject.mockResolvedValue([]);
  localDBMocks.entityGetProjectRecord.mockResolvedValue({ id: "proj-A", dirty: false });
  localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([]);
  localDBMocks.entityReplaceIssuesForAsset.mockResolvedValue(undefined);
  localDBMocks.pendingGetAll.mockResolvedValue([]);
  localDBMocks.storageManifestGetByAsset.mockResolvedValue([]);
  localDBMocks.storageManifestGetByConfig.mockResolvedValue([]);
  localDBMocks.storageManifestGetByDocument.mockResolvedValue([]);
  localDBMocks.storageManifestGetByIssue.mockResolvedValue([]);
  localDBMocks.storageManifestGetByProject.mockResolvedValue([]);
  localDBMocks.storageManifestGetByWorkflowRun.mockResolvedValue([]);
});

// Required test #12
describe("discardProjectFromDevice — never touches the server (required test #12)", () => {
  it("makes ZERO calls through the shared api client during a full, successful discard", async () => {
    localDBMocks.entityGetAssetRecordsByProject.mockResolvedValue([{ id: "a1", projectId: "proj-A", productId: "p1", dirty: false }]);
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([
      { id: "r1", assetId: "a1", projectId: "proj-A", dirty: false, data: { stepResultsJson: "[]", issuesJson: "[]" } },
    ]);

    await discardProjectFromDevice("proj-A");

    expect(apiMocks.get).not.toHaveBeenCalled();
    expect(apiMocks.post).not.toHaveBeenCalled();
    expect(apiMocks.put).not.toHaveBeenCalled();
    expect(apiMocks.patch).not.toHaveBeenCalled();
    expect(apiMocks.delete).not.toHaveBeenCalled();
  });

  it("also makes zero server calls when the check BLOCKS removal (unsynced changes present)", async () => {
    localDBMocks.pendingGetAll.mockResolvedValue([{ entityId: "r1", url: "/x", opType: "RUN_UPDATE" }]);
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([{ id: "r1", projectId: "proj-A", dirty: false, data: {} }]);

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(false);
    expect(apiMocks.delete).not.toHaveBeenCalled();
    expect(apiMocks.post).not.toHaveBeenCalled();
  });
});

describe("discardProjectFromDevice — blocks when unsafe, matching the eligibility check", () => {
  it("does not delete anything when the project has unsynced changes", async () => {
    localDBMocks.entityGetProjectRecord.mockResolvedValue({ id: "proj-A", dirty: true });

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(false);
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
    expect(localDBMocks.entityDeleteProject).not.toHaveBeenCalled();
    expect(localDBMocks.entityDeleteAsset).not.toHaveBeenCalled();
    expect(localDBMocks.entityDeleteWorkflowRun).not.toHaveBeenCalled();
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalled();
  });
});

// Required test #11
describe("discardProjectFromDevice — exclusive media removal (required test #11)", () => {
  it("deletes a non-shared CAPTURED_MEDIA file and its manifest entry", async () => {
    const run = { id: "r1", assetId: "a1", projectId: "proj-A", dirty: false, data: { stepResultsJson: "[]", issuesJson: "[]" } };
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([run]);
    localDBMocks.storageManifestGetByWorkflowRun.mockResolvedValue([
      manifestEntry({ id: "media-exclusive", path: "offline-media/exclusive.jpg", workflowRunId: "r1", shared: false }),
    ]);

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true);
    expect(mediaStoreMocks.deleteMedia).toHaveBeenCalledWith("offline-media/exclusive.jpg");
    expect(localDBMocks.storageManifestDelete).toHaveBeenCalledWith("media-exclusive");
    expect(result.deleted?.mediaFiles).toBe(1);
  });

  it("also deletes a legacy file referenced only via run JSON, with no manifest entry at all", async () => {
    const stepResultsJson = JSON.stringify([
      { stepId: "s1", values: { serialNo: "offline-media-ref:photo|image%2Fjpeg|offline-media%2Flegacy.jpg" } },
    ]);
    const run = { id: "r1", assetId: "a1", projectId: "proj-A", dirty: false, data: { stepResultsJson, issuesJson: "[]" } };
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([run]);
    // No manifest entries at all — proves the JSON-extraction path independently catches it.

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true);
    expect(mediaStoreMocks.deleteMedia).toHaveBeenCalledWith("offline-media/legacy.jpg");
  });
});

// Required test #9
describe("discardProjectFromDevice — shared config media survives (required test #9)", () => {
  it("does NOT delete a CONFIG_MEDIA entry still referenced by another locally-cached project", async () => {
    const run = { id: "r1", assetId: "a1", projectId: "proj-A", dirty: false, data: { stepResultsJson: "[]", issuesJson: "[]" } };
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([run]);
    const sharedEntry = manifestEntry({
      id: "cfg-media-1", category: "CONFIG_MEDIA", path: "offline-config-media/cfg-1/photo.jpg",
      configId: "cfg-1", shared: true, workflowRunId: undefined,
    });
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedEntry]);
    // Two entries reference cfg-1: this one (proj-A, being discarded) and one belonging to proj-B.
    localDBMocks.storageManifestGetByConfig.mockResolvedValue([
      sharedEntry,
      manifestEntry({ id: "cfg-media-2", category: "CONFIG_MEDIA", configId: "cfg-1", shared: true, projectId: "proj-B" }),
    ]);

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true);
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalledWith(sharedEntry.path);
    expect(localDBMocks.storageManifestDelete).not.toHaveBeenCalledWith("cfg-media-1");
  });

  it("DOES delete a CONFIG_MEDIA entry once reference-counting proves no other project needs it", async () => {
    const run = { id: "r1", assetId: "a1", projectId: "proj-A", dirty: false, data: { stepResultsJson: "[]", issuesJson: "[]" } };
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([run]);
    const sharedEntry = manifestEntry({
      id: "cfg-media-1", category: "CONFIG_MEDIA", path: "offline-config-media/cfg-1/photo.jpg",
      configId: "cfg-1", shared: true,
    });
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedEntry]);
    // Only proj-A's own copy references cfg-1 — nothing else uses it.
    localDBMocks.storageManifestGetByConfig.mockResolvedValue([{ ...sharedEntry, projectId: "proj-A" }]);

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true);
    expect(mediaStoreMocks.deleteMedia).toHaveBeenCalledWith(sharedEntry.path);
    expect(localDBMocks.storageManifestDelete).toHaveBeenCalledWith("cfg-media-1");
  });

  it("keeps a shared entry when reference-counting itself fails (uncertain -> conservative keep)", async () => {
    const run = { id: "r1", assetId: "a1", projectId: "proj-A", dirty: false, data: { stepResultsJson: "[]", issuesJson: "[]" } };
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([run]);
    const sharedEntry = manifestEntry({ id: "cfg-media-1", category: "CONFIG_MEDIA", configId: "cfg-1", shared: true });
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedEntry]);
    localDBMocks.storageManifestGetByConfig.mockRejectedValue(new Error("IDB error"));

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true); // the project itself still discards fine
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalledWith(sharedEntry.path); // but the shared item is kept
  });
});

// Required test #10
describe("discardProjectFromDevice — shared document survives (required test #10)", () => {
  it("does NOT delete a DOCUMENT entry still linked from another project's asset", async () => {
    const run = { id: "r1", assetId: "a1", projectId: "proj-A", dirty: false, data: { stepResultsJson: "[]", issuesJson: "[]" } };
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([run]);
    const sharedDoc = manifestEntry({
      id: "doc-media-1", category: "DOCUMENT", path: "offline-media/doc-1.pdf", documentId: "doc-1", shared: true,
    });
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedDoc]);
    localDBMocks.storageManifestGetByDocument.mockResolvedValue([
      sharedDoc,
      manifestEntry({ id: "doc-media-2", category: "DOCUMENT", documentId: "doc-1", shared: true, projectId: "proj-C" }),
    ]);

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true);
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalledWith(sharedDoc.path);
    expect(localDBMocks.storageManifestDelete).not.toHaveBeenCalledWith("doc-media-1");
  });
});

describe("discardProjectFromDevice — malformed run JSON is handled conservatively (required test #14)", () => {
  it("does not throw and still removes the project even when a run's JSON is corrupted", async () => {
    const run = { id: "r1", assetId: "a1", projectId: "proj-A", dirty: false, data: { stepResultsJson: "[not valid json", issuesJson: undefined } };
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([run]);

    await expect(discardProjectFromDevice("proj-A")).resolves.toMatchObject({ removed: true });
    // No path was guessed/deleted from the malformed JSON.
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalled();
  });
});

// Required test #15
describe("discardProjectFromDevice — does not alter another project's offline readiness (required test #15)", () => {
  it("only deletes entities/media belonging to the discarded project; project B's ids never appear in any delete call", async () => {
    const runA = { id: "run-A", assetId: "asset-A", projectId: "proj-A", dirty: false, data: { stepResultsJson: "[]", issuesJson: "[]" } };
    localDBMocks.entityGetAssetRecordsByProject.mockImplementation(async (projectId: string) =>
      projectId === "proj-A" ? [{ id: "asset-A", projectId: "proj-A", productId: "p1", dirty: false }] : [],
    );
    localDBMocks.entityGetWorkflowRunRecordsByProject.mockImplementation(async (projectId: string) =>
      projectId === "proj-A" ? [runA] : [],
    );
    localDBMocks.storageManifestGetByWorkflowRun.mockImplementation(async (runId: string) =>
      runId === "run-A" ? [manifestEntry({ id: "media-A", path: "offline-media/a.jpg", workflowRunId: "run-A", shared: false })] : [],
    );

    await discardProjectFromDevice("proj-A");

    expect(localDBMocks.entityDeleteAsset).toHaveBeenCalledWith("asset-A");
    expect(localDBMocks.entityDeleteAsset).not.toHaveBeenCalledWith(expect.stringContaining("proj-B"));
    expect(localDBMocks.entityDeleteWorkflowRun).toHaveBeenCalledWith("run-A");
    expect(localDBMocks.entityDeleteWorkflowRun).not.toHaveBeenCalledWith("run-B");
    expect(localDBMocks.entityDeleteProject).toHaveBeenCalledWith("proj-A");
    expect(localDBMocks.entityDeleteProject).not.toHaveBeenCalledWith("proj-B");
    expect(mediaStoreMocks.deleteMedia).toHaveBeenCalledWith("offline-media/a.jpg");
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalledWith(expect.stringContaining("proj-B"));
  });
});
