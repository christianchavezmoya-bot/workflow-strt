import { describe, it, expect } from "vitest";
import { getFeatureLinkContext } from "./featureStepRepeat";
import type { WorkflowStep } from "../types/workflow";
import type { FeatureSelection } from "../services/productConfigService";

type TestFeature = { id: string; name: string };

const FEATURE_ID = "feat-1";
const FEATURE: TestFeature = { id: FEATURE_ID, name: "Test Camera" };
const SEL: FeatureSelection = { featureId: FEATURE_ID, included: true, activeCount: 2 };

function baseStep(overrides: Partial<WorkflowStep>): WorkflowStep {
  return {
    id: "step-1",
    order: 1,
    title: "Step",
    description: "",
    overrideInReport: false,
    overrideReportText: "",
    includeDescriptionInReport: true,
    mediaIds: [],
    decisionsEnabled: false,
    decisions: [],
    inputs: [],
    nextStepId: null,
    ...overrides,
  };
}

describe("getFeatureLinkContext (WF-3 runtime-repeat compatibility guard)", () => {
  it("a new feature-generated step with stepUnitIndex = 1 is not runtime-repeatable", () => {
    const step = baseStep({
      id: "gen-unit-1",
      stepOrigin: "feature-generated",
      stepUnitIndex: 1,
      captureFields: [
        { id: "f1", key: "serialNo", label: "Serial Number", type: "text", required: true, featureId: FEATURE_ID },
      ],
    });

    expect(getFeatureLinkContext(step, [SEL], [FEATURE])).toBeNull();
  });

  it("unit 1 and unit 2 each resolve to their own distinct, non-repeatable step (each executes exactly once)", () => {
    const unit1 = baseStep({
      id: "gen-unit-1",
      stepOrigin: "feature-generated",
      stepUnitIndex: 1,
      captureFields: [{ id: "f1", key: "serialNo", label: "Serial Number", type: "text", required: true, featureId: FEATURE_ID }],
    });
    const unit2 = baseStep({
      id: "gen-unit-2",
      stepOrigin: "feature-generated",
      stepUnitIndex: 2,
      captureFields: [{ id: "f2", key: "serialNo", label: "Serial Number", type: "text", required: true, featureId: FEATURE_ID }],
    });

    // Neither is runtime-repeatable (both null) — each is already a standalone, unit-specific
    // step in the workflow's steps array (distinct ids), so each renders/executes exactly once,
    // never expanded via repeatCounts/__iter__ suffixing.
    expect(getFeatureLinkContext(unit1, [SEL], [FEATURE])).toBeNull();
    expect(getFeatureLinkContext(unit2, [SEL], [FEATURE])).toBeNull();
    expect(unit1.id).not.toBe(unit2.id);
  });

  it("a legacy repeatable step without stepOrigin retains the existing runtime repeat behaviour", () => {
    const legacyStep = baseStep({
      id: "legacy-step",
      inputs: [{ id: "i1", type: "text", label: "Unit", required: true, featureId: FEATURE_ID }],
    });

    const context = getFeatureLinkContext(legacyStep, [SEL], [FEATURE]);
    expect(context).not.toBeNull();
    expect(context?.feature.id).toBe(FEATURE_ID);
    expect(context?.sel).toBe(SEL);
  });

  it("a feature-generated step without stepUnitIndex still resolves normally (guard requires both conditions)", () => {
    const step = baseStep({
      stepOrigin: "feature-generated",
      captureFields: [{ id: "f1", key: "serialNo", label: "Serial Number", type: "text", required: true, featureId: FEATURE_ID }],
    });

    expect(getFeatureLinkContext(step, [SEL], [FEATURE])).not.toBeNull();
  });

  it("featureId remains present on capture fields/inputs for reporting and feature resolution, even when the guard suppresses repeatability", () => {
    const step = baseStep({
      stepOrigin: "feature-generated",
      stepUnitIndex: 1,
      captureFields: [{ id: "f1", key: "serialNo", label: "Serial Number", type: "text", required: true, featureId: FEATURE_ID }],
      inputs: [{ id: "i1", type: "number", label: "Actual qty", required: true, featureId: FEATURE_ID }],
    });

    expect(getFeatureLinkContext(step, [SEL], [FEATURE])).toBeNull();
    // The guard only affects runtime-repeat resolution — it must not strip featureId from the
    // step's own fields, which report/feature-name-resolution code depends on independently.
    expect(step.captureFields?.[0].featureId).toBe(FEATURE_ID);
    expect(step.inputs[0].featureId).toBe(FEATURE_ID);
  });
});
