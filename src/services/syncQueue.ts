import {
  calcNextRetryAt,
  getDB,
  type PendingAction,
  type PendingActionMethod,
} from "./localDB";
import { randomId } from "../utils/randomId";

export type SyncOpType =
  | "RUN_CREATE"
  | "RUN_UPDATE"
  | "RUN_COMPLETE"
  | "RUN_BUNDLE"
  | "RUN_ABANDON"
  | "STEP_RESULTS"
  | "STEP_MEDIA_UPLOAD"
  | "CAPTURE_CELL"
  | "ISSUE_CREATE"
  | "ISSUE_UPDATE"
  | "ISSUE_CLOSE"
  | "WORK_INSTRUCTION_CREATE"
  | "WORK_INSTRUCTION_UPDATE"
  | "WORK_INSTRUCTION_DELETE"
  | "ASSET_DOCUMENT_LINK_ATTACH"
  | "ASSET_DOCUMENT_LINK_UPLOAD"
  | "ASSET_DOCUMENT_LINK_DETACH"
  | "MEDIA_UPLOAD"
  | "SIGNATURE_SUBMIT"
  | "TIME_ENTRY"
  | "ASSET_UPDATE"
  | "ASSET_DELETE"
  | "WORKFLOW_ASSIGNMENT_CREATE"
  | "WORKFLOW_ASSIGNMENT_DELETE";

export interface SyncQueueOp extends PendingAction {
  opType: SyncOpType;
  serverEntityId?: string;
  dependsOnOpId?: string;
}

export interface EnqueueSyncOpInput {
  opType: SyncOpType;
  url: string;
  method: PendingActionMethod;
  entityType: string;
  entityId: string;
  body?: unknown;
  optimisticPatch?: Record<string, unknown>;
  serverEntityId?: string;
  dependsOnOpId?: string;
  snapshotUpdatedAt?: string;
}

export interface UpdateQueuedOpInput {
  body?: unknown;
  optimisticPatch?: Record<string, unknown>;
  serverEntityId?: string;
  dependsOnOpId?: string;
}

function sortByCreatedAt(a: SyncQueueOp, b: SyncQueueOp): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

async function listAll(): Promise<SyncQueueOp[]> {
  const db = await getDB();
  const all = await db.getAll("pending_actions");
  return (all as SyncQueueOp[]).sort(sortByCreatedAt);
}

/** Exported for unit tests — must distinguish installer vs customer signatures. */
export function buildSyncIdempotencyKey(input: EnqueueSyncOpInput): string {
  const base = `${input.opType}:${input.method}:${input.entityType}:${input.entityId}:${input.url}`;
  if (input.opType === "SIGNATURE_SUBMIT" && input.body && typeof input.body === "object") {
    const role = (input.body as { signerRole?: string }).signerRole;
    if (role) return `${base}:${role}`;
  }
  if (input.opType === "ASSET_DOCUMENT_LINK_ATTACH" && input.body && typeof input.body === "object") {
    const { assetId, documentId } = input.body as { assetId?: string; documentId?: string };
    if (assetId && documentId) {
      return `${input.opType}:${input.method}:${assetId}:${documentId}`;
    }
  }
  if (input.opType === "TIME_ENTRY" && input.body && typeof input.body === "object") {
    // Each time-entry action (start/stop/pause) is a distinct, dated event — the
    // base key alone (opType:method:entityType:entityId:url) is IDENTICAL for every
    // action on the same run, since the action type lives in the body, not the URL.
    // Without this, a second time-tracking action for the same run collapses into
    // the first pending row via the upsert path below instead of creating its own
    // row, which breaks assetWorkflowRunService's dependsOnOpId chaining (it can
    // end up writing a row's own id into its own dependsOnOpId).
    const { action, startedAtUtc } = input.body as { action?: string; startedAtUtc?: string };
    if (action) return `${base}:${action}:${startedAtUtc ?? ""}`;
  }
  return base;
}

