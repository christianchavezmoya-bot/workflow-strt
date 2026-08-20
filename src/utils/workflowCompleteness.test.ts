import { describe, expect, it } from "vitest";
import type { StepInput, WorkflowStep } from "../types/workflow";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import {
  countMissingWorkflowItems,
  getMissingWorkflowItems,
  getRunMissingMediaSteps,
  sanitizeMissingMediaFlags,
  splitMissingItemsByGate,
} from "./workflowCompleteness";

const input = (over: Partial<StepInput> & Pick<StepInput, "id" | "type">): StepInput => ({
  label: over.label ?? over.id,
  required: over.required ?? false,
  ...over,
});

const step = (inputs: StepInput[], over: Partial<WorkflowStep> = {}): WorkflowStep => ({
  id: "s1",
  order: 1,
  title: "Step 1",
  description: "",
  overrideInReport: false,
  overrideReportText: "",
  includeDescriptionInReport: true,
  mediaIds: [],
  decisionsEnabled: false,
  decisions: [],
  inputs,
  captureFields: [],
  nextStepId: null,
  ...over,
});

describe("getMissingWorkflowItems — media follows the Required toggle", () => {
  it("reports a required photo that was not captured", () => {
    const missing = getMissingWorkflowItems(
      step([input({ id: "p1", type: "photo", label: "Install photo", required: true })]),
      {},
    );
    expect(missing).toEqual([
      { id: "p1", label: "Install photo", kind: "photo", required: true },
    ]);
  });

  it("ignores an optional photo that was not captured", () => {
    const missing = getMissingWorkflowItems(
      step([input({ id: "p1", type: "photo", label: "Nice-to-have photo", required: false })]),
      {},
    );
    expect(missing).toEqual([]);
  });

  it("ignores an optional video and still reports the required one on the same step", () => {
    const missing = getMissingWorkflowItems(
      step([
        input({ id: "v1", type: "video", label: "Optional walkthrough", required: false }),
        input({ id: "v2", type: "video", label: "Mandatory test run", required: true }),
      ]),
      {},
    );
    expect(missing.map((m) => m.id)).toEqual(["v2"]);
  });

  it("clears a required photo once media is attached", () => {
    const missing = getMissingWorkflowItems(
      step([input({ id: "p1", type: "photo", required: true })]),
      { p1: JSON.stringify(["data:image/png;base64,AAA"]) },
    );
    expect(missing).toEqual([]);
  });

  it("keeps required non-media inputs and required capture fields as missing items", () => {
    const missing = getMissingWorkflowItems(
      step(
        [
          input({ id: "t1", type: "text", label: "Serial", required: true }),
          input({ id: "t2", type: "text", label: "Notes", required: false }),
        ],
        {
          captureFields: [
            { id: "c1", key: "torque", label: "Torque", type: "number", required: true },
            { id: "c2", key: "comment", label: "Comment", type: "text", required: false },
          ],
        },
      ),
      {},
    );
    expect(missing.map((m) => [m.id, m.kind])).toEqual([
      ["t1", "input"],
      ["c1", "capture"],
    ]);
  });
});

describe("splitMissingItemsByGate — what stops the technician", () => {
  it("blocks the next step on required data, warns on required media", () => {
    const missing = getMissingWorkflowItems(
      step(
        [
          input({ id: "t1", type: "text", label: "Serial", required: true }),
          input({ id: "p1", type: "photo", label: "Install photo", required: true }),
          input({ id: "p2", type: "photo", label: "Extra photo", required: false }),
        ],
        { captureFields: [{ id: "c1", key: "torque", label: "Torque", type: "number", required: true }] },
      ),
      {},
    );
    const { blocking, warning } = splitMissingItemsByGate(missing);
    expect(blocking.map((b) => b.id)).toEqual(["t1", "c1"]);
    expect(warning.map((w) => w.id)).toEqual(["p1"]);
  });

  it("has nothing to report when only optional media is empty", () => {
    const missing = getMissingWorkflowItems(
      step([input({ id: "p1", type: "photo", required: false })]),
      {},
    );
    const { blocking, warning } = splitMissingItemsByGate(missing);
    expect(blocking).toEqual([]);
    expect(warning).toEqual([]);
  });
});

