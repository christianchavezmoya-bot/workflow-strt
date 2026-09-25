/**
 * Queue eligibility diagnostics (observability only).
 *
 * Uses a REAL IndexedDB (fake-indexeddb) rather than mocking localDB, because
 * the whole point of these tests is the *non-mutation* guarantee: that
 * pendingRecordEligibility writes diagnostic fields without touching the
 * sync-behavior fields (status / retries / nextRetryAt). Mocking localDB's own
 * functions would prove nothing about that.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDbHandleForTests,
  getDB,
  pendingAdd,
  pendingRecordEligibility,
  type PendingAction,
} from "./localDB";

function seedAction(overrides: Partial<PendingAction> & { id: string }): Omit<PendingAction, "retries" | "status"> {
  return {
    url: "/asset-workflow-runs/run-1/complete",
    method: "POST",
    body: { stepResultsJson: "[]" },
    entityType: "workflow-run",
    entityId: "run-1",
    optimisticPatch: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    opType: "RUN_COMPLETE",
    ...overrides,
  };
}

async function readAction(id: string): Promise<PendingAction | undefined> {
  const db = await getDB();
  return db.get("pending_actions", id);
}

describe("pendingRecordEligibility", () => {
  beforeEach(async () => {
    __resetDbHandleForTests();
    const db = await getDB();
    await db.clear("pending_actions");
  });

  // Required test #1
  it("records a DEPENDENCY_PENDING skip without modifying status, retries, or nextRetryAt", async () => {
    await pendingAdd(seedAction({ id: "act-1", dependsOnOpId: "dep-1" }));
    // Simulate a queue row mid-backoff so we can prove the retry schedule survives.
    const db = await getDB();
    const seeded = await readAction("act-1");
    await db.put("pending_actions", {
      ...seeded!,
      status: "failed",
      retries: 3,
      nextRetryAt: "2026-01-01T00:10:00.000Z",
    });

    await pendingRecordEligibility("act-1", {
      lastEligible: false,
      lastSkipReason: "DEPENDENCY_PENDING",
      lastDependencyExists: true,
      lastDependencyOpType: "TIME_ENTRY",
      lastDependencyStatus: "pending",
    });

    const after = await readAction("act-1");
    // Diagnostics written...
    expect(after?.lastEligible).toBe(false);
    expect(after?.lastSkipReason).toBe("DEPENDENCY_PENDING");
    expect(after?.lastDependencyExists).toBe(true);
    expect(after?.lastDependencyOpType).toBe("TIME_ENTRY");
    expect(after?.lastDependencyStatus).toBe("pending");
    expect(after?.lastEligibilityCheckAt).toBeTruthy();
    // ...and NOTHING that drives sync behavior was touched.
    expect(after?.status).toBe("failed");
    expect(after?.retries).toBe(3);
    expect(after?.nextRetryAt).toBe("2026-01-01T00:10:00.000Z");
    // The queued work itself is untouched too.
    expect(after?.url).toBe("/asset-workflow-runs/run-1/complete");
    expect(after?.body).toEqual({ stepResultsJson: "[]" });
    expect(after?.dependsOnOpId).toBe("dep-1");
  });

  // Required test #2
  it("marks an action eligible and clears the previous skip reason before a request attempt", async () => {
    await pendingAdd(seedAction({ id: "act-2" }));
    await pendingRecordEligibility("act-2", {
      lastEligible: false,
      lastSkipReason: "BUNDLED_WITH_RUN_COMPLETE",
      lastBundleCandidate: true,
    });
    expect((await readAction("act-2"))?.lastSkipReason).toBe("BUNDLED_WITH_RUN_COMPLETE");

    // This is the call flush() makes immediately before api.request().
    await pendingRecordEligibility("act-2", { lastEligible: true, lastSkipReason: undefined });

    const after = await readAction("act-2");
    expect(after?.lastEligible).toBe(true);
    expect(after?.lastSkipReason).toBeUndefined();
    // Context from the PRIOR decision (BUNDLED_WITH_RUN_COMPLETE) must not survive.
    expect(after?.lastBundleCandidate).toBeUndefined();
    expect(after?.status).toBe("pending");
    expect(after?.retries).toBe(0);
  });

  // Review fix: every eligibility write must represent ONE coherent latest
  // decision — stale context fields from a prior pass's different skip
  // reason must never survive into the next write.
  describe("stale eligibility context is cleared on every write", () => {
    it("DEPENDENCY_PENDING -> eligible clears dependency context", async () => {
      await pendingAdd(seedAction({ id: "act-4" }));
      await pendingRecordEligibility("act-4", {
        lastEligible: false,
        lastSkipReason: "DEPENDENCY_PENDING",
        lastDependencyExists: true,
        lastDependencyOpType: "TIME_ENTRY",
        lastDependencyStatus: "pending",
      });
      const mid = await readAction("act-4");
      expect(mid?.lastDependencyExists).toBe(true);
      expect(mid?.lastDependencyOpType).toBe("TIME_ENTRY");
      expect(mid?.lastDependencyStatus).toBe("pending");

      await pendingRecordEligibility("act-4", { lastEligible: true, lastSkipReason: undefined });

      const after = await readAction("act-4");
      expect(after?.lastEligible).toBe(true);
      expect(after?.lastSkipReason).toBeUndefined();
      expect(after?.lastDependencyExists).toBeUndefined();
      expect(after?.lastDependencyOpType).toBeUndefined();
      expect(after?.lastDependencyStatus).toBeUndefined();
    });

    it("BUNDLED_WITH_RUN_COMPLETE -> MEDIA_MISSING does not leak bundle context into the new reason", async () => {
      await pendingAdd(seedAction({ id: "act-5", opType: "SIGNATURE_SUBMIT" }));
      await pendingRecordEligibility("act-5", {
        lastEligible: false,
        lastSkipReason: "BUNDLED_WITH_RUN_COMPLETE",
        lastBundleCandidate: true,
      });
      const mid = await readAction("act-5");
      expect(mid?.lastBundleCandidate).toBe(true);

      // A later pass skips this same action for an unrelated reason.
      await pendingRecordEligibility("act-5", {
        lastEligible: false,
        lastSkipReason: "MEDIA_MISSING",
      });

      const after = await readAction("act-5");
      expect(after?.lastSkipReason).toBe("MEDIA_MISSING");
      // lastBundleCandidate from the PRIOR reason must not survive — it would
      // misleadingly imply this MEDIA_MISSING skip was also a bundle wait.
      expect(after?.lastBundleCandidate).toBeUndefined();
      expect(after?.lastDependencyExists).toBeUndefined();
    });

    it("DEPENDENCY_DROPPED -> ASSET_CONCURRENCY_CONFLICT does not leak dependency context", async () => {
      await pendingAdd(seedAction({ id: "act-6" }));
      await pendingRecordEligibility("act-6", {
        lastEligible: false,
        lastSkipReason: "DEPENDENCY_DROPPED",
        lastDependencyExists: false,
      });
      await pendingRecordEligibility("act-6", {
        lastEligible: false,
        lastSkipReason: "ASSET_CONCURRENCY_CONFLICT",
      });
      const after = await readAction("act-6");
      expect(after?.lastSkipReason).toBe("ASSET_CONCURRENCY_CONFLICT");
      expect(after?.lastDependencyExists).toBeUndefined();
    });
  });

  it("is safe to call fire-and-forget (not awaited by the caller) — the write still lands", async () => {
    await pendingAdd(seedAction({ id: "act-7" }));
    // This mirrors how useSyncEngine's flush loop calls it: `void pendingRecordEligibility(...)`.
    void pendingRecordEligibility("act-7", { lastEligible: false, lastSkipReason: "MEDIA_MISSING" });
    await vi.waitFor(async () => {
      expect((await readAction("act-7"))?.lastSkipReason).toBe("MEDIA_MISSING");
    });
  });

  // Required test #3
  it("never throws when the diagnostic write cannot be performed, so sync proceeds regardless", async () => {
    // Row does not exist (e.g. removed by a concurrent successful sync).
    await expect(
      pendingRecordEligibility("does-not-exist", { lastEligible: true }),
    ).resolves.toBeUndefined();

    // Underlying store unusable — the helper must swallow it rather than
    // propagate into the flush loop.
    const db = await getDB();
    db.close();
    await expect(
      pendingRecordEligibility("act-3", { lastEligible: false, lastSkipReason: "MEDIA_MISSING" }),
    ).resolves.toBeUndefined();
    __resetDbHandleForTests();
  });

  it("does not resurrect a row that is no longer queued", async () => {
    await pendingRecordEligibility("never-existed", { lastEligible: false, lastSkipReason: "MEDIA_MISSING" });
    const db = await getDB();
    expect(await db.count("pending_actions")).toBe(0);
  });
});
