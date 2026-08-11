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
  id: string;            // randomId() at creation time
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
  idempotencyKey?: string;
  nextRetryAt?: string;  // ISO timestamp — when to next attempt this action
  // Conflict detection fields
  snapshotUpdatedAt?: string;  // entity's updatedAt at queue time
  conflictDetected?: boolean;  // true when server refreshed a newer version after we queued
  conflictHttpStatus?: number;
  conflictMessage?: string;
  conflictKind?: "concurrency" | "business_rule";
  // Last failed flush attempt (diagnostics only — does not affect sync behavior)
  lastAttemptAt?: string;
  lastDurationMs?: number;
  lastPayloadBytes?: number;
  lastStepResultsBytes?: number;
  lastPhotoCount?: number;
  lastRequestMethod?: string;
  lastRequestUrl?: string;
  lastMappedRunId?: string;
  lastIsOfflineRunId?: boolean;
  lastTimeoutMs?: number;
  lastHttpStatus?: number;
  lastErrorCode?: string;
  lastServerReachable?: boolean;
  lastConnectivity?: string;
  lastOpType?: string;
  lastApiHost?: string;
}

/** A sync action that permanently failed after exhausting all retries. */
export interface DroppedAction {
  id: string;
  opType: string;
  entityType: string;
  entityId: string;
  lastError?: string;
  createdAt: string;
  droppedAt: string; // ISO wall-clock time the action was permanently dropped
  /** Present on drops after this field was added — enough to re-queue manually. */
  url?: string;
  method?: PendingActionMethod;
  body?: unknown;
  optimisticPatch?: Record<string, unknown>;
}

// ── Cache age thresholds ──────────────────────────────────────────────────────
export const CACHE_SOFT_LIMIT_MS = 4  * 60 * 60 * 1000;  // 4 h  — show warning
export const CACHE_HARD_LIMIT_MS = 24 * 60 * 60 * 1000;  // 24 h — force re-fetch banner

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

/** Workflow assignment cached for offline start of not-yet-opened workflows. */
export interface WorkflowAssignmentRecord {
  id: string;
  assetId: string;
  data: unknown;
  syncedAt: string;
}

/** Feature (global/product) cached for offline workflow step rendering. */
export interface FeatureRecord {
  id: string;
  productId: string;
  data: unknown;
  syncedAt: string;
}

/** Small shared reference datasets (users, workflow types, brand settings). */
export interface ReferenceDataRecord {
  key: string;            // e.g. "users" | "workflow_types" | "brand_settings"
  data: unknown;
  syncedAt: string;
}

