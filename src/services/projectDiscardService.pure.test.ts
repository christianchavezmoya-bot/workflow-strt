import { describe, expect, it } from "vitest";
import { evaluateProjectDiscardEligibility, type ProjectDiscardInputs } from "./projectDiscardService";

function baseInputs(partial: Partial<ProjectDiscardInputs> = {}): ProjectDiscardInputs {
  return {
    projectId: "proj-1",
    projectRecord: { id: "proj-1", dirty: false },
    assets: [],
    workflowRuns: [],
    issues: [],
    pendingActions: [],
    droppedActions: [],
    ...partial,
  };
}

// Required test #4
describe("evaluateProjectDiscardEligibility — clean project (required test #4)", () => {
  it("a project with no dirty records, pending actions, or dropped actions is SAFE_TO_REMOVE", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        assets: [{ id: "a1", dirty: false }],
        workflowRuns: [{ id: "r1", dirty: false }],
        issues: [{ id: "i1", dirty: false }],
      }),
    );
    expect(result.eligibility).toBe("SAFE_TO_REMOVE");
    expect(result.blockers).toEqual({
      workflowChanges: 0, photosVideosPending: 0, issuesPending: 0,
      timeTrackingPending: 0, failedSyncOperations: 0, otherPendingOperations: 0,
    });
    expect(result.message).toMatch(/no unsynced changes/i);
  });
});

// Required test #5
describe("evaluateProjectDiscardEligibility — pending_action blocks (required test #5)", () => {
  it("a pending_actions row matching a project's run entityId blocks removal", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        workflowRuns: [{ id: "run-1", dirty: false }],
        pendingActions: [{ entityId: "run-1", url: "/asset-workflow-runs/run-1", opType: "RUN_UPDATE" }],
      }),
    );
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
    expect(result.blockers.workflowChanges).toBe(1);
  });

  it("a pending_actions row matched only via URL substring (no exact entityId match) still blocks — matches the existing syncQueue fuzzy-match convention", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        workflowRuns: [{ id: "run-xyz", dirty: false }],
        pendingActions: [{ entityId: "unrelated-id", url: "/asset-workflow-runs/run-xyz/issues", opType: "ISSUE_UPDATE" }],
      }),
    );
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
    expect(result.blockers.issuesPending).toBe(1);
  });

  it("a pending_actions row for a DIFFERENT project's entity does not block this project", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        workflowRuns: [{ id: "run-1", dirty: false }],
        pendingActions: [{ entityId: "run-OTHER-PROJECT", url: "/asset-workflow-runs/run-OTHER-PROJECT", opType: "RUN_UPDATE" }],
      }),
    );
    expect(result.eligibility).toBe("SAFE_TO_REMOVE");
  });
});

// Required test #6
describe("evaluateProjectDiscardEligibility — dropped_action alone blocks (required test #6)", () => {
  it("a dropped_actions row with NO matching pending_actions row still blocks removal", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        workflowRuns: [{ id: "run-1", dirty: false }],
        pendingActions: [], // deliberately empty — proves this isn't caught by the pending check
        droppedActions: [{ entityId: "run-1", opType: "RUN_COMPLETE" }],
      }),
    );
    expect(result.eligibility).toBe("DROPPED_SYNC_ACTIONS");
    expect(result.blockers.failedSyncOperations).toBe(1);
    expect(result.message).toMatch(/failed sync operation/);
  });

  it("DROPPED_SYNC_ACTIONS takes priority over UNSYNCED_CHANGES when both are present", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        workflowRuns: [{ id: "run-1", dirty: true }],
        droppedActions: [{ entityId: "run-1", opType: "RUN_COMPLETE" }],
      }),
    );
    expect(result.eligibility).toBe("DROPPED_SYNC_ACTIONS");
  });
});

