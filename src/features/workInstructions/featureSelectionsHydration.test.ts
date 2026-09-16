import { describe, expect, it } from "vitest";
import { rehydrateFeatureSelections } from "./featureSelectionsHydration";
import type { ProductFeatureDefinition } from "../../types/product";

const FP_ENCLOSURE: ProductFeatureDefinition = { id: "feat-enclosure", name: "FP Enclosure", valueType: "text" };
const PROXIMITY_GENERATOR: ProductFeatureDefinition = { id: "feat-generator", name: "Proximity Generator", valueType: "text" };
const FLASHER: ProductFeatureDefinition = { id: "feat-flasher", name: "Flasher/Siren", valueType: "text" };
const JUNCTION_BOX: ProductFeatureDefinition = { id: "feat-junction", name: "Junction Box", valueType: "text" };

const PRODUCT_FEATURES = [FP_ENCLOSURE, PROXIMITY_GENERATOR, FLASHER, JUNCTION_BOX];

describe("rehydrateFeatureSelections — GOAL 4: Builder must reflect server-authoritative quantities immediately", () => {
  it("Scenario 13: after Import (or Sync), Builder shows exactly the server's featureSelectionsJson — no stale pre-import values survive", () => {
    // Stale pre-import state: an older selection shaped like FP Enclosure x1, Proximity Generator x4, Flasher x1, Junction Box x3.
    // The server's fresh response (post-import) says something different — the fix must reflect
    // the SERVER'S numbers, not whatever the Builder happened to show a moment ago.
    const freshFromServer = JSON.stringify([
      { featureId: "feat-enclosure", included: true, activeCount: 1 },
      { featureId: "feat-generator", included: true, activeCount: 3 },
      { featureId: "feat-flasher", included: true, activeCount: 1 },
      { featureId: "feat-junction", included: true, activeCount: 3 },
    ]);

    const result = rehydrateFeatureSelections(freshFromServer, PRODUCT_FEATURES);

    expect(result).toEqual([
      { featureId: "feat-enclosure", included: true, activeCount: 1 },
      { featureId: "feat-generator", included: true, activeCount: 3 },
      { featureId: "feat-flasher", included: true, activeCount: 1 },
      { featureId: "feat-junction", included: true, activeCount: 3 },
    ]);
  });

  it("Scenario 14: a Feature omitted from the imported featureSelections displays quantity 0, not a carried-over value", () => {
    // The server's response only mentions two of the four product Features — the other two were
    // not part of the imported/synced configuration and must show as 0/not-included.
    const partial = JSON.stringify([
      { featureId: "feat-enclosure", included: true, activeCount: 2 },
      { featureId: "feat-junction", included: true, activeCount: 5 },
    ]);

    const result = rehydrateFeatureSelections(partial, PRODUCT_FEATURES);

    expect(result).toEqual([
      { featureId: "feat-enclosure", included: true, activeCount: 2 },
      { featureId: "feat-generator", included: false, activeCount: 0 },
      { featureId: "feat-flasher", included: false, activeCount: 0 },
      { featureId: "feat-junction", included: true, activeCount: 5 },
    ]);
  });

  it("result order always follows productFeatures, regardless of the server JSON's own ordering", () => {
    const outOfOrder = JSON.stringify([
      { featureId: "feat-junction", included: true, activeCount: 3 },
      { featureId: "feat-enclosure", included: true, activeCount: 1 },
    ]);

    const result = rehydrateFeatureSelections(outOfOrder, PRODUCT_FEATURES);

    expect(result.map((s) => s.featureId)).toEqual(["feat-enclosure", "feat-generator", "feat-flasher", "feat-junction"]);
  });

  it("falls back to all-zero selections (never throws) when featureSelectionsJson is malformed", () => {
    const result = rehydrateFeatureSelections("not valid json{{{", PRODUCT_FEATURES);

    expect(result).toEqual(PRODUCT_FEATURES.map((f) => ({ featureId: f.id, included: false, activeCount: 0 })));
  });

  it("falls back to all-zero selections when the parsed JSON is not an array", () => {
    const result = rehydrateFeatureSelections(JSON.stringify({ notAnArray: true }), PRODUCT_FEATURES);

    expect(result).toEqual(PRODUCT_FEATURES.map((f) => ({ featureId: f.id, included: false, activeCount: 0 })));
  });

  it("returns an empty array when there are no product features to map against", () => {
    const result = rehydrateFeatureSelections(JSON.stringify([{ featureId: "feat-enclosure", included: true, activeCount: 1 }]), []);

    expect(result).toEqual([]);
  });
});
