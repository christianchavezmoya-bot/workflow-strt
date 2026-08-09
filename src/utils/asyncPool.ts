/** Run an async task over items with a bounded concurrency pool. */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        await fn(items[index]);
      } catch {
        // Individual failures are non-fatal for background refresh batches.
      }
    }
  });
  await Promise.all(workers);
}
