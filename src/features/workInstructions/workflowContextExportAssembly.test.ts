import { describe, expect, it } from "vitest";
import { assembleAuthoringContextFromBuilderState } from "./workflowContextExportAssembly";
import type { ProductWorkflowContext } from "../../types/productWorkflowContext";
import type { FeatureSelection } from "../../services/productConfigService";

// HA-Coal-shaped fixture, mirroring the staging acceptance case: 8 Product Features, only some
// selected in the Builder.
const PRODUCT_CONTEXT: ProductWorkflowContext = {
  schemaVersion: 1,
  product: { id: "prod-ha-coal", name: "HA-Coal" },
  features: [
    {
      featureId: "feat-controller",
      name: "CONTROLLER FP ENCLOSURE",
      valueType: "text",
      options: [],
      subProperties: [],
      isInventory: true,
      selectable: true,
      sortOrder: 1,
      brand: "Strata",
      supplier: "Strata Supply Co",
      alternativePartNumber: "OEE-1353-02",
      manufacturerPartNumber: null,
      unitPrice: 100,
      dependencies: [],
      captureFields: ["serialNo", "firmware", "location", "certificate"],
    },
    {
      featureId: "feat-proximity",
      name: "Proximity Generator",
      valueType: "text",
      options: [],
      subProperties: [],
      isInventory: true,
      selectable: true,
      sortOrder: 2,
      brand: null,
      supplier: "Strata Supply Co",
      alternativePartNumber: "HA-CG2-PM-01",
      manufacturerPartNumber: null,
      unitPrice: 50,
      dependencies: [
        {
          dependencyId: "dep-proximity-1",
          name: "Proximity install check",
          featureId: "feat-proximity",
          isInventory: true,
          captureFields: ["serialNo"],
          defaultQty: 1,
          unitPrice: 0,
          sortOrder: 1,
        },
      ],
      captureFields: ["serialNo", "location"],
    },
    {
      featureId: "feat-display",
      name: "TRACKING DISPLAY POD",
      valueType: "text",
      options: [],
      subProperties: [],
      isInventory: true,
      selectable: true,
      sortOrder: 3,
      brand: null,
      supplier: null,
      alternativePartNumber: "AUS-POD",
      manufacturerPartNumber: null,
      unitPrice: null,
      dependencies: [],
      captureFields: ["serialNo", "certificate"],
    },
    {
      featureId: "feat-flasher",
      name: "FLASHER/SIREN COMBO",
      valueType: "text",
      options: [],
      subProperties: [],
      isInventory: true,
      selectable: true,
      sortOrder: 4,
      brand: null,
      supplier: null,
      alternativePartNumber: "AUS-FSMULTI",
      manufacturerPartNumber: null,
      unitPrice: null,
      dependencies: [],
      captureFields: [],
    },
    {
      featureId: "feat-silent-enclosure",
      name: "Silent Zone Enclosure",
      valueType: "text",
      options: [],
      subProperties: [],
      isInventory: true,
      selectable: true,
      sortOrder: 5,
      brand: null,
      supplier: null,
      alternativePartNumber: null,
      manufacturerPartNumber: null,
      unitPrice: null,
      dependencies: [],
      captureFields: [],
    },
    {
      featureId: "feat-junction",
      name: "JUNCTION BOX",
      valueType: "text",
      options: [],
      subProperties: [],
      isInventory: true,
      selectable: true,
      sortOrder: 6,
      brand: null,
      supplier: null,
      alternativePartNumber: "HA-363",
      manufacturerPartNumber: null,
      unitPrice: null,
      dependencies: [],
      captureFields: ["serialNo", "location", "certificate"],
    },
    {
      featureId: "feat-compact-generator",
      name: "7.5\" COMPACT GENERATOR",
      valueType: "text",
      options: [],
      subProperties: [],
      isInventory: true,
      selectable: true,
      sortOrder: 7,
      brand: null,
      supplier: null,
      alternativePartNumber: "HA-CG2-CG-01",
      manufacturerPartNumber: null,
      unitPrice: null,
      dependencies: [],
      captureFields: [],
    },
    {
      featureId: "feat-silent-cables",
      name: "SILENT ZONE CABLES INSIDE FRAS HOSE",
      valueType: "text",
      options: [],
      subProperties: [],
      isInventory: false,
      selectable: true,
      sortOrder: 8,
      brand: null,
      supplier: null,
      alternativePartNumber: null,
      manufacturerPartNumber: null,
      unitPrice: null,
      dependencies: [],
      captureFields: [],
    },
  ],
};

function sel(featureId: string, activeCount: number, included = activeCount > 0): FeatureSelection {
  return { featureId, included, activeCount };
}

