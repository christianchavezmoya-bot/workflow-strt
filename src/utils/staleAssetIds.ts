/**
 * Session guard for native GET /project-assets/{id} 404s.
 *
 * After a staging DB reset or project re-seed, IndexedDB can still reference asset
 * ids that no longer exist on the server. Each background refresh used to fire
 * another doomed GET (~400–600 ms, or a full 10 s timeout) and clutter the phone
 * debug panel. Mark once, purge local row, skip repeats for the rest of the session.
 */

const knownMissingAssetIds = new Set<string>();

export function isKnownMissingAssetId(id: string): boolean {
  return knownMissingAssetIds.has(id);
}

export function markKnownMissingAssetId(id: string): void {
  if (id) knownMissingAssetIds.add(id);
}

/** Valid ids from a fresh list sync — allow re-fetch if the asset reappears on server. */
export function reconcileKnownMissingAssetIds(validIds: Iterable<string>): void {
  const valid = new Set(validIds);
  for (const id of knownMissingAssetIds) {
    if (valid.has(id)) knownMissingAssetIds.delete(id);
  }
}

/** Test hook */
export function resetKnownMissingAssetIdsForTests(): void {
  knownMissingAssetIds.clear();
}
