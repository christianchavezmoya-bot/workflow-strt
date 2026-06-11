/**
 * localDB.ts — IndexedDB persistence layer for offline sync.
 *
 * Stores:
 *   cache            — last known API responses keyed by cacheKey
 *   pending_actions  — write operations queued while offline
 *   sync_meta        — last sync timestamps per entity
 *   projects         — project entity records
 *   assets           — asset entity records
 *   workflow_runs    — workflow run entity records
 *   issues           — issue entity records
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// ── Schema ────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  key: string;           // e.g. "projects", "assets:projectId:abc"
  data: unknown;
  cachedAt: string;      // ISO
}

export type PendingActionMethod = "PATCH" | "POST" | "PUT" | "DELETE";

export interface PendingAction {
  id: string;            // crypto.randomUUID()
  url: string;           // relative API path e.g. /project-assets/abc
  method: PendingActionMethod;
  body: unknown;
  entityType: string;    // "asset" | "project" | "issue" etc — for badge grouping
  entityId: string;      // local id of the record being mutated
  optimisticPatch: Record<string, unknown>; // what we already applied locally
  createdAt: string;     // ISO wall-clock time of the user action
  retries: number;
  lastError?: string;
  status: "pending" | "uploading" | "failed";
  opType?: string;
  serverEntityId?: string;
  dependsOnOpId?: string;
  nextRetryAt?: string;  // ISO timestamp — when to next attempt this action
}

export interface SyncMeta {
  entity: string;        // e.g. "projects", "assets"
  lastSyncAt: string;    // ISO
}

export interface ProjectRecord {
  id: string;
  data: unknown;
  syncedAt: string;
  dirty: boolean;
}

export interface AssetRecord {
  id: string;
  productId: string;
  projectId: string;
  data: unknown;
  syncedAt: string;
  dirty: boolean;
}

export interface WorkflowRunRecord {
  id: string;
  assetId: string;
  projectId: string;
  data: unknown;
  syncedAt: string;
  dirty: boolean;
}

export interface IssueRecord {
  id: string;
  assetId: string;
  projectId: string;
  data: unknown;
  syncedAt: string;
  dirty: boolean;
}

interface CommtracDB extends DBSchema {
  cache: {
    key: string;
    value: CacheEntry;
  };
  pending_actions: {
    key: string;
    value: PendingAction;
    indexes: { by_entity: string };
  };
  sync_meta: {
    key: string;
    value: SyncMeta;
  };
  projects: {
    key: string;
    value: ProjectRecord;
  };
  assets: {
    key: string;
    value: AssetRecord;
    indexes: { by_product: string; by_project: string };
  };
  workflow_runs: {
    key: string;
    value: WorkflowRunRecord;
    indexes: { by_asset: string; by_project: string };
  };
  issues: {
    key: string;
    value: IssueRecord;
    indexes: { by_project: string };
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _db: IDBPDatabase<CommtracDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CommtracDB>> {
  if (_db) return _db;
  _db = await openDB<CommtracDB>("commtrac_offline_v2", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("pending_actions")) {
        const store = db.createObjectStore("pending_actions", { keyPath: "id" });
        store.createIndex("by_entity", "entityType");
      }
      if (!db.objectStoreNames.contains("sync_meta")) {
        db.createObjectStore("sync_meta", { keyPath: "entity" });
      }
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("assets")) {
        const store = db.createObjectStore("assets", { keyPath: "id" });
        store.createIndex("by_product", "productId");
        store.createIndex("by_project", "projectId");
      }
      if (!db.objectStoreNames.contains("workflow_runs")) {
        const store = db.createObjectStore("workflow_runs", { keyPath: "id" });
        store.createIndex("by_asset", "assetId");
        store.createIndex("by_project", "projectId");
      }
      if (!db.objectStoreNames.contains("issues")) {
        const store = db.createObjectStore("issues", { keyPath: "id" });
        store.createIndex("by_project", "projectId");
      }
    },
  });
  return _db;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    const entry = await db.get("cache", key);
    return entry ? (entry.data as T) : null;
  } catch { return null; }
}

export async function cachePut(key: string, data: unknown): Promise<void> {
  try {
    const db = await getDB();
    await db.put("cache", { key, data, cachedAt: new Date().toISOString() });
  } catch { /* quota — ignore */ }
}