/** Tracks a workflow-config media asset downloaded to the device filesystem. */
export interface ConfigMediaRecord {
  id: string;             // `${configId}:${mediaId}`
  configId: string;
  mediaId: string;
  remoteUrl: string;
  localPath: string;      // Capacitor Filesystem path
  mimeType?: string;
  syncedAt: string;
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
  dropped_actions: {
    key: string;
    value: DroppedAction;
  };
  workflow_assignments: {
    key: string;
    value: WorkflowAssignmentRecord;
    indexes: { by_asset: string };
  };
  features: {
    key: string;
    value: FeatureRecord;
    indexes: { by_product: string };
  };
  reference_data: {
    key: string;
    value: ReferenceDataRecord;
  };
  config_media: {
    key: string;
    value: ConfigMediaRecord;
    indexes: { by_config: string };
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _db: IDBPDatabase<CommtracDB> | null = null;
let _dbOpenPerfStarted = false;

export async function getDB(): Promise<IDBPDatabase<CommtracDB>> {
  if (_db) return _db;

  let endDbOpenPerf: (() => void) | undefined;
  if (!_dbOpenPerfStarted && typeof window !== "undefined") {
    _dbOpenPerfStarted = true;
    const { markOfflinePerf } = await import("../utils/offlinePerf");
    markOfflinePerf("local_database_open_start");
    const start = Date.now();
    endDbOpenPerf = () => {
      markOfflinePerf("local_database_open_end");
      if (import.meta.env.DEV) {
        console.debug(`[offline-perf] local_database_open: ${Date.now() - start}ms`);
      }
    };
  }

  // v2 (schema version 2) adds offline-bootstrap stores: workflow_assignments,
  // features, reference_data, config_media. The upgrade is additive and
  // idempotent so existing v1 databases migrate without data loss.
  _db = await openDB<CommtracDB>("commtrac_offline_v2", 2, {
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
      if (!db.objectStoreNames.contains("dropped_actions")) {
        db.createObjectStore("dropped_actions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("workflow_assignments")) {
        const store = db.createObjectStore("workflow_assignments", { keyPath: "id" });
        store.createIndex("by_asset", "assetId");
      }
      if (!db.objectStoreNames.contains("features")) {
        const store = db.createObjectStore("features", { keyPath: "id" });
        store.createIndex("by_product", "productId");
      }
      if (!db.objectStoreNames.contains("reference_data")) {
        db.createObjectStore("reference_data", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("config_media")) {
        const store = db.createObjectStore("config_media", { keyPath: "id" });
        store.createIndex("by_config", "configId");
      }
    },
  });
  endDbOpenPerf?.();
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

// ── Backoff schedule with jitter: 5s → 15s → 30s → 60s → 5m → 15m → 30m ─────

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 300_000, 900_000, 1_800_000];

function jitterMs(baseMs: number): number {
  const jitter = Math.floor(baseMs * 0.15 * Math.random());
  return baseMs + jitter;
}

export function calcNextRetryAt(retryCount: number): string {
  const delay = RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + jitterMs(delay)).toISOString();
}

/** Clear backoff schedules and stale "uploading" locks so reconnect can flush immediately. */
export async function pendingResetRetrySchedule(): Promise<void> {
  try {
    const db = await getDB();
    const all = await pendingGetAll();
    await Promise.all(
      all
        .filter((item) => item.status === "failed" || item.status === "uploading" || item.nextRetryAt)
        .map((item) => db.put("pending_actions", {
          ...item,
          status: "pending",
          nextRetryAt: undefined,
        })),
    );
    window.dispatchEvent(new Event("sync-pending-changed"));
  } catch {
    // ignore
  }
}

/** Reset actions left in "uploading" if a flush pass aborts mid-flight. */
export async function pendingResetStaleUploading(): Promise<void> {
  try {
    const db = await getDB();
    const all = await pendingGetAll();
    const stale = all.filter((item) => item.status === "uploading");
    if (stale.length === 0) return;
    await Promise.all(
      stale.map((item) => db.put("pending_actions", { ...item, status: "pending" as const })),
    );
    window.dispatchEvent(new Event("sync-pending-changed"));
  } catch {
    // ignore
  }
}

/** Get only actions that are due for retry right now (no nextRetryAt, or it has passed). */
export async function pendingGetDue(): Promise<PendingAction[]> {
  try {
    const all = await pendingGetAll();
    const now = new Date();
    return all
      .filter(a => !a.nextRetryAt || new Date(a.nextRetryAt) <= now)
      // Replay in the order the user performed the actions. IndexedDB getAll()
      // returns by primary-key order, NOT createdAt order, so without this sort a
      // stacked offline sequence (e.g. RUN_UPDATE -> RUN_COMPLETE -> SIGNATURE_SUBMIT)
      // could flush out of order and break dependent ops.
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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

/** Reset one queued action for an immediate retry (clears backoff + conflict flags). */
export async function pendingRetryNow(id: string): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("pending_actions", id);
    if (!item) return;
    await db.put("pending_actions", {
      ...item,
      status: "pending",
      nextRetryAt: undefined,
      conflictDetected: undefined,
      conflictHttpStatus: undefined,
      conflictMessage: undefined,
      conflictKind: undefined,
    });
    window.dispatchEvent(new Event("sync-pending-changed"));
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
 *  Drops the action after MAX_RETRIES to prevent unbounded queue growth,
 *  persisting it to `dropped_actions` so it survives reload and can be
 *  displayed app-wide rather than only in Sync Center at the moment it drops. */
export async function pendingMarkRetry(
  id: string,
  error: string,
  diagnostics?: Partial<Pick<PendingAction,
    | "lastAttemptAt"
    | "lastDurationMs"
    | "lastPayloadBytes"
    | "lastStepResultsBytes"
    | "lastPhotoCount"
    | "lastRequestMethod"
    | "lastRequestUrl"
    | "lastMappedRunId"
    | "lastIsOfflineRunId"
    | "lastTimeoutMs"
    | "lastHttpStatus"
    | "lastErrorCode"
    | "lastServerReachable"
    | "lastConnectivity"
    | "lastOpType"
    | "lastApiHost"
  >>,
): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("pending_actions", id);
    if (!item) return;
    const newRetries = item.retries + 1;
    if (newRetries >= MAX_RETRIES) {
      // Persist to dropped_actions before deleting from pending_actions
      const dropped: DroppedAction = {
        id: item.id,
        opType: item.opType ?? item.method,
        entityType: item.entityType,
        entityId: item.entityId,
        lastError: error || item.lastError,
        createdAt: item.createdAt,
        droppedAt: new Date().toISOString(),
        url: item.url,
        method: item.method,
        body: item.body,
        optimisticPatch: item.optimisticPatch,
      };
      await db.put("dropped_actions", dropped);
      await db.delete("pending_actions", id);
      window.dispatchEvent(new Event("sync-pending-changed"));
      window.dispatchEvent(new CustomEvent("sync-action-dropped", {
        detail: dropped,
      }));
      return;
    }
    await db.put("pending_actions", {
      ...item,
      ...diagnostics,
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

// ── Dropped-action helpers ─────────────────────────────────────────────────────

/** Retrieve all permanently-dropped sync actions (persisted across reloads). */
export async function droppedActionsGetAll(): Promise<DroppedAction[]> {
  try {
    const db = await getDB();
    return await db.getAll("dropped_actions");
  } catch { return []; }
}

/** Dismiss (remove) a single dropped action after the user has acknowledged it. */
export async function droppedActionDismiss(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete("dropped_actions", id);
    window.dispatchEvent(new Event("sync-pending-changed"));
  } catch { /* ignore */ }
}

/** Dismiss all dropped actions at once. */
export async function droppedActionsDismissAll(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear("dropped_actions");
    window.dispatchEvent(new Event("sync-pending-changed"));
  } catch { /* ignore */ }
}

/** Move a dropped action back into the pending queue for another sync attempt. */
export async function droppedActionRequeue(id: string): Promise<boolean> {
  try {
    const db = await getDB();
    const dropped = await db.get("dropped_actions", id);
    if (!dropped?.url || !dropped.method) return false;
    const pending: PendingAction = {
      id: dropped.id,
      url: dropped.url,
      method: dropped.method,
      body: dropped.body,
      entityType: dropped.entityType,
      entityId: dropped.entityId,
      optimisticPatch: dropped.optimisticPatch ?? {},
      createdAt: dropped.createdAt,
      retries: 0,
      status: "pending",
      opType: dropped.opType,
    };
    await db.put("pending_actions", pending);
    await db.delete("dropped_actions", id);
    window.dispatchEvent(new Event("sync-pending-changed"));
    return true;
  } catch {
    return false;
  }
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
    const existing = await db.get("assets", record.id) as { syncedAt?: string } | undefined;
    const dirty = record.dirty ?? false;
    await db.put("assets", {
      id: record.id,
      productId: record.productId,
      projectId: record.projectId,
      data: record.data,
      // Local optimistic writes must not bump syncedAt — that causes false upload conflicts.
      syncedAt: dirty && existing?.syncedAt ? existing.syncedAt : new Date().toISOString(),
      dirty,
    });
  } catch { /* ignore */ }
}

export async function entityGetAsset(id: string): Promise<{ id: string; productId: string; projectId: string; data: unknown; dirty?: boolean } | null> {
  try {
    const db = await getDB();
    return (await db.get("assets", id) as { id: string; productId: string; projectId: string; data: unknown; dirty?: boolean } | undefined) ?? null;
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
    // Preserve locally-dirty (optimistic, not-yet-synced) rows: a background
    // revalidation must NOT clobber an offline edit before its queued write
    // flushes, or the change appears to "revert" on reconnect.
    const dirtyIds = new Set(existing.filter((r) => r.dirty).map((r) => r.id));
    const now = new Date().toISOString();

    await Promise.all([
      ...existing
        .filter((record) => !nextIds.has(record.id) && !record.dirty)
        .map((record) => store.delete(record.id)),
      ...records
        .filter((record) => !dirtyIds.has(record.id))
        .map((record) =>
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
    // Preserve locally-dirty (optimistic, not-yet-synced) rows: a background
    // revalidation must NOT clobber an offline edit before its queued write
    // flushes, or the change appears to "revert" on reconnect.
    const dirtyIds = new Set(existing.filter((r) => r.dirty).map((r) => r.id));
    const now = new Date().toISOString();

    await Promise.all([
      ...existing
        .filter((record) => !nextIds.has(record.id) && !record.dirty)
        .map((record) => store.delete(record.id)),
      ...records
        .filter((record) => !dirtyIds.has(record.id))
        .map((record) =>
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

export async function entityGetAllAssets(): Promise<unknown[]> {
  try {
    const db = await getDB();
    const records = await db.getAll("assets");
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

/**
 * Replace the locally-stored open issues for ONE asset, removing any
 * previously-stored issue for that asset that is no longer open.
 *
 * This exists because entityPutIssues() only ever calls put() — it never
 * deletes anything. A caller that derives "currently open issues" from an
 * asset/run's issuesJson and calls entityPutIssues() with that list will
 * correctly add/update open issues, but a just-resolved issue's old record
 * is never removed, since it simply isn't present in the new list. That
 * stale record then sits in IndexedDB indefinitely and keeps showing up
 * everywhere this store is read from (e.g. Issues Board), especially
 * offline, where there's no background server sync to eventually correct
 * it via entityReplaceAllIssues.
 *
 * `openRecords` may legitimately be an empty array (every issue for this
 * asset just got resolved) — that's a valid, meaningful input, not a
 * no-op: it means "delete every stored issue for this asset." Callers
 * must NOT skip calling this when openRecords is empty.
 */
export async function entityReplaceIssuesForAsset(
  assetId: string,
  openRecords: Array<{ id: string; assetId: string; projectId: string; data: unknown }>
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("issues", "readwrite");
    const store = tx.objectStore("issues");
    const existingForAsset = (await store.getAll()).filter((r) => r.assetId === assetId);
    const nextIds = new Set(openRecords.map((r) => r.id));
    const now = new Date().toISOString();
    await Promise.all([
      ...existingForAsset.filter((r) => !nextIds.has(r.id)).map((r) => store.delete(r.id)),
      ...openRecords.map((r) => store.put({ id: r.id, assetId: r.assetId, projectId: r.projectId, data: r.data, syncedAt: now, dirty: false })),
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

export async function entityGetAllWorkflowRuns(): Promise<unknown[]> {
  try {
    const db = await getDB();
    const records = await db.getAll("workflow_runs");
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

// ── Cache age helpers ─────────────────────────────────────────────────────────

/**
 * Returns the age in ms of the oldest asset record for the given product or
 * project. Returns Infinity when there are no cached records (forces fetch).
 */
export async function entityGetAssetCacheAgeMs(
  key: string,
  by: "by_product" | "by_project"
): Promise<number> {
  try {
    const db = await getDB();
    const records = await db.getAllFromIndex("assets", by, key);
    if (records.length === 0) return 0; // no cached data ≠ stale data — first login has nothing to warn about
    const oldest = records.reduce(
      (min, r) => (r.syncedAt < min ? r.syncedAt : min),
      records[0].syncedAt
    );
    return Date.now() - new Date(oldest).getTime();
  } catch { return Infinity; }
}

// ── Conflict detection helpers ────────────────────────────────────────────────

/** Mark a pending action as having a detected conflict (server has newer data). */
export async function pendingMarkConflict(
  id: string,
  meta?: {
    conflictHttpStatus?: number;
    conflictMessage?: string;
    conflictKind?: PendingAction["conflictKind"];
  },
): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("pending_actions", id);
    if (item) {
      await db.put("pending_actions", {
        ...item,
        conflictDetected: true,
        status: "failed",
        conflictHttpStatus: meta?.conflictHttpStatus ?? item.conflictHttpStatus,
        conflictMessage: meta?.conflictMessage ?? item.conflictMessage,
        conflictKind: meta?.conflictKind ?? item.conflictKind ?? "concurrency",
      });
      window.dispatchEvent(new Event("sync-pending-changed"));
    }
  } catch { /* ignore */ }
}

/** Clear the conflict flag so the action will be retried on next flush. */
export async function pendingClearConflict(id: string): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("pending_actions", id);
    if (item) {
      await db.put("pending_actions", {
        ...item,
        conflictDetected: false,
        conflictHttpStatus: undefined,
        conflictMessage: undefined,
        conflictKind: undefined,
        status: "pending",
        nextRetryAt: undefined,
        lastError: undefined,
      });
      window.dispatchEvent(new Event("sync-pending-changed"));
    }
  } catch { /* ignore */ }
}

/** Return all pending actions that have a detected conflict. */
export async function pendingGetConflicted(): Promise<PendingAction[]> {
  try {
    const all = await pendingGetAll();
    return all.filter((a) => a.conflictDetected);
  } catch { return []; }
}

// ── Workflow assignment helpers ───────────────────────────────────────────────

export async function entityGetAssignmentsByAsset(assetId: string): Promise<unknown[]> {
  try {
    const db = await getDB();
    const records = await db.getAllFromIndex("workflow_assignments", "by_asset", assetId);
    return records.map((r) => r.data);
  } catch { return []; }
}

/**
 * Replace the cached assignments for ONE asset. An empty array is meaningful
 * ("this asset has no assignments") and deletes any stale cached rows.
 */
export async function entityReplaceAssignmentsByAsset(
  assetId: string,
  records: Array<{ id: string; assetId: string; data: unknown }>
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("workflow_assignments", "readwrite");
    const store = tx.objectStore("workflow_assignments");
    const index = store.index("by_asset");
    const existing = await index.getAll(assetId);
    const nextIds = new Set(records.map((r) => r.id));
    const now = new Date().toISOString();
    await Promise.all([
      ...existing.filter((r) => !nextIds.has(r.id)).map((r) => store.delete(r.id)),
      ...records.map((r) => store.put({ id: r.id, assetId: r.assetId, data: r.data, syncedAt: now })),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

// ── Feature helpers ───────────────────────────────────────────────────────────

export async function entityGetFeaturesByProduct(productId: string): Promise<unknown[]> {
  try {
    const db = await getDB();
    const records = await db.getAllFromIndex("features", "by_product", productId);
    return records.map((r) => r.data);
  } catch { return []; }
}

export async function entityReplaceFeaturesByProduct(
  productId: string,
  records: Array<{ id: string; productId: string; data: unknown }>
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("features", "readwrite");
    const store = tx.objectStore("features");
    const index = store.index("by_product");
    const existing = await index.getAll(productId);
    const nextIds = new Set(records.map((r) => r.id));
    const now = new Date().toISOString();
    await Promise.all([
      ...existing.filter((r) => !nextIds.has(r.id)).map((r) => store.delete(r.id)),
      ...records.map((r) => store.put({ id: r.id, productId: r.productId, data: r.data, syncedAt: now })),
      tx.done,
    ]);
  } catch { /* ignore */ }
}

// ── Reference data helpers ────────────────────────────────────────────────────

export async function referenceDataGet<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    const record = await db.get("reference_data", key);
    return record ? (record.data as T) : null;
  } catch { return null; }
}

export async function referenceDataSet(key: string, data: unknown): Promise<void> {
  try {
    const db = await getDB();
    await db.put("reference_data", { key, data, syncedAt: new Date().toISOString() });
  } catch { /* ignore */ }
}

// ── Config media helpers ──────────────────────────────────────────────────────

export async function configMediaGetByConfig(configId: string): Promise<ConfigMediaRecord[]> {
  try {
    const db = await getDB();
    return await db.getAllFromIndex("config_media", "by_config", configId);
  } catch { return []; }
}

export async function configMediaGet(id: string): Promise<ConfigMediaRecord | null> {
  try {
    const db = await getDB();
    return (await db.get("config_media", id)) ?? null;
  } catch { return null; }
}

export async function configMediaPut(record: Omit<ConfigMediaRecord, "syncedAt">): Promise<void> {
  try {
    const db = await getDB();
    await db.put("config_media", { ...record, syncedAt: new Date().toISOString() });
  } catch { /* ignore */ }
}
