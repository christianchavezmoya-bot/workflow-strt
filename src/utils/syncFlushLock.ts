/** Module-level flag: true while useSyncEngine flush() holds the global lock. */
let flushing = false;

export function setSyncFlushing(active: boolean): void {
  flushing = active;
}

export function isSyncFlushing(): boolean {
  return flushing;
}