export async function cacheGetMeta(key: string): Promise<CacheEntry | null> {
  try {
    const db = await getDB();
    return (await db.get("cache", key)) ?? null;
  } catch { return null; }
}

// ── Pending action helpers ────────────────────────────────────────────────────

export async function pendingAdd(action: Omit<PendingAction, "retries" | "status">): Promise<void> {
  try {
    const db = await getDB();
    await db.put("pending_actions", { ...action, retries: 0, status: "pending" });
    window.dispatchEvent(new Event("sync-pending-changed"));
  } catch { /* ignore */ }
}

export async function pendingGetAll(): Promise<PendingAction[]> {
  try {
    const db = await getDB();
    return await db.getAll("pending_actions");
  } catch { return []; }
}

export async function pendingRemove(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete("pending_actions", id);
    window.dispatchEvent(new Event("sync-pending-changed"));
  } catch { /* ignore */ }
}

export async function pendingMarkError(id: string, error: string): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("pending_actions", id);
    if (item) await db.put("pending_actions", { ...item, retries: item.retries + 1, lastError: error });
  } catch { /* ignore */ }
}

// ── Backoff schedule: 5s, 15s, 30s, 60s, 300s ────────────────────────────────

export function calcNextRetryAt(retryCount: number): string {
  const delays = [5_000, 15_000, 30_000, 60_000, 300_000];
  const delay = delays[Math.min(retryCount, delays.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

/** Get only actions that are due for retry right now (no nextRetryAt, or it has passed). */
export async function pendingGetDue(): Promise<PendingAction[]> {
  try {
    const all = await pendingGetAll();
    const now = new Date();
    return all.filter(a => !a.nextRetryAt || new Date(a.nextRetryAt) <= now);
  } catch { return []; }
}

/** Update the status of a single pending action. */
export async function pendingSetStatus(id: string, status: PendingAction["status"]): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("pending_actions", id);
    if (item) await db.put("pending_actions", { ...item, status });
  } catch { /* ignore */ }
}

/** Get all pending actions for a specific entity (for per-record state). */
export async function pendingGetByEntityId(entityId: string): Promise<PendingAction[]> {
  try {
    const all = await pendingGetAll();
    return all.filter(a => a.entityId === entityId);
  } catch { return []; }
}

const MAX_RETRIES = 20;

/** Increment retries, set lastError, compute nextRetryAt via backoff, mark status = "failed".
 *  Drops the action after MAX_RETRIES to prevent unbounded queue growth. */
export async function pendingMarkRetry(id: string, error: string): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("pending_actions", id);
    if (!item) return;
    const newRetries = item.retries + 1;
    if (newRetries >= MAX_RETRIES) {
      await db.delete("pending_actions", id);
      window.dispatchEvent(new Event("sync-pending-changed"));
      console.warn(`[sync] Action ${id} (${item.opType ?? item.method} ${item.url}) dropped after ${MAX_RETRIES} retries.`, item);
      return;
    }
    await db.put("pending_actions", {
      ...item,
      retries: newRetries,
      lastError: error,
      nextRetryAt: calcNextRetryAt(newRetries),
      status: "failed",
    });
    window.dispatchEvent(new Event("sync-pending-changed"));
  } catch { /* ignore */ }
}

export async function pendingCount(): Promise<number> {
  try {
    const db = await getDB();
    return await db.count("pending_actions");
  } catch { return 0; }
}

// ── Sync meta helpers ─────────────────────────────────────────────────────────

export async function syncMetaSet(entity: string): Promise<void> {
  try {
    const db = await getDB();
    await db.put("sync_meta", { entity, lastSyncAt: new Date().toISOString() });
  } catch { /* ignore */ }
}

export async function syncMetaGet(entity: string): Promise<string | null> {
  try {
    const db = await getDB();
    return (await db.get("sync_meta", entity))?.lastSyncAt ?? null;
  } catch { return null; }
}

// ── Project entity helpers ────────────────────────────────────────────────────

export async function entityPutProject(record: { id: string; data: unknown; dirty?: boolean }): Promise<void> {
  try {
    const db = await getDB();
    await db.put("projects", {
      id: record.id,
      data: record.data,
      syncedAt: new Date().toISOString(),
      dirty: record.dirty ?? false,
    });
  } catch { /* ignore */ }
}