describe("assembleAuthoringContextFromBuilderState", () => {
  it("HA-Coal acceptance case: Controller x1, Proximity x2, Display x1, Flasher x1, Junction Box x1 — everything else 0", () => {
    const selections: FeatureSelection[] = [
      sel("feat-controller", 1),
      sel("feat-proximity", 2),
      sel("feat-display", 1),
      sel("feat-flasher", 1),
      sel("feat-silent-enclosure", 0),
      sel("feat-junction", 1),
      sel("feat-compact-generator", 0),
      sel("feat-silent-cables", 0),
    ];

    const result = assembleAuthoringContextFromBuilderState(
      PRODUCT_CONTEXT,
      selections,
      "cfg-1",
      "HA-Coal Runtime Test",
    );

    expect(result.schemaVersion).toBe(1);
    expect(result.product).toEqual({ id: "prod-ha-coal", name: "HA-Coal" });
    expect(result.workflowConfigId).toBe("cfg-1");
    expect(result.workflowConfigName).toBe("HA-Coal Runtime Test");
    expect(result.features).toHaveLength(5);

    const byName = new Map(result.features.map((f) => [f.name, f]));
    expect(byName.has("Silent Zone Enclosure")).toBe(false);
    expect(byName.has("7.5\" COMPACT GENERATOR")).toBe(false);
    expect(byName.has("SILENT ZONE CABLES INSIDE FRAS HOSE")).toBe(false);

    expect(byName.get("CONTROLLER FP ENCLOSURE")).toMatchObject({
      featureId: "feat-controller",
      quantity: 1,
      alternativePartNumber: "OEE-1353-02",
    });
    expect(byName.get("Proximity Generator")).toMatchObject({
      featureId: "feat-proximity",
      quantity: 2,
      alternativePartNumber: "HA-CG2-PM-01",
    });
    expect(byName.get("TRACKING DISPLAY POD")).toMatchObject({
      featureId: "feat-display",
      quantity: 1,
      alternativePartNumber: "AUS-POD",
    });
    expect(byName.get("FLASHER/SIREN COMBO")).toMatchObject({
      featureId: "feat-flasher",
      quantity: 1,
      alternativePartNumber: "AUS-FSMULTI",
    });
    expect(byName.get("JUNCTION BOX")).toMatchObject({
      featureId: "feat-junction",
      quantity: 1,
      alternativePartNumber: "HA-363",
    });
  });

  it("omits a Feature entirely when its quantity is 0, even if included is somehow true", () => {
    const selections: FeatureSelection[] = [sel("feat-controller", 0, true)];

    const result = assembleAuthoringContextFromBuilderState(PRODUCT_CONTEXT, selections, "cfg-1", "Test");

    expect(result.features).toHaveLength(0);
  });

  it("uses live Builder quantity, not any persisted value — dirty saved workflow case (Junction Box 1 → 3 unsaved)", () => {
    // Builder currently shows Junction Box x3, regardless of what a prior save/sync/fetch put in
    // WorkflowConfigFeature — this function never looks at that, only at the selections it's given.
    const selections: FeatureSelection[] = [sel("feat-junction", 3)];

    const result = assembleAuthoringContextFromBuilderState(PRODUCT_CONTEXT, selections, "cfg-1", "Test");

    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({ featureId: "feat-junction", quantity: 3 });
  });

  it("unsaved workflow (no persisted config): exports exactly the live selections, not the whole Product catalog", () => {
    // Only two Features selected in a brand-new, never-saved Builder session.
    const selections: FeatureSelection[] = [sel("feat-controller", 1), sel("feat-proximity", 2)];

    const result = assembleAuthoringContextFromBuilderState(
      PRODUCT_CONTEXT,
      selections,
      "temp-draft-id",
      "HA-Coal",
    );

    expect(result.features).toHaveLength(2);
    expect(result.features.map((f) => f.featureId)).toEqual(["feat-controller", "feat-proximity"]);
    expect(result.workflowConfigId).toBe("temp-draft-id");
  });

  it("captures real dependency IDs and dependency-derived capture fields when the Feature has Dependencies configured", () => {
    const selections: FeatureSelection[] = [sel("feat-proximity", 2)];

    const result = assembleAuthoringContextFromBuilderState(PRODUCT_CONTEXT, selections, "cfg-1", "Test");

    expect(result.features[0].dependencyIds).toEqual(["dep-proximity-1"]);
    expect(result.features[0].captureFields).toEqual(["serialNo"]);
  });

  it("falls back to the Feature's own captureFields when it has no Dependencies configured", () => {
    const selections: FeatureSelection[] = [sel("feat-junction", 1)];

    const result = assembleAuthoringContextFromBuilderState(PRODUCT_CONTEXT, selections, "cfg-1", "Test");

    expect(result.features[0].dependencyIds).toEqual([]);
    expect(result.features[0].captureFields).toEqual(["serialNo", "location", "certificate"]);
  });

  it("preserves brand, supplier, and part-number metadata verbatim from the Product master, never inventing values", () => {
    const selections: FeatureSelection[] = [sel("feat-controller", 1)];

    const result = assembleAuthoringContextFromBuilderState(PRODUCT_CONTEXT, selections, "cfg-1", "Test");

    expect(result.features[0]).toMatchObject({
      brand: "Strata",
      supplier: "Strata Supply Co",
      alternativePartNumber: "OEE-1353-02",
      manufacturerPartNumber: null,
      unitPrice: 100,
    });
  });

  it("never invents a Feature ID: a selection referencing a Feature absent from the Product master is silently skipped", () => {
    const selections: FeatureSelection[] = [sel("feat-does-not-exist", 5), sel("feat-controller", 1)];

    const result = assembleAuthoringContextFromBuilderState(PRODUCT_CONTEXT, selections, "cfg-1", "Test");

    expect(result.features).toHaveLength(1);
    expect(result.features[0].featureId).toBe("feat-controller");
  });

  it("orders exported Features by Product master sortOrder, independent of selection array order", () => {
    const selections: FeatureSelection[] = [sel("feat-junction", 1), sel("feat-controller", 1), sel("feat-proximity", 1)];

    const result = assembleAuthoringContextFromBuilderState(PRODUCT_CONTEXT, selections, "cfg-1", "Test");

    expect(result.features.map((f) => f.featureId)).toEqual(["feat-controller", "feat-proximity", "feat-junction"]);
  });
});
