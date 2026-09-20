/**
 * Tracks a monotonically increasing "generation" for a single-flight async
 * operation, so:
 * - a hard timeout can force the active generation to end even when the
 *   underlying work never settles (a native network call that hangs
 *   forever, for example), and
 * - a late result from an ended/superseded generation can be detected and
 *   safely ignored instead of corrupting state from a newer (or no) run.
 *
 * This module only tracks *which* attempt is authoritative — it has no
 * knowledge of what the attempt actually does. See runWithWatchdog.ts for
 * the timeout/abort orchestration built on top of this.
 */
export interface RunGeneration {
  /** Starts a new generation, becoming the active one. Returns its id. */
  start(): number;
  /** True while `runId` is still the current, active generation. */
  isActive(runId: number): boolean;
  /**
   * Ends `runId`'s generation if it is still the active one (idempotent —
   * safe to call more than once, or on an id that was already superseded).
   * Returns true only if it actually ended an active generation.
   */
  end(runId: number): boolean;
  /** True while any generation is active. */
  isRunning(): boolean;
}

export function createRunGeneration(): RunGeneration {
  let counter = 0;
  let activeRunId: number | null = null;

  return {
    start(): number {
      counter += 1;
      activeRunId = counter;
      return activeRunId;
    },
    isActive(runId: number): boolean {
      return activeRunId === runId;
    },
    end(runId: number): boolean {
      if (activeRunId === runId) {
        activeRunId = null;
        return true;
      }
      return false;
    },
    isRunning(): boolean {
      return activeRunId !== null;
    },
  };
}
