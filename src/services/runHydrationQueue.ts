/**
 * Serializes native `/runs-detail` fetches so large jobs do not stampede the
 * server (which caused 10s timeouts and false offline on weak LAN links).
 *
 * One chunk in flight at a time; higher-priority tasks jump the queue.
 */

export const RUN_DETAIL_CHUNK_SIZE = 15;
export const RUN_DETAIL_TIMEOUT_MS = 45_000;

export const RunHydrationPriority = {
  /** Capture table open — visible assets first. */
  urgent: 0,
  /** Active project on the assets page. */
  high: 1,
  /** Background refresh for cached project data. */
  normal: 2,
  /** Deferred / non-visible projects. */
  low: 3,
} as const;

export type RunHydrationPriorityLevel =
  (typeof RunHydrationPriority)[keyof typeof RunHydrationPriority];

type HydrationChunkTask = {
  key: string;
  projectId: string;
  assetIds: string[];
  priority: RunHydrationPriorityLevel;
  done: () => void;
};

type ChunkExecutor = (projectId: string, assetIds: string[]) => Promise<void>;

let executor: ChunkExecutor | null = null;
const pendingKeys = new Set<string>();
const queue: HydrationChunkTask[] = [];
let draining = false;

function chunkItems<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sortQueue(): void {
  queue.sort((a, b) => a.priority - b.priority);
}

/** Register the function that performs one runs-detail chunk (native service). */
export function registerRunHydrationExecutor(fn: ChunkExecutor): void {
  executor = fn;
}

/**
 * Queue chunked runs-detail hydration. Duplicate chunk keys are ignored while
 * pending. Resolves when all chunks queued by this call have finished.
 */
export function enqueueProjectRunHydration(
  projectId: string,
  assetIds: string[],
  priority: RunHydrationPriorityLevel = RunHydrationPriority.normal,
): Promise<void> {
  const ids = [...new Set(assetIds.filter(Boolean))];
  if (ids.length === 0 || !executor) return Promise.resolve();

  const completions: Promise<void>[] = [];

  for (const chunk of chunkItems(ids, RUN_DETAIL_CHUNK_SIZE)) {
    const key = `${projectId}:${chunk.slice().sort().join(",")}`;
    if (pendingKeys.has(key)) continue;
    pendingKeys.add(key);

    let resolveChunk!: () => void;
    completions.push(new Promise<void>((resolve) => { resolveChunk = resolve; }));

    queue.push({
      key,
      projectId,
      assetIds: chunk,
      priority,
      done: () => {
        pendingKeys.delete(key);
        resolveChunk();
      },
    });
  }

  if (completions.length === 0) return Promise.resolve();

  sortQueue();
  void drainQueue();
  return Promise.all(completions).then(() => undefined);
}

/** Re-queue visible assets at urgent priority (capture table). */
export function prioritizeProjectRunHydration(
  projectId: string,
  assetIds: string[],
): Promise<void> {
  return enqueueProjectRunHydration(projectId, assetIds, RunHydrationPriority.urgent);
}

async function drainQueue(): Promise<void> {
  if (draining || !executor) return;
  draining = true;
  try {
    while (queue.length > 0) {
      sortQueue();
      const task = queue.shift()!;
      try {
        await executor(task.projectId, task.assetIds);
      } catch {
        // Executor handles errors; continue with next chunk.
      } finally {
        task.done();
      }
    }
  } finally {
    draining = false;
    if (queue.length > 0) void drainQueue();
  }
}

/** Test helper */
export function _resetRunHydrationQueueForTests(): void {
  executor = null;
  pendingKeys.clear();
  queue.length = 0;
  draining = false;
}