export const syncQueue = {
  async enqueue(input: EnqueueSyncOpInput): Promise<SyncQueueOp> {
    const db = await getDB();
    const idempotencyKey = buildSyncIdempotencyKey(input);
    const existing = (await listAll()).find(
      (op) => op.idempotencyKey === idempotencyKey && op.status !== "uploading",
    );
    if (existing) {
      // Invariant: a queued action must never depend on itself. The upsert below can
      // reuse `existing.id` for a logically-new action; if the caller resolved its
      // dependency against that same row (a stale queue snapshot pointing at the row
      // about to be upserted-into), silently drop it rather than persist a self-loop
      // that would deadlock flush() forever.
      const resolvedDependsOnOpId = input.dependsOnOpId ?? existing.dependsOnOpId;
      await db.put("pending_actions", {
        ...existing,
        body: input.body,
        optimisticPatch: input.optimisticPatch ?? existing.optimisticPatch,
      serverEntityId: input.serverEntityId ?? existing.serverEntityId,
      dependsOnOpId: resolvedDependsOnOpId === existing.id ? undefined : resolvedDependsOnOpId,
      snapshotUpdatedAt: input.snapshotUpdatedAt ?? existing.snapshotUpdatedAt,
    });
      window.dispatchEvent(new Event("sync-pending-changed"));
      return existing;
    }

    const newId = randomId();
    const op: SyncQueueOp = {
      id: newId,
      opType: input.opType,
      url: input.url,
      method: input.method,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      optimisticPatch: input.optimisticPatch ?? {},
      createdAt: new Date().toISOString(),
      retries: 0,
      status: "pending",
      serverEntityId: input.serverEntityId,
      dependsOnOpId: input.dependsOnOpId === newId ? undefined : input.dependsOnOpId,
      idempotencyKey,
      snapshotUpdatedAt: input.snapshotUpdatedAt,
    };
    await db.put("pending_actions", op);
    window.dispatchEvent(new Event("sync-pending-changed"));
    return op;
  },

  async listAll(): Promise<SyncQueueOp[]> {
    return await listAll();
  },

  async listQueued(): Promise<SyncQueueOp[]> {
    return (await listAll()).filter((op) => op.status === "pending" || op.status === "failed");
  },

  async listByEntityId(entityId: string): Promise<SyncQueueOp[]> {
    return (await listAll()).filter((op) => op.entityId === entityId);
  },

  async updateQueuedOp(opId: string, updates: UpdateQueuedOpInput): Promise<void> {
    const db = await getDB();
    const op = (await db.get("pending_actions", opId)) as SyncQueueOp | undefined;
    if (!op) return;
    await db.put("pending_actions", {
      ...op,
      body: updates.body ?? op.body,
      optimisticPatch: updates.optimisticPatch ?? op.optimisticPatch,
      serverEntityId: updates.serverEntityId ?? op.serverEntityId,
      dependsOnOpId: updates.dependsOnOpId ?? op.dependsOnOpId,
      // Preserve queue order — coalescing must not bump createdAt ahead of RUN_COMPLETE.
      status: "pending",
      nextRetryAt: undefined,
      lastError: undefined,
    });
    window.dispatchEvent(new Event("sync-pending-changed"));
  },

  async markSyncing(opId: string): Promise<void> {
    const db = await getDB();
    const op = (await db.get("pending_actions", opId)) as SyncQueueOp | undefined;
    if (!op) return;
    await db.put("pending_actions", { ...op, status: "uploading" });
  },

  async markFailed(opId: string, error: string): Promise<void> {
    const db = await getDB();
    const op = (await db.get("pending_actions", opId)) as SyncQueueOp | undefined;
    if (!op) return;
    const retries = op.retries + 1;
    await db.put("pending_actions", {
      ...op,
      retries,
      lastError: error,
      status: "failed",
      nextRetryAt: calcNextRetryAt(retries),
    });
    window.dispatchEvent(new Event("sync-pending-changed"));
  },

  async markDone(opId: string): Promise<void> {
    const db = await getDB();
    await db.delete("pending_actions", opId);
    window.dispatchEvent(new Event("sync-pending-changed"));
  },

  async replaceEntityId(oldEntityId: string, newEntityId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("pending_actions", "readwrite");
    const all = (await tx.store.getAll()) as SyncQueueOp[];
    await Promise.all(
      all
        .filter((op) => op.entityId === oldEntityId)
        .map((op) => tx.store.put({ ...op, entityId: newEntityId }))
    );
    await tx.done;
  },

  async replaceEntityReferences(oldEntityId: string, newEntityId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("pending_actions", "readwrite");
    const all = (await tx.store.getAll()) as SyncQueueOp[];
    await Promise.all(
      all
        .filter((op) => op.entityId === oldEntityId || op.url.includes(oldEntityId) || op.serverEntityId === oldEntityId)
        .map((op) => tx.store.put({
          ...op,
          entityId: op.entityId === oldEntityId ? newEntityId : op.entityId,
          serverEntityId: op.serverEntityId === oldEntityId ? newEntityId : op.serverEntityId,
          url: op.url.split(oldEntityId).join(newEntityId),
        }))
    );
    await tx.done;
    window.dispatchEvent(new Event("sync-pending-changed"));
  },

  async removeByEntityId(entityId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("pending_actions", "readwrite");
    const all = (await tx.store.getAll()) as SyncQueueOp[];
    await Promise.all(
      all
        .filter((op) => op.entityId === entityId || op.url.includes(entityId) || op.serverEntityId === entityId)
        .map((op) => tx.store.delete(op.id))
    );
    await tx.done;
    window.dispatchEvent(new Event("sync-pending-changed"));
  },

  async replaceRunIdReferences(oldRunId: string, newRunId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("pending_actions", "readwrite");
    const all = (await tx.store.getAll()) as SyncQueueOp[];
    await Promise.all(
      all
        .filter((op) => op.entityId === oldRunId || op.url.includes(oldRunId) || op.serverEntityId === oldRunId)
        .map((op) => tx.store.put({
          ...op,
          entityId: op.entityId === oldRunId ? newRunId : op.entityId,
          serverEntityId: op.serverEntityId === oldRunId ? newRunId : op.serverEntityId,
          url: op.url.split(oldRunId).join(newRunId),
        }))
    );
    await tx.done;
    window.dispatchEvent(new Event("sync-pending-changed"));
  },

  async runSequentially(
    processor: (op: SyncQueueOp) => Promise<void>,
  ): Promise<void> {
    const due = (await this.listQueued()).filter((op) => !op.nextRetryAt || new Date(op.nextRetryAt) <= new Date());
    for (const op of due) {
      await this.markSyncing(op.id);
      try {
        await processor(op);
        await this.markDone(op.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.markFailed(op.id, message);
      }
    }
  },
};

export default syncQueue;
