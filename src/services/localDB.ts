/**
 * localDB.ts — IndexedDB persistence layer for offline sync.
 *
 * Stores three object stores:
 *   cache          — last known API responses keyed by cacheKey
 *   pending_actions — write operations queued while offline
 *   sync_meta      — last sync timestamps per entity
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
}

export interface SyncMeta {
  entity: string;        // e.g. "projects", "assets"
  lastSyncAt: string;    // ISO
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
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _db: IDBPDatabase<CommtracDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CommtracDB>> {
  if (_db) return _db;
  _db = await openDB<CommtracDB>("commtrac_offline_v1", 1, {
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

export async function pendingAdd(action: Omit<PendingAction, "retries">): Promise<void> {
  try {
    const db = await getDB();
    await db.put("pending_actions", { ...action, retries: 0 });
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
