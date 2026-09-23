import { beforeEach, describe, expect, it, vi } from "vitest";

const localDBMocks = vi.hoisted(() => ({
  droppedActionsGetAll: vi.fn().mockResolvedValue([]),
  entityDeleteAsset: vi.fn().mockResolvedValue(undefined),
  entityDeleteProject: vi.fn().mockResolvedValue(undefined),
  entityDeleteWorkflowRun: vi.fn().mockResolvedValue(undefined),
  entityGetAllProjects: vi.fn().mockResolvedValue([]),
  entityGetAssetRecordsByProject: vi.fn().mockResolvedValue([]),
  entityGetAssignmentsByAsset: vi.fn().mockResolvedValue([]),
  entityGetIssueRecordsByProject: vi.fn().mockResolvedValue([]),
  entityGetProjectRecord: vi.fn().mockResolvedValue(null),
  entityGetWorkflowRunRecordsByProject: vi.fn().mockResolvedValue([]),
  entityReplaceIssuesForAsset: vi.fn().mockResolvedValue(undefined),
  pendingGetAll: vi.fn().mockResolvedValue([]),
  storageManifestDelete: vi.fn().mockResolvedValue(undefined),
  storageManifestGetByAsset: vi.fn().mockResolvedValue([]),
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

// Blocker 2 fix: shared-resource reference counting reads the REAL local reference graph via
// these two functions, never storage_manifest sibling rows. Mocked here the same way, so tests
// model actual cached-link data instead of fabricating manifest rows as "proof" of sharing.
const assetDocumentLinkMocks = vi.hoisted(() => ({
  getCachedLinksIndexAssetIds: vi.fn().mockResolvedValue([]),
  getCachedLinksForAsset: vi.fn().mockResolvedValue([]),
}));

vi.mock("./localDB", () => localDBMocks);
vi.mock("./mediaStore", () => ({ default: mediaStoreMocks, mediaStore: mediaStoreMocks }));
vi.mock("./api", () => ({ default: apiMocks, ...apiMocks }));
vi.mock("./assetDocumentLinkService", () => assetDocumentLinkMocks);

import { discardProjectFromDevice } from "./projectDiscardService";

function manifestEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "media-1", category: "CAPTURED_MEDIA", path: "offline-media/x.jpg",
    locationKind: "filesystem", sizeBytes: 100, shared: false, createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A minimal real AssetRecord, shaped like the app's actual cache — `data.productConfigId` is the
 *  genuine field projectDiscardService reads (see ProjectAsset), never a fabricated manifest row. */
function assetRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "asset-1", projectId: "proj-A", productId: "prod-1", dirty: false,
    data: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localDBMocks.droppedActionsGetAll.mockResolvedValue([]);
  localDBMocks.entityDeleteAsset.mockResolvedValue(undefined);
  localDBMocks.entityDeleteProject.mockResolvedValue(undefined);
  localDBMocks.entityDeleteWorkflowRun.mockResolvedValue(undefined);
  localDBMocks.entityGetAllProjects.mockResolvedValue([{ id: "proj-A" }]);
  localDBMocks.entityGetAssetRecordsByProject.mockResolvedValue([]);
  localDBMocks.entityGetAssignmentsByAsset.mockResolvedValue([]);
  localDBMocks.entityGetIssueRecordsByProject.mockResolvedValue([]);
  localDBMocks.entityGetProjectRecord.mockResolvedValue({ id: "proj-A", dirty: false });
  localDBMocks.entityGetWorkflowRunRecordsByProject.mockResolvedValue([]);
  localDBMocks.entityReplaceIssuesForAsset.mockResolvedValue(undefined);
  localDBMocks.pendingGetAll.mockResolvedValue([]);
  localDBMocks.storageManifestGetByAsset.mockResolvedValue([]);
  localDBMocks.storageManifestGetByIssue.mockResolvedValue([]);
  localDBMocks.storageManifestGetByProject.mockResolvedValue([]);
  localDBMocks.storageManifestGetByWorkflowRun.mockResolvedValue([]);
  assetDocumentLinkMocks.getCachedLinksIndexAssetIds.mockResolvedValue([]);
  assetDocumentLinkMocks.getCachedLinksForAsset.mockResolvedValue([]);
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

// Blocker 2 fix — replaces the old required tests #9/#10, which fabricated storage_manifest
// sibling rows (storageManifestGetByConfig/GetByDocument) as "proof" of sharing. Production code
// no longer calls those for reference-counting at all (see projectDiscardService.ts's module doc
// comment on discardProjectFromDevice). These tests instead model the ACTUAL local reference
// graph: other projects' cached assets (productConfigId / workflow_assignments) and cached
// asset-document-link metadata — exactly what isConfigMediaStillReferencedLocally /
// isDocumentStillReferencedLocally read.
describe("discardProjectFromDevice — shared resource reference safety (Blocker 2)", () => {
  // Scenario A: one shared CONFIG_MEDIA manifest row; project A and project B both reference the
  // config (proj-B's asset has a direct productConfigId match). Discard A -> the config media
  // must survive, proven via proj-B's real cached asset data, not a manifest sibling row.
  it("A: keeps shared CONFIG_MEDIA when another locally-cached project's asset still references the config", async () => {
    const sharedEntry = manifestEntry({
      id: "cfg-media-1", category: "CONFIG_MEDIA", path: "offline-config-media/cfg-1/photo.jpg",
      configId: "cfg-1", shared: true,
    });
    const assetA = assetRecord({ id: "asset-A", projectId: "proj-A", productId: "prod-1", data: { productConfigId: "cfg-1" } });
    const assetB = assetRecord({ id: "asset-B", projectId: "proj-B", productId: "prod-2", data: { productConfigId: "cfg-1" } });

    localDBMocks.entityGetAllProjects.mockResolvedValue([{ id: "proj-A" }, { id: "proj-B" }]);
    localDBMocks.entityGetAssetRecordsByProject.mockImplementation(async (projectId: string) =>
      projectId === "proj-A" ? [assetA] : projectId === "proj-B" ? [assetB] : [],
    );
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedEntry]);

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true);
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalledWith(sharedEntry.path);
    expect(localDBMocks.storageManifestDelete).not.toHaveBeenCalledWith("cfg-media-1");
  });

  // Scenario B: one shared DOCUMENT manifest row; assets in project A and project B both link to
  // the document (proj-B's asset has a real cached asset-document link to it). Discard A -> the
  // document must survive, proven via the real cached link index/list, not a manifest sibling row.
  it("B: keeps shared DOCUMENT when another locally-cached project's asset still links to it", async () => {
    const sharedDoc = manifestEntry({
      id: "doc-media-1", category: "DOCUMENT", path: "offline-media/doc-1.pdf", documentId: "doc-1", shared: true,
    });
    const assetA = assetRecord({ id: "asset-A", projectId: "proj-A" });
    const assetB = assetRecord({ id: "asset-B", projectId: "proj-B" });

    localDBMocks.entityGetAllProjects.mockResolvedValue([{ id: "proj-A" }, { id: "proj-B" }]);
    localDBMocks.entityGetAssetRecordsByProject.mockImplementation(async (projectId: string) =>
      projectId === "proj-A" ? [assetA] : projectId === "proj-B" ? [assetB] : [],
    );
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedDoc]);
    // proj-B's asset has an actually-cached link list, and it links to doc-1.
    assetDocumentLinkMocks.getCachedLinksIndexAssetIds.mockResolvedValue(["asset-B"]);
    assetDocumentLinkMocks.getCachedLinksForAsset.mockImplementation(async (assetId: string) =>
      assetId === "asset-B"
        ? [{ id: "link-1", assetId: "asset-B", documentId: "doc-1", attachedAt: "2026-01-01T00:00:00.000Z", document: {} }]
        : [],
    );

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true);
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalledWith(sharedDoc.path);
    expect(localDBMocks.storageManifestDelete).not.toHaveBeenCalledWith("doc-media-1");
  });

  // Scenario C: only project A references the config/document, and the reference graph is
  // complete (every outside asset's link list is cached, none match) -> both may be deleted.
  it("C: deletes CONFIG_MEDIA and DOCUMENT once the complete local reference graph proves zero other references", async () => {
    const sharedConfig = manifestEntry({
      id: "cfg-media-1", category: "CONFIG_MEDIA", path: "offline-config-media/cfg-1/photo.jpg",
      configId: "cfg-1", shared: true,
    });
    const sharedDoc = manifestEntry({
      id: "doc-media-1", category: "DOCUMENT", path: "offline-media/doc-1.pdf", documentId: "doc-1", shared: true,
    });
    const assetA = assetRecord({ id: "asset-A", projectId: "proj-A", productId: "prod-1", data: { productConfigId: "cfg-1" } });
    // proj-B's asset is a different product and does not reference cfg-1, has no workflow
    // assignment pointing at it, and its (cached, complete) link list does not include doc-1.
    const assetB = assetRecord({ id: "asset-B", projectId: "proj-B", productId: "prod-2", data: {} });

    localDBMocks.entityGetAllProjects.mockResolvedValue([{ id: "proj-A" }, { id: "proj-B" }]);
    localDBMocks.entityGetAssetRecordsByProject.mockImplementation(async (projectId: string) =>
      projectId === "proj-A" ? [assetA] : projectId === "proj-B" ? [assetB] : [],
    );
    localDBMocks.entityGetAssignmentsByAsset.mockResolvedValue([]); // no assignment references cfg-1 either
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedConfig, sharedDoc]);
    assetDocumentLinkMocks.getCachedLinksIndexAssetIds.mockResolvedValue(["asset-B"]); // complete graph
    assetDocumentLinkMocks.getCachedLinksForAsset.mockResolvedValue([]); // asset-B links to nothing

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true);
    expect(mediaStoreMocks.deleteMedia).toHaveBeenCalledWith(sharedConfig.path);
    expect(localDBMocks.storageManifestDelete).toHaveBeenCalledWith("cfg-media-1");
    expect(mediaStoreMocks.deleteMedia).toHaveBeenCalledWith(sharedDoc.path);
    expect(localDBMocks.storageManifestDelete).toHaveBeenCalledWith("doc-media-1");
  });

  // Scenario D: reference lookup throws / is incomplete -> shared item survives, in each of the
  // three distinct ways the graph can fail to prove zero references.
  it("D1: keeps a shared CONFIG_MEDIA entry when enumerating outside projects throws", async () => {
    const sharedEntry = manifestEntry({ id: "cfg-media-1", category: "CONFIG_MEDIA", configId: "cfg-1", shared: true });
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedEntry]);
    localDBMocks.entityGetAllProjects.mockRejectedValue(new Error("IDB error"));

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true); // the project itself still discards fine
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalledWith(sharedEntry.path); // shared item kept
    expect(localDBMocks.storageManifestDelete).not.toHaveBeenCalledWith("cfg-media-1");
  });

  it("D2: keeps a shared CONFIG_MEDIA entry when a per-asset assignment lookup throws", async () => {
    const sharedEntry = manifestEntry({ id: "cfg-media-1", category: "CONFIG_MEDIA", configId: "cfg-1", shared: true });
    const assetB = assetRecord({ id: "asset-B", projectId: "proj-B", productId: "prod-2", data: {} });
    localDBMocks.entityGetAllProjects.mockResolvedValue([{ id: "proj-A" }, { id: "proj-B" }]);
    localDBMocks.entityGetAssetRecordsByProject.mockImplementation(async (projectId: string) =>
      projectId === "proj-B" ? [assetB] : [],
    );
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedEntry]);
    localDBMocks.entityGetAssignmentsByAsset.mockRejectedValue(new Error("IDB error"));

    const result = await discardProjectFromDevice("proj-A");

    expect(result.removed).toBe(true);
    expect(mediaStoreMocks.deleteMedia).not.toHaveBeenCalledWith(sharedEntry.path);
  });

  it("D3: keeps a shared DOCUMENT entry when the outside reference graph is incomplete (an outside asset was never cached)", async () => {
    const sharedDoc = manifestEntry({ id: "doc-media-1", category: "DOCUMENT", documentId: "doc-1", shared: true });
    const assetB = assetRecord({ id: "asset-B", projectId: "proj-B" });
    localDBMocks.entityGetAllProjects.mockResolvedValue([{ id: "proj-A" }, { id: "proj-B" }]);
    localDBMocks.entityGetAssetRecordsByProject.mockImplementation(async (projectId: string) =>
      projectId === "proj-B" ? [assetB] : [],
    );
    localDBMocks.storageManifestGetByProject.mockResolvedValue([sharedDoc]);
    // asset-B's link list was never fetched/cached -> its absence proves nothing; graph incomplete.
    assetDocumentLinkMocks.getCachedLinksIndexAssetIds.mockResolvedValue([]);

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
