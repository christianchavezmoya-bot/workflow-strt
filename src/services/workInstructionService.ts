import api from "./api";
import type { WorkInstruction, WorkInstructionInput } from "../types/workInstruction";
import syncQueue, { type SyncQueueOp } from "./syncQueue";
import offlineStore from "./offlineStore";
import { isMobileNativePlatform } from "../utils/platform";
import { randomId } from "../utils/randomId";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";
import { webCachedGet, invalidateWebCache, invalidateWebCacheByPrefix } from "./webFreshCache";

// ------------------------------------------------------------------
// DTO shape from backend
// ------------------------------------------------------------------

interface WorkInstructionDto {
  id: string;
  productId: string;
  title: string;
  summary?: string | null;
  stepsJson: string;
  status: string;
  featureValuesJson: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkInstructionRequestBody {
  title: string;
  summary: string | null;
  stepsJson: string;
  status: WorkInstruction["status"];
  featureValuesJson: string;
}

// ------------------------------------------------------------------
// LocalStorage fallback (offline / API unavailable)
// ------------------------------------------------------------------

const LS_KEY = "work_instructions_v1";

function emitWorkInstructionsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("work-instructions:updated"));
  }
}

function lsReadAll(): WorkInstruction[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkInstruction[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.id && item?.productId && item?.title && Array.isArray(item?.steps));
  } catch {
    return [];
  }
}

function lsWriteAll(items: WorkInstruction[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    emitWorkInstructionsUpdated();
  } catch {}
}

