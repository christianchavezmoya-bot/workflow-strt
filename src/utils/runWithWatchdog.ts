import type { RunGeneration } from "./runGeneration";

export type WatchdogOutcome<T> =
  | { kind: "success"; value: T }
  | { kind: "error"; error: unknown }
  | { kind: "timeout" };

export type WatchdogSettleHandler<T> = (
  runId: number,
  outcome: WatchdogOutcome<T>,
  durationMs: number,
) => void;

/**
 * Runs `task` under a hard `timeoutMs` ceiling, tracked via `generation`.
 *
 * Guarantees, regardless of whether `task` itself ever settles:
 * - `generation.isRunning()` becomes false within `timeoutMs` (the timeout
 *   ends the generation immediately, synchronously, in its own callback —
 *   it does NOT wait for `task` to actually finish).
 * - `onSettle` fires at most once for this run, and only for the outcome
 *   that "wins": either the timeout, or `task` actually settling while
 *   still the active generation. It never fires twice for the same runId.
 * - If `task` settles *after* the run has already ended (timed out, or
 *   superseded by a later call that reused the same generation), that
 *   result is a "late result": `onSettle` is NOT called for it (so no
 *   caller can accidentally treat stale data as authoritative), and
 *   `onLateResult` fires instead, purely for observability.
 *
 * This is fire-and-forget by design — it returns the new run's id
 * immediately rather than a Promise, because the entire point is that
 * `task` may never resolve.
 *
 * `task` receives an AbortSignal that fires on timeout, for best-effort
 * cancellation, plus this run's own runId (matching the id returned here)
 * so it can stamp any events/logs it emits without a separate handoff.
 * Nothing here assumes the signal actually stops any in-flight work —
 * correctness comes entirely from the generation check above, never from
 * cancellation succeeding.
 */
export function runWithWatchdog<T>(
  generation: RunGeneration,
  task: (signal: AbortSignal, runId: number) => Promise<T>,
  timeoutMs: number,
  onSettle: WatchdogSettleHandler<T>,
  onLateResult?: WatchdogSettleHandler<T>,
): number {
  const runId = generation.start();
  const controller = new AbortController();
  const startedAtMs = Date.now();

  const timer = setTimeout(() => {
    if (!generation.isActive(runId)) return;
    generation.end(runId);
    controller.abort();
    onSettle(runId, { kind: "timeout" }, Date.now() - startedAtMs);
  }, timeoutMs);

  const settle = (outcome: WatchdogOutcome<T>) => {
    clearTimeout(timer);
    const wasActive = generation.isActive(runId);
    generation.end(runId);
    const durationMs = Date.now() - startedAtMs;
    if (wasActive) {
      onSettle(runId, outcome, durationMs);
    } else {
      onLateResult?.(runId, outcome, durationMs);
    }
  };

  task(controller.signal, runId).then(
    (value) => settle({ kind: "success", value }),
    (error: unknown) => settle({ kind: "error", error }),
  );

  return runId;
}