// Required test #7
describe("evaluateProjectDiscardEligibility — dirty entity with no queue action (required test #7)", () => {
  it("a dirty asset with zero pending_actions and zero dropped_actions still blocks removal", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({ assets: [{ id: "a1", dirty: true }] }),
    );
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
    expect(result.blockers.workflowChanges).toBe(1); // dirty assets counted in workflowChanges
  });

  it("a dirty issue with no queue action blocks removal", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({ issues: [{ id: "i1", dirty: true }] }),
    );
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
    expect(result.blockers.issuesPending).toBe(1);
  });

  it("a dirty PROJECT record itself (not just its children) blocks removal", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({ projectRecord: { id: "proj-1", dirty: true } }),
    );
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
  });

  it("a missing project record (null) is treated as not-dirty on its own — absence is not a blocker by itself", () => {
    const result = evaluateProjectDiscardEligibility(baseInputs({ projectRecord: null }));
    expect(result.eligibility).toBe("SAFE_TO_REMOVE");
  });
});

// Required test #8
describe("evaluateProjectDiscardEligibility — pending media blocks (required test #8)", () => {
  it("a pending STEP_MEDIA_UPLOAD op blocks removal and is counted as photosVideosPending", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        workflowRuns: [{ id: "run-1", dirty: false }],
        pendingActions: [{ entityId: "run-1", url: "/asset-workflow-runs/run-1/step-media", opType: "STEP_MEDIA_UPLOAD" }],
      }),
    );
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
    expect(result.blockers.photosVideosPending).toBe(1);
  });

  it("a pending MEDIA_UPLOAD op also blocks removal", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        workflowRuns: [{ id: "run-1", dirty: false }],
        pendingActions: [{ entityId: "run-1", url: "/x", opType: "MEDIA_UPLOAD" }],
      }),
    );
    expect(result.blockers.photosVideosPending).toBe(1);
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
  });
});

describe("evaluateProjectDiscardEligibility — time tracking and other operations", () => {
  it("a pending TIME_ENTRY op blocks removal and is counted separately from workflow changes", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        workflowRuns: [{ id: "run-1", dirty: false }],
        pendingActions: [{ entityId: "run-1", url: "/x", opType: "TIME_ENTRY" }],
      }),
    );
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
    expect(result.blockers.timeTrackingPending).toBe(1);
    expect(result.blockers.workflowChanges).toBe(0);
  });

  it("an unrecognized opType is still counted (otherPendingOperations), never silently dropped", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        assets: [{ id: "a1", dirty: false }],
        pendingActions: [{ entityId: "a1", url: "/x", opType: "ASSET_UPDATE" }],
      }),
    );
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
    expect(result.blockers.otherPendingOperations).toBe(1);
  });

  it("a pending action with NO opType at all is still counted, not silently ignored", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        assets: [{ id: "a1", dirty: false }],
        pendingActions: [{ entityId: "a1", url: "/x", opType: undefined }],
      }),
    );
    expect(result.eligibility).toBe("UNSYNCED_CHANGES");
    expect(result.blockers.otherPendingOperations).toBe(1);
  });
});

describe("evaluateProjectDiscardEligibility — message building", () => {
  it("builds a human-readable summary with counts, matching the owner-specified example shape", () => {
    const result = evaluateProjectDiscardEligibility(
      baseInputs({
        workflowRuns: [{ id: "r1", dirty: true }, { id: "r2", dirty: true }, { id: "r3", dirty: true }],
        issues: [{ id: "i1", dirty: true }],
        pendingActions: [
          { entityId: "r1", url: "/x", opType: "STEP_MEDIA_UPLOAD" },
          { entityId: "r1", url: "/x", opType: "STEP_MEDIA_UPLOAD" },
          { entityId: "r1", url: "/x", opType: "STEP_MEDIA_UPLOAD" },
          { entityId: "r1", url: "/x", opType: "STEP_MEDIA_UPLOAD" },
        ],
        droppedActions: [
          { entityId: "r2", opType: "RUN_COMPLETE" },
          { entityId: "r2", opType: "SIGNATURE_SUBMIT" },
        ],
      }),
    );
    expect(result.message).toContain("3 workflow changes");
    expect(result.message).toContain("4 photos/videos");
    expect(result.message).toContain("1 issue");
    expect(result.message).toContain("2 failed sync operations");
    expect(result.eligibility).toBe("DROPPED_SYNC_ACTIONS");
  });
});