describe("countMissingWorkflowItems — run level", () => {
  const run = (steps: WorkflowStep[], results: Array<{ stepId: string; values: Record<string, string> }>) =>
    ({
      workflowSnapshotJson: JSON.stringify({ stepsJson: JSON.stringify(steps) }),
      stepResultsJson: JSON.stringify(results),
      isLocked: false,
    } as unknown as AssetWorkflowRun);

  it("counts only required media across a mixed workflow", () => {
    const steps = [
      step([input({ id: "p1", type: "photo", required: true })], { id: "s1", nextStepId: "s2" }),
      step([input({ id: "p2", type: "photo", required: false })], { id: "s2", order: 2 }),
    ];
    const missing = countMissingWorkflowItems(
      run(steps, [
        { stepId: "s1", values: {} },
        { stepId: "s2", values: {} },
      ]),
    );
    expect(missing).toBe(1);
  });

  it("reports nothing when every step's media is optional", () => {
    const steps = [
      step([input({ id: "p1", type: "photo", required: false })], { id: "s1", nextStepId: "s2" }),
      step([input({ id: "v1", type: "video", required: false })], { id: "s2", order: 2 }),
    ];
    const missing = countMissingWorkflowItems(
      run(steps, [
        { stepId: "s1", values: {} },
        { stepId: "s2", values: {} },
      ]),
    );
    expect(missing).toBe(0);
  });

  it("counts required media on a step that was visited but never saved", () => {
    const steps = [
      step(
        [
          input({ id: "p1", type: "photo", required: true }),
          input({ id: "p2", type: "photo", required: false }),
        ],
        { id: "s1" },
      ),
    ];
    const missing = countMissingWorkflowItems(
      run(steps, [{ stepId: "__nav__", values: { currentStepId: "s1", historyJson: "[]" } }]),
    );
    expect(missing).toBe(1);
  });
});

describe("getRunMissingMediaSteps — required photo/video only", () => {
  const run = (steps: WorkflowStep[], results: Array<{ stepId: string; values: Record<string, string> }>) =>
    ({
      workflowSnapshotJson: JSON.stringify({ stepsJson: JSON.stringify(steps) }),
      stepResultsJson: JSON.stringify(results),
      isLocked: false,
    } as unknown as AssetWorkflowRun);

  it("returns no missing steps when all media inputs are optional", () => {
    const steps = [
      step([input({ id: "p1", type: "photo", required: false })], { id: "s1" }),
      step([input({ id: "v1", type: "video", required: false })], { id: "s2", order: 2 }),
    ];
    const { allRequired, missing } = getRunMissingMediaSteps(
      run(steps, [
        { stepId: "s1", values: {} },
        { stepId: "s2", values: {} },
      ]),
    );
    expect(allRequired).toEqual([]);
    expect(missing).toEqual([]);
  });

  it("counts only required media for dashboard flags", () => {
    const steps = [
      step(
        [
          input({ id: "p1", type: "photo", required: true }),
          input({ id: "p2", type: "photo", required: false }),
        ],
        { id: "s1" },
      ),
    ];
    const { allRequired, missing } = getRunMissingMediaSteps(
      run(steps, [{ stepId: "s1", values: {} }]),
    );
    expect(allRequired).toHaveLength(1);
    expect(allRequired[0]?.inputId).toBe("p1");
    expect(missing).toHaveLength(1);
  });

  it("drops stale flags when optional-only runs are revalidated", () => {
    const steps = [step([input({ id: "p1", type: "photo", required: false })], { id: "s1" })];
    const lockedRun = run(steps, [{ stepId: "s1", values: {} }]);
    const sanitized = sanitizeMissingMediaFlags(
      [{ runId: "run-1", id: "flag-1" }],
      new Map([["run-1", { ...lockedRun, id: "run-1" } as AssetWorkflowRun]]),
    );
    expect(sanitized).toEqual([]);
  });
});
