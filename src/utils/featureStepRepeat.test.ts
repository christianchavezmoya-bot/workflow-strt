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

  // WF-7 Acceptance Scenario 6: a real 3-unit generated feature (Junction Box x3) — each unit
  // must resolve to itself exactly once in the runner's step sequence, never entering the legacy
  // repeatCounts/__iter__ expansion path, while a legacy repeatable step from the SAME workflow
  // keeps repeating exactly as before (the guard is per-step, not global).
  it("Junction Box 1/2/3 each execute exactly once; a legacy repeatable step in the same workflow still repeats — Scenario 6", () => {
    const JB_FEATURE_ID = "feat-junction-box";
    const JB_FEATURE: TestFeature = { id: JB_FEATURE_ID, name: "Junction Box" };
    const JB_SEL: FeatureSelection = { featureId: JB_FEATURE_ID, included: true, activeCount: 3 };

    const junctionBoxUnits = [1, 2, 3].map((unit) => baseStep({
      id: `gen-jb-unit-${unit}`,
      title: `Junction Box ${unit} — Installation`,
      stepOrigin: "feature-generated",
      generatorKey: `feature:${JB_FEATURE_ID}:unit:${unit}:installation`,
      stepFeatureId: JB_FEATURE_ID,
      stepUnitIndex: unit,
      captureFields: [{ id: `f-jb-${unit}`, key: "serialNo", label: "Serial Number", type: "text", required: true, featureId: JB_FEATURE_ID }],
    }));

    const legacyStep = baseStep({
      id: "legacy-repeatable",
      title: "Legacy Repeatable Step",
      inputs: [{ id: "i-legacy", type: "text", label: "Unit", required: true, featureId: FEATURE_ID }],
    });

    const workflowSteps = [...junctionBoxUnits, legacyStep];
    const featureSelections = [JB_SEL, SEL];
    const productFeatures = [JB_FEATURE, FEATURE];

    // Mirrors WorkOrderRunner's own getEffectiveStepId derivation exactly (isFeatureRepeatable ->
    // repeatCount -> __iter__ suffix only when repeatCount > 0): each Junction Box unit step must
    // resolve to its OWN id, unsuffixed, meaning it renders/executes exactly once as itself.
    for (const unitStep of junctionBoxUnits) {
      const context = getFeatureLinkContext(unitStep, featureSelections, productFeatures);
      const isFeatureRepeatable = !!context?.feature;
      expect(isFeatureRepeatable).toBe(false);
      const repeatCount = isFeatureRepeatable ? 1 : 0; // even if repeatCounts had a stale entry, guarded to 0
      const effectiveStepId = repeatCount > 0 ? `${unitStep.id}__iter__0` : unitStep.id;
      expect(effectiveStepId).toBe(unitStep.id);
    }
    // All three resolve to distinct ids — three separate executions, not one repeated three times.
    expect(new Set(junctionBoxUnits.map((s) => s.id)).size).toBe(3);

    // The legacy step in the SAME workflow is unaffected by the guard — still repeatable.
    const legacyContext = getFeatureLinkContext(legacyStep, featureSelections, productFeatures);
    expect(legacyContext?.feature.id).toBe(FEATURE_ID);
  });
});
