import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./offlineStore", () => ({
  default: {
    saveCache: vi.fn().mockResolvedValue(undefined),
    getCache: vi.fn(),
  },
}));

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

import offlineStore from "./offlineStore";
import { isMobileNativePlatform } from "../utils/platform";
import {
  getLastFlushPassDiagnostic,
  recordFlushPassEnd,
  recordFlushPassStart,
  resetFlushPassDiagnosticsForTests,
  type FlushPassDiagnostic,
} from "./flushPassDiagnostics";

const CACHE_KEY = "last-flush-pass-diagnostic";

function lastSaved(): FlushPassDiagnostic {
  const calls = vi.mocked(offlineStore.saveCache).mock.calls;
  return calls[calls.length - 1][1] as FlushPassDiagnostic;
}

const passStart = {
  canAttemptSyncFlush: true,
  serverReachable: true,
  hasNetworkSignal: true,
  circuitOpen: false,
  circuitOpenUntilMs: 0,
  circuitFailureCount: 0,
  dueCount: 3,
  due: [
    { id: "a1", opType: "RUN_CREATE", entityId: "run-1", entityType: "workflow-run", status: "pending" as const },
    { id: "a2", opType: "RUN_COMPLETE", entityId: "run-1", entityType: "workflow-run", status: "pending" as const },
    { id: "a3", opType: "SIGNATURE_SUBMIT", entityId: "run-1", entityType: "workflow-run", status: "pending" as const },
  ],
};

describe("flushPassDiagnostics", () => {
  beforeEach(() => {
    resetFlushPassDiagnosticsForTests();
    vi.mocked(offlineStore.saveCache).mockClear().mockResolvedValue(undefined);
    vi.mocked(offlineStore.getCache).mockReset();
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
  });

  // Required test #4
  it("records the due actions in the order the pass will replay them", async () => {
    await recordFlushPassStart(passStart);

    const saved = lastSaved();
    expect(offlineStore.saveCache).toHaveBeenCalledWith(CACHE_KEY, expect.anything());
    expect(saved.dueCount).toBe(3);
    expect(saved.due.map((d) => d.id)).toEqual(["a1", "a2", "a3"]);
    expect(saved.due[1]).toEqual({
      id: "a2",
      opType: "RUN_COMPLETE",
      entityId: "run-1",
      entityType: "workflow-run",
      status: "pending",
    });
    expect(saved.timestamp).toBeTruthy();
    expect(saved.serverReachable).toBe(true);
    expect(saved.circuitOpen).toBe(false);
  });

  // Required test #5
  it("records an early network stop with the action it stopped at and why", async () => {
    await recordFlushPassStart(passStart);
    await recordFlushPassEnd({
      attemptedCount: 2,
      syncedCount: 1,
      stoppedEarly: true,
      stoppedAtActionId: "a2",
      stoppedReason: "NETWORK_ERROR_BROKE_LOOP:RUN_COMPLETE",
    });

    const saved = lastSaved();
    expect(saved.stoppedEarly).toBe(true);
    expect(saved.stoppedAtActionId).toBe("a2");
    expect(saved.stoppedReason).toBe("NETWORK_ERROR_BROKE_LOOP:RUN_COMPLETE");
    expect(saved.attemptedCount).toBe(2);
    expect(saved.syncedCount).toBe(1);
    // The start-of-pass context is preserved in the same record.
    expect(saved.due.map((d) => d.id)).toEqual(["a1", "a2", "a3"]);
  });

  // Required test #6
  it("records attempted and synced counts for a pass that completed normally", async () => {
    await recordFlushPassStart(passStart);
    await recordFlushPassEnd({ attemptedCount: 3, syncedCount: 3, stoppedEarly: false });

    const saved = lastSaved();
    expect(saved.attemptedCount).toBe(3);
    expect(saved.syncedCount).toBe(3);
    expect(saved.stoppedEarly).toBe(false);
    expect(saved.stoppedAtActionId).toBeUndefined();
    expect(saved.stoppedReason).toBeUndefined();
  });

  it("overwrites rather than accumulating — only the most recent pass is kept", async () => {
    await recordFlushPassStart({ ...passStart, dueCount: 1, due: [passStart.due[0]] });
    await recordFlushPassEnd({ attemptedCount: 1, syncedCount: 1 });
    await recordFlushPassStart(passStart);
    await recordFlushPassEnd({ attemptedCount: 3, syncedCount: 2 });

    // Every write targets the same single key — never an appended list.
    for (const [key, value] of vi.mocked(offlineStore.saveCache).mock.calls) {
      expect(key).toBe(CACHE_KEY);
      expect(Array.isArray(value)).toBe(false);
    }
    expect(lastSaved().attemptedCount).toBe(3);
  });

  it("ignores an end call with no pass in flight", async () => {
    await recordFlushPassEnd({ attemptedCount: 9, syncedCount: 9 });
    expect(offlineStore.saveCache).not.toHaveBeenCalled();
  });

  it("never throws when the diagnostic write fails, so the flush pass is unaffected", async () => {
    vi.mocked(offlineStore.saveCache).mockRejectedValue(new Error("quota exceeded"));
    await expect(recordFlushPassStart(passStart)).resolves.toBeUndefined();
    await expect(recordFlushPassEnd({ attemptedCount: 1, syncedCount: 0 })).resolves.toBeUndefined();
  });

  it("is a native-only diagnostic — web does not read or write it", async () => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(false);
    await recordFlushPassStart(passStart);
    await recordFlushPassEnd({ attemptedCount: 1, syncedCount: 1 });
    expect(offlineStore.saveCache).not.toHaveBeenCalled();
    expect(await getLastFlushPassDiagnostic()).toBeNull();
  });

  it("reads back the persisted snapshot on native", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue({ ...passStart, timestamp: "2026-01-01T00:00:00.000Z" });
    const read = await getLastFlushPassDiagnostic();
    expect(read?.dueCount).toBe(3);
  });

  it("returns null rather than throwing when the snapshot cannot be read", async () => {
    vi.mocked(offlineStore.getCache).mockRejectedValue(new Error("db closed"));
    expect(await getLastFlushPassDiagnostic()).toBeNull();
  });
});
