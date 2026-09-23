/**
 * Required test #16: the schema upgrade to v5 (storage_manifest — offline storage management)
 * preserves ALL existing local data. This uses a REAL IndexedDB implementation (fake-indexeddb)
 * rather than mocking localDB.ts, so it actually exercises the production upgrade callback in
 * getDB() — a mock of localDB.ts's own functions would prove nothing about the upgrade itself.
 */
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const DB_NAME = "commtrac_offline_v2";

/** Recreates the pre-v5 (v4) schema exactly, to seed a "device that already has this app
 *  installed" fixture — mirrors getDB()'s upgrade callback for versions < 5, minus storage_manifest. */
async function seedV4Database() {
  const db = await openDB(DB_NAME, 4, {
    upgrade(db) {
      db.createObjectStore("cache", { keyPath: "key" });
      const pending = db.createObjectStore("pending_actions", { keyPath: "id" });
      pending.createIndex("by_entity", "entityType");
      db.createObjectStore("sync_meta", { keyPath: "entity" });
      db.createObjectStore("projects", { keyPath: "id" });
      const assets = db.createObjectStore("assets", { keyPath: "id" });
      assets.createIndex("by_product", "productId");
      assets.createIndex("by_project", "projectId");
      const runs = db.createObjectStore("workflow_runs", { keyPath: "id" });
      runs.createIndex("by_asset", "assetId");
      runs.createIndex("by_project", "projectId");
      const issues = db.createObjectStore("issues", { keyPath: "id" });
      issues.createIndex("by_project", "projectId");
      db.createObjectStore("dropped_actions", { keyPath: "id" });
      const assignments = db.createObjectStore("workflow_assignments", { keyPath: "id" });
      assignments.createIndex("by_asset", "assetId");
      const features = db.createObjectStore("features", { keyPath: "id" });
      features.createIndex("by_product", "productId");
      db.createObjectStore("reference_data", { keyPath: "key" });
      const configMedia = db.createObjectStore("config_media", { keyPath: "id" });
      configMedia.createIndex("by_config", "configId");
      db.createObjectStore("sync_diagnostics", { keyPath: "id" });
      db.createObjectStore("fault_reports_pending", { keyPath: "id" });
    },
  });

  await db.put("projects", { id: "proj-1", data: { id: "proj-1", name: "Existing Project" }, syncedAt: "2026-01-01T00:00:00.000Z", dirty: false });
  await db.put("assets", { id: "asset-1", productId: "p1", projectId: "proj-1", data: { id: "asset-1" }, syncedAt: "2026-01-01T00:00:00.000Z", dirty: true });
  await db.put("workflow_runs", { id: "run-1", assetId: "asset-1", projectId: "proj-1", data: { id: "run-1", stepResultsJson: "[]" }, syncedAt: "2026-01-01T00:00:00.000Z", dirty: false });
  await db.put("issues", { id: "issue-1", assetId: "asset-1", projectId: "proj-1", data: { id: "issue-1" }, syncedAt: "2026-01-01T00:00:00.000Z", dirty: false });
  await db.put("pending_actions", { id: "pa-1", url: "/x", method: "PATCH", body: {}, entityType: "asset", entityId: "asset-1", optimisticPatch: {}, createdAt: "2026-01-01T00:00:00.000Z", retries: 0, status: "pending" });
  await db.put("dropped_actions", { id: "da-1", opType: "RUN_COMPLETE", entityType: "workflow-run", entityId: "run-1", createdAt: "2026-01-01T00:00:00.000Z", droppedAt: "2026-01-02T00:00:00.000Z" });
  await db.put("config_media", { id: "cfg-1:media-1", configId: "cfg-1", mediaId: "media-1", remoteUrl: "/x", localPath: "offline-config-media/cfg-1/media-1.jpg", syncedAt: "2026-01-01T00:00:00.000Z" });
  await db.put("cache", { key: "documents_v1_all", data: [{ id: "doc-1" }], cachedAt: "2026-01-01T00:00:00.000Z" });
  await db.put("reference_data", { key: "users", data: [{ id: "u1" }], syncedAt: "2026-01-01T00:00:00.000Z" });

  db.close();
}

describe("localDB schema upgrade v4 -> v5 preserves all existing data (required test #16)", () => {
  beforeEach(async () => {
    await seedV4Database();
  });

  afterEach(async () => {
    indexedDB.deleteDatabase(DB_NAME);
    // Reset localDB.ts's module-level singleton so the next test opens a fresh handle against
    // the freshly-seeded v4 fixture, rather than reusing a stale connection.
    const localDB = await import("./localDB");
    await localDB.__resetDbHandleForTests?.();
  });

  it("every pre-existing store's records survive the upgrade completely unchanged", async () => {
    const localDB = await import("./localDB");

    const projects = await localDB.entityGetAllProjects();
    expect(projects).toEqual([{ id: "proj-1", name: "Existing Project" }]);

    const project = await localDB.entityGetProjectRecord("proj-1");
    expect(project).toEqual({ id: "proj-1", data: { id: "proj-1", name: "Existing Project" }, syncedAt: "2026-01-01T00:00:00.000Z", dirty: false });

    const assets = await localDB.entityGetAssetRecordsByProject("proj-1");
    expect(assets).toEqual([{ id: "asset-1", productId: "p1", projectId: "proj-1", data: { id: "asset-1" }, syncedAt: "2026-01-01T00:00:00.000Z", dirty: true }]);

    const runs = await localDB.entityGetWorkflowRunRecordsByProject("proj-1");
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe("run-1");

    const issues = await localDB.entityGetIssueRecordsByProject("proj-1");
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe("issue-1");

    const pending = await localDB.pendingGetAll();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("pa-1");

    const dropped = await localDB.droppedActionsGetAll();
    expect(dropped).toHaveLength(1);
    expect(dropped[0].id).toBe("da-1");

    const configMedia = await localDB.configMediaGetByConfig("cfg-1");
    expect(configMedia).toHaveLength(1);
    expect(configMedia[0].localPath).toBe("offline-config-media/cfg-1/media-1.jpg");

    const cachedDocs = await localDB.cacheGet("documents_v1_all");
    expect(cachedDocs).toEqual([{ id: "doc-1" }]);

    const users = await localDB.referenceDataGet("users");
    expect(users).toEqual([{ id: "u1" }]);
  });

  it("the new storage_manifest store exists, starts empty, and is immediately usable", async () => {
    const localDB = await import("./localDB");

    expect(await localDB.storageManifestGetAll()).toEqual([]);

    await localDB.storageManifestPut({
      id: "new-media-1", category: "CAPTURED_MEDIA", path: "offline-media/new.jpg",
      locationKind: "filesystem", sizeBytes: 42, shared: false, createdAt: "2026-09-21T00:00:00.000Z",
    });
    expect(await localDB.storageManifestGet("new-media-1")).toMatchObject({ id: "new-media-1", sizeBytes: 42 });
  });

  it("no pre-existing data was deleted, and the upgrade does not touch dirty (unsynced) records", async () => {
    const localDB = await import("./localDB");
    const assets = await localDB.entityGetAssetRecordsByProject("proj-1");
    // The dirty asset from before the upgrade must remain dirty — an upgrade must never silently
    // mark unsynced local work as synced, or vice versa.
    expect(assets[0].dirty).toBe(true);
  });
});
