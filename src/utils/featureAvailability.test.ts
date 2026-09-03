import { describe, expect, it } from "vitest";
import { isFeatureAvailableForNewSelection } from "./featureAvailability";
import type { FeatureSelection } from "../services/productConfigService";

const yesFeature = { id: "feat-yes", isInventory: true };
const noFeature = { id: "feat-no", isInventory: false };
const noSelections: FeatureSelection[] = [];

describe("isFeatureAvailableForNewSelection", () => {
  it("a Feature: Yes item is available for new selection with no prior selections", () => {
    expect(isFeatureAvailableForNewSelection(yesFeature, noSelections)).toBe(true);
  });

  it("a Feature: No item is NOT available for new selection with no prior selections", () => {
    expect(isFeatureAvailableForNewSelection(noFeature, noSelections)).toBe(false);
  });

  it("No → Yes: flipping isInventory to true makes it available, independent of selection state", () => {
    const nowYes = { ...noFeature, isInventory: true };
    expect(isFeatureAvailableForNewSelection(nowYes, noSelections)).toBe(true);
  });

  it("Yes → No: flipping isInventory to false removes it from new choices, when not already selected", () => {
    const nowNo = { ...yesFeature, isInventory: false };
    expect(isFeatureAvailableForNewSelection(nowNo, noSelections)).toBe(false);
  });

  it("an existing workflow containing a now-No feature (activeCount > 0) must still show it", () => {
    const selections: FeatureSelection[] = [{ featureId: noFeature.id, included: true, activeCount: 2 }];
    expect(isFeatureAvailableForNewSelection(noFeature, selections)).toBe(true);
  });

  it("an existing workflow containing a now-No feature (included, zero count) must still show it", () => {
    const selections: FeatureSelection[] = [{ featureId: noFeature.id, included: true, activeCount: 0 }];
    expect(isFeatureAvailableForNewSelection(noFeature, selections)).toBe(true);
  });

  it("a No feature with a selection entry that was never actually included/counted stays hidden", () => {
    // productFeatures.map(...) seeds a { included: false, activeCount: 0 } placeholder for
    // every feature — merely having an entry must not itself count as "already selected".
    const selections: FeatureSelection[] = [{ featureId: noFeature.id, included: false, activeCount: 0 }];
    expect(isFeatureAvailableForNewSelection(noFeature, selections)).toBe(false);
  });

  it("a Yes feature remains available regardless of its own selection state", () => {
    const selections: FeatureSelection[] = [{ featureId: yesFeature.id, included: false, activeCount: 0 }];
    expect(isFeatureAvailableForNewSelection(yesFeature, selections)).toBe(true);
  });

  it("selection state for a different feature does not leak into this one", () => {
    const selections: FeatureSelection[] = [{ featureId: "some-other-feature", included: true, activeCount: 5 }];
    expect(isFeatureAvailableForNewSelection(noFeature, selections)).toBe(false);
  });
});