function sortByUpdatedAtDesc(items: WorkInstruction[]): WorkInstruction[] {
  return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function upsertLocal(item: WorkInstruction, replaceId?: string): WorkInstruction[] {
  const next = lsReadAll().filter((existing) => existing.id !== item.id && existing.id !== replaceId);
  next.unshift(item);
  const sorted = sortByUpdatedAtDesc(next);
  lsWriteAll(sorted);
  return sorted;
}

function removeLocal(id: string, alternateId?: string): WorkInstruction[] {
  const next = lsReadAll().filter((item) => item.id !== id && item.id !== alternateId);
  lsWriteAll(next);
  return next;
}

function getLocalByEitherId(id: string, alternateId?: string): WorkInstruction | undefined {
  return lsReadAll().find((item) => item.id === id || item.id === alternateId);
}

function isOfflineNetworkError(error: unknown): boolean {
  if (shouldSkipBlockingFetch()) return true;
  if (!error || typeof error !== "object") return !navigator.onLine;
  const candidate = error as { response?: unknown; code?: string; message?: string };
  if (candidate.response) return false;
  return (
    !navigator.onLine ||
    candidate.code === "ECONNABORTED" ||
    candidate.code === "ERR_NETWORK" ||
    candidate.message === "Network Error"
  );
}

function buildRequestBody(input: WorkInstructionInput): WorkInstructionRequestBody {
  return {
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    stepsJson: JSON.stringify(input.steps),
    status: input.status,
    featureValuesJson: JSON.stringify(input.featureValues),
  };
}

function buildLocalWorkInstruction(
  id: string,
  productId: string,
  input: WorkInstructionInput,
  overrides?: Partial<WorkInstruction>,
): WorkInstruction {
  return {
    id,
    productId,
    title: input.title.trim(),
    summary: input.summary?.trim() || undefined,
    steps: input.steps,
    status: input.status,
    featureValues: input.featureValues,
    updatedAt: overrides?.updatedAt ?? new Date().toISOString(),
    dirty: overrides?.dirty ?? false,
    syncError: overrides?.syncError,
  };
}

function matchesWorkInstructionOp(
  op: SyncQueueOp,
  opType: SyncQueueOp["opType"],
  entityId: string,
): boolean {
  return op.entityId === entityId && op.opType === opType;
}

async function findLatestWorkInstructionOp(
  entityId: string,
  opType: SyncQueueOp["opType"],
): Promise<SyncQueueOp | undefined> {
  return (await syncQueue.listByEntityId(entityId))
    .filter((op) => matchesWorkInstructionOp(op, opType, entityId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

// ------------------------------------------------------------------
// DTO → domain model
// ------------------------------------------------------------------

export function fromWorkInstructionDto(dto: WorkInstructionDto): WorkInstruction {
  let steps: string[] = [];
  let featureValues: Record<string, string> = {};
  try { steps = JSON.parse(dto.stepsJson) ?? []; } catch {}
  try { featureValues = JSON.parse(dto.featureValuesJson) ?? {}; } catch {}
  return {
    id: dto.id,
    productId: dto.productId,
    title: dto.title,
    summary: dto.summary ?? undefined,
    steps,
    status: dto.status as WorkInstruction["status"],
    featureValues,
    updatedAt: dto.updatedAt,
    dirty: false,
  };
}

export function saveLocalWorkInstruction(item: WorkInstruction): void {
  upsertLocal(item);
}

export function replaceLocalWorkInstructionId(localId: string, item: WorkInstruction): void {
  upsertLocal(item, localId);
}

export function removeLocalWorkInstruction(id: string, alternateId?: string): void {
  removeLocal(id, alternateId);
}

// ------------------------------------------------------------------
// Service
// ------------------------------------------------------------------

export const workInstructionService = {
  async listByProduct(productId: string): Promise<WorkInstruction[]> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(`/work-instructions/by-product/${productId}`, async () => {
        const res = await api.get<WorkInstructionDto[]>(`/work-instructions/by-product/${productId}`);
        return res.data.map(fromWorkInstructionDto);
      });
    }

    try {
      const res = await api.get<WorkInstructionDto[]>(`/work-instructions/by-product/${productId}`);
      const serverItems = res.data.map(fromWorkInstructionDto);
      const localItems = lsReadAll();
      const dirtyForProduct = localItems.filter((item) => item.productId === productId && item.dirty);
      const queuedDeletes = new Set(
        (await syncQueue.listAll())
          .filter((op) => op.opType === "WORK_INSTRUCTION_DELETE")
          .map((op) => op.entityId)
      );
      const mergedById = new Map<string, WorkInstruction>();
      serverItems
        .filter((item) => !queuedDeletes.has(item.id))
        .forEach((item) => mergedById.set(item.id, item));
      dirtyForProduct.forEach((item) => mergedById.set(item.id, item));
      const merged = sortByUpdatedAtDesc([...mergedById.values()]);
      const others = localItems.filter((item) => item.productId !== productId);
      lsWriteAll([...others, ...merged]);
      return merged;
    } catch {
      return lsReadAll()
        .filter((item) => item.productId === productId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  },

  async create(productId: string, input: WorkInstructionInput): Promise<WorkInstruction> {
    const requestBody = buildRequestBody(input);
    if (!isMobileNativePlatform()) {
      const res = await api.post<WorkInstructionDto>(
        `/work-instructions?productId=${encodeURIComponent(productId)}`,
        requestBody
      );
      invalidateWebCache(`/work-instructions/by-product/${productId}`);
      return fromWorkInstructionDto(res.data);
    }

    try {
      const res = await api.post<WorkInstructionDto>(
        `/work-instructions?productId=${encodeURIComponent(productId)}`,
        requestBody
      );
      const item = fromWorkInstructionDto(res.data);
      saveLocalWorkInstruction(item);
      return item;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const localId = randomId("wi");
      const item = buildLocalWorkInstruction(localId, productId, input, { dirty: true });
      saveLocalWorkInstruction(item);
      await syncQueue.enqueue({
        opType: "WORK_INSTRUCTION_CREATE",
        url: `/work-instructions?productId=${encodeURIComponent(productId)}`,
        method: "POST",
        entityType: "work-instruction",
        entityId: localId,
        body: requestBody,
      });
      return item;
    }
  },

  async update(id: string, input: WorkInstructionInput): Promise<WorkInstruction> {
    const resolvedId = await offlineStore.getMappedId("work-instruction", id) ?? id;
    const requestBody = buildRequestBody(input);
    if (!isMobileNativePlatform()) {
      const res = await api.put<WorkInstructionDto>(`/work-instructions/${resolvedId}`, requestBody);
      invalidateWebCache(`/work-instructions/by-product/${res.data.productId}`);
      return fromWorkInstructionDto(res.data);
    }

    try {
      const res = await api.put<WorkInstructionDto>(`/work-instructions/${resolvedId}`, requestBody);
      const item = fromWorkInstructionDto(res.data);
      removeLocal(id, resolvedId);
      saveLocalWorkInstruction(item);
      return item;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const existing = getLocalByEitherId(id, resolvedId);
      if (!existing) throw new Error("Work instruction not found.");

      const updated = buildLocalWorkInstruction(existing.id, existing.productId, input, {
        updatedAt: new Date().toISOString(),
        dirty: true,
      });
      saveLocalWorkInstruction(updated);

      const createOp = await findLatestWorkInstructionOp(existing.id, "WORK_INSTRUCTION_CREATE");
      if (createOp && createOp.status !== "uploading") {
        await syncQueue.updateQueuedOp(createOp.id, { body: requestBody });
        return updated;
      }

      const queuedUpdate = (await syncQueue.listByEntityId(existing.id))
        .filter((op) => op.opType === "WORK_INSTRUCTION_UPDATE" && op.url === `/work-instructions/${existing.id}`)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (queuedUpdate && queuedUpdate.status !== "uploading") {
        await syncQueue.updateQueuedOp(queuedUpdate.id, { body: requestBody });
        return updated;
      }

      await syncQueue.enqueue({
        opType: "WORK_INSTRUCTION_UPDATE",
        url: `/work-instructions/${existing.id}`,
        method: "PUT",
        entityType: "work-instruction",
        entityId: existing.id,
        body: requestBody,
        dependsOnOpId: createOp?.status === "uploading" ? createOp.id : undefined,
      });
      return updated;
    }
  },

  async remove(id: string): Promise<string> {
    const resolvedId = await offlineStore.getMappedId("work-instruction", id) ?? id;
    if (!isMobileNativePlatform()) {
      await api.delete(`/work-instructions/${resolvedId}`);
      // productId isn't known here — drop every cached product's list rather
      // than risk one staying stale until its TTL naturally expires.
      invalidateWebCacheByPrefix("/work-instructions/by-product/");
      return id;
    }

    try {
      await api.delete(`/work-instructions/${resolvedId}`);
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const pendingOps = (await syncQueue.listByEntityId(id))
        .concat(await syncQueue.listByEntityId(resolvedId))
        .filter((op, index, all) => all.findIndex((candidate) => candidate.id === op.id) === index)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const createOp = await findLatestWorkInstructionOp(id, "WORK_INSTRUCTION_CREATE")
        ?? await findLatestWorkInstructionOp(resolvedId, "WORK_INSTRUCTION_CREATE");

      if (createOp && createOp.status !== "uploading") {
        await Promise.all(pendingOps.map((op) => syncQueue.markDone(op.id)));
        removeLocal(id, resolvedId);
        return id;
      }

      const existingDelete = pendingOps
        .filter((op) => op.opType === "WORK_INSTRUCTION_DELETE")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (existingDelete && existingDelete.status !== "uploading") {
        removeLocal(id, resolvedId);
        return id;
      }

      const blockingPendingOp = [...pendingOps]
        .reverse()
        .find((op) => op.id !== existingDelete?.id && op.status === "uploading");
      const supersededPendingOps = pendingOps.filter((op) =>
        op.id !== existingDelete?.id &&
        op.id !== blockingPendingOp?.id &&
        op.opType !== "WORK_INSTRUCTION_DELETE"
      );
      await Promise.all(supersededPendingOps.map((op) => syncQueue.markDone(op.id)));

      await syncQueue.enqueue({
        opType: "WORK_INSTRUCTION_DELETE",
        url: `/work-instructions/${resolvedId}`,
        method: "DELETE",
        entityType: "work-instruction",
        entityId: resolvedId,
        dependsOnOpId: blockingPendingOp?.id ?? (createOp?.status === "uploading" ? createOp.id : undefined),
      });
      removeLocal(id, resolvedId);
      return id;
    }
    removeLocal(id, resolvedId);
    return id;
  },
};
