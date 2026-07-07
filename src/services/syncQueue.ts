import {
  calcNextRetryAt,
  getDB,
  type PendingAction,
  type PendingActionMethod,
} from "./localDB";

export type SyncOpType =
  | "RUN_CREATE"
  | "RUN_UPDATE"
  | "RUN_COMPLETE"
  | "STEP_RESULTS"
  | "ISSUE_CREATE"
  | "ISSUE_UPDATE"
  | "ISSUE_CLOSE"
  | "WORK_INSTRUCTION_CREATE"
  | "WORK_INSTRUCTION_UPDATE"
  | "WORK_INSTRUCTION_DELETE"
  | "MEDIA_UPLOAD"
  | "SIGNATURE_SUBMIT"
  | "TIME_ENTRY";

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

export const syncQueue = {
  async enqueue(input: EnqueueSyncOpInput): Promise<SyncQueueOp> {
    const db = await getDB();
    const op: SyncQueueOp = {
      id: crypto.randomUUID(),
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
      dependsOnOpId: input.dependsOnOpId,
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
      createdAt: new Date().toISOString(),
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