export async function entityPutProjects(records: Array<{ id: string; data: unknown }>): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("projects", "readwrite");
    const now = new Date().toISOString();
    await Promise.all([
      ...records.map((r) => tx.store.put({ id: r.id, data: r.data, syncedAt: now, dirty: false })),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

export async function entityDeleteProject(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete("projects", id);
  } catch { /* ignore */ }
}

/** Remove cached project records whose IDs are not in serverIds, preserving dirty (offline-created) records. */
export async function reconcileProjects(serverIds: string[]): Promise<void> {
  try {
    const db = await getDB();
    const all = await db.getAll("projects");
    const serverSet = new Set(serverIds);
    const tx = db.transaction("projects", "readwrite");
    await Promise.all([
      ...all
        .filter((r) => !serverSet.has(r.id) && !r.dirty)
        .map((r) => tx.store.delete(r.id)),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

export async function entityGetAllProjects(): Promise<unknown[]> {
  try {
    const db = await getDB();
    const all = await db.getAll("projects");
    return all.map((r) => r.data);
  } catch { return []; }
}

// ── Asset entity helpers ──────────────────────────────────────────────────────

export async function entityPutAsset(record: { id: string; productId: string; projectId: string; data: unknown; dirty?: boolean }): Promise<void> {
  try {
    const db = await getDB();
    await db.put("assets", {
      id: record.id,
      productId: record.productId,
      projectId: record.projectId,
      data: record.data,
      syncedAt: new Date().toISOString(),
      dirty: record.dirty ?? false,
    });
  } catch { /* ignore */ }
}

export async function entityGetAsset(id: string): Promise<{ id: string; productId: string; projectId: string; data: unknown } | null> {
  try {
    const db = await getDB();
    return (await db.get("assets", id) as { id: string; productId: string; projectId: string; data: unknown } | undefined) ?? null;
  } catch { return null; }
}

export async function entityPutAssets(records: Array<{ id: string; productId: string; projectId: string; data: unknown }>): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("assets", "readwrite");
    const now = new Date().toISOString();
    await Promise.all([
      ...records.map((r) =>
        tx.store.put({ id: r.id, productId: r.productId, projectId: r.projectId, data: r.data, syncedAt: now, dirty: false })
      ),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

export async function entityDeleteAsset(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete("assets", id);
  } catch { /* ignore */ }
}

export async function entityReplaceAssetsByProduct(
  productId: string,
  records: Array<{ id: string; productId: string; projectId: string; data: unknown }>
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("assets", "readwrite");
    const store = tx.objectStore("assets");
    const index = store.index("by_product");
    const existing = await index.getAll(productId);
    const nextIds = new Set(records.map((record) => record.id));
    const now = new Date().toISOString();

    await Promise.all([
      ...existing
        .filter((record) => !nextIds.has(record.id))
        .map((record) => store.delete(record.id)),
      ...records.map((record) =>
        store.put({
          id: record.id,
          productId: record.productId,
          projectId: record.projectId,
          data: record.data,
          syncedAt: now,
          dirty: false,
        })
      ),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

export async function entityReplaceAssetsByProject(
  projectId: string,
  records: Array<{ id: string; productId: string; projectId: string; data: unknown }>
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("assets", "readwrite");
    const store = tx.objectStore("assets");
    const index = store.index("by_project");
    const existing = await index.getAll(projectId);
    const nextIds = new Set(records.map((record) => record.id));
    const now = new Date().toISOString();

    await Promise.all([
      ...existing
        .filter((record) => !nextIds.has(record.id))
        .map((record) => store.delete(record.id)),
      ...records.map((record) =>
        store.put({
          id: record.id,
          productId: record.productId,
          projectId: record.projectId,
          data: record.data,
          syncedAt: now,
          dirty: false,
        })
      ),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

export async function entityGetAssetsByProduct(productId: string): Promise<unknown[]> {
  try {
    const db = await getDB();
    const records = await db.getAllFromIndex("assets", "by_product", productId);
    return records.map((r) => r.data);
  } catch { return []; }
}

export async function entityGetAssetsByProject(projectId: string): Promise<unknown[]> {
  try {
    const db = await getDB();
    const records = await db.getAllFromIndex("assets", "by_project", projectId);
    return records.map((r) => r.data);
  } catch { return []; }
}

// ── Issue entity helpers ──────────────────────────────────────────────────────

export async function entityPutIssue(record: { id: string; assetId: string; projectId: string; data: unknown; dirty?: boolean }): Promise<void> {
  try {
    const db = await getDB();
    await db.put("issues", {
      id: record.id,
      assetId: record.assetId,
      projectId: record.projectId,
      data: record.data,
      syncedAt: new Date().toISOString(),
      dirty: record.dirty ?? false,
    });
  } catch { /* ignore */ }
}

export async function entityPutIssues(records: Array<{ id: string; assetId: string; projectId: string; data: unknown }>): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("issues", "readwrite");
    const now = new Date().toISOString();
    await Promise.all([
      ...records.map((r) =>
        tx.store.put({ id: r.id, assetId: r.assetId, projectId: r.projectId, data: r.data, syncedAt: now, dirty: false })
      ),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

export async function entityReplaceAllIssues(records: Array<{ id: string; assetId: string; projectId: string; data: unknown }>): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("issues", "readwrite");
    const store = tx.objectStore("issues");
    const existing = await store.getAll();
    const nextIds = new Set(records.map((r) => r.id));
    const now = new Date().toISOString();
    await Promise.all([
      ...existing.filter((r) => !nextIds.has(r.id)).map((r) => store.delete(r.id)),
      ...records.map((r) => store.put({ id: r.id, assetId: r.assetId, projectId: r.projectId, data: r.data, syncedAt: now, dirty: false })),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

export async function entityGetIssuesByProject(projectId: string): Promise<unknown[]> {
  try {
    const db = await getDB();
    const records = await db.getAllFromIndex("issues", "by_project", projectId);
    return records.map((r) => r.data);
  } catch { return []; }
}

export async function entityGetAllIssues(): Promise<unknown[]> {
  try {
    const db = await getDB();
    const all = await db.getAll("issues");
    return all.map((r) => r.data);
  } catch { return []; }
}

// ── Workflow run entity helpers ───────────────────────────────────────────────

export async function entityPutWorkflowRun(record: { id: string; assetId: string; projectId: string; data: unknown; dirty?: boolean }): Promise<void> {
  try {
    const db = await getDB();
    await db.put("workflow_runs", {
      id: record.id,
      assetId: record.assetId,
      projectId: record.projectId,
      data: record.data,
      syncedAt: new Date().toISOString(),
      dirty: record.dirty ?? false,
    });
  } catch { /* ignore */ }
}

export async function entityPutWorkflowRuns(records: Array<{ id: string; assetId: string; projectId: string; data: unknown }>): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("workflow_runs", "readwrite");
    const now = new Date().toISOString();
    await Promise.all([
      ...records.map((r) =>
        tx.store.put({ id: r.id, assetId: r.assetId, projectId: r.projectId, data: r.data, syncedAt: now, dirty: false })
      ),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

export async function entityGetWorkflowRunsByAsset(assetId: string): Promise<unknown[]> {
  try {
    const db = await getDB();
    const records = await db.getAllFromIndex("workflow_runs", "by_asset", assetId);
    return records.map((r) => r.data);
  } catch { return []; }
}

export async function entityGetWorkflowRunsByProject(projectId: string): Promise<unknown[]> {
  try {
    const db = await getDB();
    const records = await db.getAllFromIndex("workflow_runs", "by_project", projectId);
    return records.map((r) => r.data);
  } catch { return []; }
}

export async function entityGetIssue(id: string): Promise<{ data: unknown } | null> {
  try {
    const db = await getDB();
    return (await db.get("issues", id) as { data: unknown } | undefined) ?? null;
  } catch { return null; }
}

export async function entityGetWorkflowRun(id: string): Promise<{ data: unknown } | null> {
  try {
    const db = await getDB();
    return (await db.get("workflow_runs", id) as { data: unknown } | undefined) ?? null;
  } catch { return null; }
}

export async function entityDeleteWorkflowRun(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete("workflow_runs", id);
  } catch { /* ignore */ }
}
