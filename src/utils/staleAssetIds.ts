/**
 * Durable guard for native GET /project-assets/{id} 404s.
 *
 * After a staging DB reset or project re-seed, IndexedDB and the dashboard-workspace
 * snapshot can reference asset ids that no longer exist on the server. Mark on
 * authoritative 404, persist to IndexedDB, and skip repeat GETs across app restarts.
 */

import { isMobileNativePlatform } from "./platform";
import offlineStore from "../services/offlineStore";

const MISSING_IDS_CACHE_KEY = "stale-missing-asset-ids";

const knownMissingAssetIds = new Set<string>();
let hydratePromise: Promise<void> | null = null;
let hydrated = false;

async function persistKnownMissingAssetIds(): Promise<void> {
  if (!isMobileNativePlatform()) return;
  await offlineStore.saveCache(MISSING_IDS_CACHE_KEY, [...knownMissingAssetIds]);
}

/** Load persisted missing ids — call once on native app boot before dashboard prefetch. */
export async function hydrateKnownMissingAssetIds(): Promise<void> {
  if (!isMobileNativePlatform()) {
    hydrated = true;
    return;
  }
  if (hydrated) return;
  if (hydratePromise) {
    await hydratePromise;
    return;
  }
  hydratePromise = (async () => {
    try {
      const stored = await offlineStore.getCache<string[]>(MISSING_IDS_CACHE_KEY);
      if (stored?.length) {
        for (const id of stored) {
          if (id) knownMissingAssetIds.add(id);
        }
      }
    } finally {
      hydrated = true;
      hydratePromise = null;
    }
  })();
  await hydratePromise;
}

/** Read-only snapshot for diagnostics — does not affect the guard's behavior. */
export function getKnownMissingAssetIdsSnapshot(): string[] {
  return [...knownMissingAssetIds];
}

export function isKnownMissingAssetId(id: string): boolean {
  return knownMissingAssetIds.has(id);
}

export function markKnownMissingAssetId(id: string): void {
  if (!id) return;
  knownMissingAssetIds.add(id);
  void persistKnownMissingAssetIds();
}

/** Valid ids from a fresh list sync — allow re-fetch if the asset reappears on server. */
export function reconcileKnownMissingAssetIds(validIds: Iterable<string>): void {
  const valid = new Set(validIds);
  let changed = false;
  for (const id of knownMissingAssetIds) {
    if (valid.has(id)) {
      knownMissingAssetIds.delete(id);
      changed = true;
    }
  }
  if (changed) void persistKnownMissingAssetIds();
}

/** Test hook */
export function resetKnownMissingAssetIdsForTests(): void {
  knownMissingAssetIds.clear();
  hydrated = false;
  hydratePromise = null;
}

/** Test hook — simulate post-hydrate state without IndexedDB */
export function seedKnownMissingAssetIdsForTests(ids: string[]): void {
  for (const id of ids) knownMissingAssetIds.add(id);
  hydrated = true;
}
