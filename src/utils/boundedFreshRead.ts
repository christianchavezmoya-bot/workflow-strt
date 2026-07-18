import { getServerReachable, shouldSkipBlockingFetch } from "../services/connectivityMonitor";

/**
 * How long an "authoritative" native read may block the UI before we give up
 * waiting and serve the local cache instead.
 *
 * Deliberately far below API_DEFAULT_TIMEOUT_MS (10 s, in api.ts, which must not
 * be touched): a healthy server answers these calls in well under a second, so
 * this only ever trips on a degraded link.
 */
export const BOUNDED_FRESH_TIMEOUT_MS = 2_500;

/**
 * Shorter budget for when the health monitor has positively flagged the server
 * unreachable. We still *attempt* the call — that is what lets the app notice
 * the server is back (a success dispatches `api-server-reachable`, which clears
 * the flag immediately instead of waiting up to 30 s for the next ping) — but we
 * refuse to make the user pay for it.
 */
export const BOUNDED_FRESH_PROBE_MS = 1_200;

/**
 * Read authoritative data without ever hanging the phone on a bad link.
 *
 * The problem this solves: "serve the cache" and "await the network" are both
 * wrong on their own. Cache-first silently makes decisions from stale data
 * (which is what broke opening workflows online). Await-always makes a phone on
 * site wifi-with-no-internet block for the full 10 s API timeout on every read.
 *
 * So: start the fresh read, but only wait a bounded slice of time for it. If it
 * wins, the caller gets authoritative data. If the clock wins, the caller gets
 * the cache immediately and the in-flight request is left running so it still
 * warms the cache (and still signals reachability) when it eventually lands.
 *
 * Truly-offline devices never reach the network at all — they short-circuit to
 * the cache, exactly as before.
 */
export async function boundedFreshRead<T>(
  fresh: () => Promise<T>,
  cached: () => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  // Device-level offline (radio off / manual offline mode): cache is the source
  // of truth and there is nothing to wait for.
  if (shouldSkipBlockingFetch()) {
    return await cached();
  }

  const timeoutMs = options?.timeoutMs
    ?? (getServerReachable() === false ? BOUNDED_FRESH_PROBE_MS : BOUNDED_FRESH_TIMEOUT_MS);

  // NOTE: the fresh promise is intentionally NOT cancelled when the timer wins.
  // Letting it finish is what keeps the cache warm and lets a recovering server
  // be detected. Attach a catch so a later rejection can't surface as an
  // unhandled promise rejection.
  const freshPromise = fresh();
  freshPromise.catch(() => { /* handled via the race result below */ });

  let timer: ReturnType<typeof setTimeout> | undefined;

  type Outcome<V> = { kind: "fresh"; value: V } | { kind: "fallback" };

  const freshOutcome: Promise<Outcome<T>> = freshPromise
    .then((value) => ({ kind: "fresh" as const, value }))
    .catch(() => ({ kind: "fallback" as const }));

  const timeoutOutcome: Promise<Outcome<T>> = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: "fallback" }), timeoutMs);
  });

  try {
    const outcome = await Promise.race([freshOutcome, timeoutOutcome]);
    if (outcome.kind === "fresh") return outcome.value;
    return await cached();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
