import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRunGeneration } from "./runGeneration";
import { runWithWatchdog, type WatchdogOutcome } from "./runWithWatchdog";

describe("runWithWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // A. successful task
  it("resolves normally: onSettle fires once with success, generation clears, no timeout", async () => {
    const gen = createRunGeneration();
    const onSettle = vi.fn();
    const onLate = vi.fn();

    runWithWatchdog(gen, async () => "ok", 1000, onSettle, onLate);
    expect(gen.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(0);

    expect(gen.isRunning()).toBe(false);
    expect(onSettle).toHaveBeenCalledTimes(1);
    const [, outcome] = onSettle.mock.calls[0] as [number, WatchdogOutcome<string>];
    expect(outcome).toEqual({ kind: "success", value: "ok" });
    expect(onLate).not.toHaveBeenCalled();
  });

  // B. normal rejection
  it("rejects normally: onSettle fires once with error, generation clears", async () => {
    const gen = createRunGeneration();
    const onSettle = vi.fn();
    const boom = new Error("boom");

    runWithWatchdog(gen, async () => { throw boom; }, 1000, onSettle);
    await vi.advanceTimersByTimeAsync(0);

    expect(gen.isRunning()).toBe(false);
    expect(onSettle).toHaveBeenCalledTimes(1);
    const [, outcome] = onSettle.mock.calls[0] as [number, WatchdogOutcome<unknown>];
    expect(outcome).toEqual({ kind: "error", error: boom });
  });

  // C. task never settles
  it("never-settling task: watchdog fires, generation clears, signal aborts, no second onSettle later", async () => {
    const gen = createRunGeneration();
    const onSettle = vi.fn();
    const captured: { signal: AbortSignal | null } = { signal: null };

    runWithWatchdog(
      gen,
      (signal) => {
        captured.signal = signal;
        return new Promise(() => { /* never resolves or rejects */ });
      },
      1000,
      onSettle,
    );

    expect(gen.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    expect(gen.isRunning()).toBe(false);
    expect(captured.signal?.aborted).toBe(true);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle.mock.calls[0][1]).toEqual({ kind: "timeout" });

    // Advancing further must not produce a second callback — the hung
    // promise really does never settle, so there is nothing more to fire.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  // D. late completion after timeout
  it("late completion after timeout: onLateResult fires, onSettle does not fire again", async () => {
    const gen = createRunGeneration();
    const onSettle = vi.fn();
    const onLate = vi.fn();
    const pending: { resolve: ((value: string) => void) | null } = { resolve: null };

    runWithWatchdog(
      gen,
      () => new Promise<string>((resolve) => { pending.resolve = resolve; }),
      1000,
      onSettle,
      onLate,
    );

    await vi.advanceTimersByTimeAsync(1000); // timeout fires first
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle.mock.calls[0][1]).toEqual({ kind: "timeout" });

    // The original task finally resolves, long after the timeout.
    pending.resolve?.("late data");
    await vi.advanceTimersByTimeAsync(0);

    expect(onSettle).toHaveBeenCalledTimes(1); // still just the timeout call — no second success call
    expect(onLate).toHaveBeenCalledTimes(1);
    expect(onLate.mock.calls[0][1]).toEqual({ kind: "success", value: "late data" });
  });

  // E. second run after timeout — old run cannot interfere
  it("a new run started after a timeout is unaffected by the old run's eventual late result", async () => {
    const gen = createRunGeneration();
    const onSettle = vi.fn();
    const onLate = vi.fn();
    const pending: { resolve: ((value: string) => void) | null } = { resolve: null };

    const oldRunId = runWithWatchdog(
      gen,
      () => new Promise<string>((resolve) => { pending.resolve = resolve; }),
      1000,
      onSettle,
      onLate,
    );
    await vi.advanceTimersByTimeAsync(1000); // old run times out
    expect(gen.isRunning()).toBe(false);

    // A fresh run starts — must be allowed, and must get a new, larger id.
    const newRunId = runWithWatchdog(gen, async () => "fresh", 1000, onSettle, onLate);
    expect(newRunId).toBeGreaterThan(oldRunId);
    expect(gen.isRunning()).toBe(true);

    // The old (already-timed-out) task finally resolves — must not affect the new run.
    pending.resolve?.("stale data");
    await vi.advanceTimersByTimeAsync(0);

    expect(gen.isActive(newRunId)).toBe(false); // the new run itself already resolved and cleared
    expect(gen.isRunning()).toBe(false);

    // onSettle should have fired exactly twice total: old-run timeout, new-run success.
    expect(onSettle).toHaveBeenCalledTimes(2);
    expect(onSettle.mock.calls[0][1]).toEqual({ kind: "timeout" });
    expect(onSettle.mock.calls[1]).toEqual([newRunId, { kind: "success", value: "fresh" }, expect.any(Number)]);

    // The stale old-run result must show up only as a late result, never corrupting the new run.
    expect(onLate).toHaveBeenCalledTimes(1);
    expect(onLate.mock.calls[0]).toEqual([oldRunId, { kind: "success", value: "stale data" }, expect.any(Number)]);
  });

  it("does not allow two runs to be simultaneously active", async () => {
    const gen = createRunGeneration();
    const first = runWithWatchdog(gen, () => new Promise<void>(() => {}), 1000, vi.fn());
    const second = runWithWatchdog(gen, async () => undefined, 1000, vi.fn());
    expect(gen.isActive(first)).toBe(false);
    expect(gen.isActive(second)).toBe(true);
  });
});
