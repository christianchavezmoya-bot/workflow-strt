/**
 * Guards a list-shaped refresh against a transient/partial result clobbering
 * already-displayed data with an empty (or smaller) snapshot.
 *
 * Concrete motivating case: on native, technicianWorkloadSummary()'s local
 * branch reads a live local cache that the first-login bootstrap pass is
 * still incrementally writing to. Each repo:assignments:updated event fired
 * during that pass (one per asset) triggers a dashboard refresh, so the same
 * in-progress local read can land many times in quick succession, each one
 * a different partial snapshot. Applying every such result unconditionally
 * made the "Technician Workload" panel's content oscillate
 * populated -> empty/partial -> populated purely from the bootstrap writer
 * racing the dashboard reader, not from any real change in the data.
 *
 * `bootstrapping` is the freshness signal that distinguishes a transient
 * empty read from a genuinely authoritative one. The SAFE behavior — keep
 * `previous` — is the default whenever that signal is omitted or true, so a
 * bare call (no third argument) is exactly the simple "never regress to
 * empty" guard. Passing `{ bootstrapping: false }` explicitly is what
 * unlocks trusting an empty `next`:
 * - No signal given, or `bootstrapping: true`: an empty `next` is
 *   untrustworthy (most likely a mid-write partial read) if there is
 *   already good data to show — keep `previous`.
 * - `bootstrapping: false` (explicitly idle/complete): an empty `next` is
 *   trusted and applied — this is what lets a real, permanent empty state
 *   (e.g. every technician's queue genuinely cleared) actually take effect,
 *   instead of being hidden forever behind stale data.
 * - A `previous` that was already empty (nothing has ever loaded, or the
 *   confirmed-empty state above already applied) always adopts `next` —
 *   the very first load, empty or not, is never held back.
 *
 * This never touches *how* or *when* a refresh is triggered — it only
 * decides which of two already-fetched results to keep.
 */
export function preserveLastNonEmpty<T>(
  previous: T[],
  next: T[],
  options?: { bootstrapping?: boolean },
): T[] {
  if (next.length > 0) return next;
  if (previous.length === 0) return next;
  if (options?.bootstrapping === false) return next;
  return previous;
}
