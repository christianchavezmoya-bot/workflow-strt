import { describe, expect, it } from "vitest";
import {
  assembleAuthoringContextFromBuilderState,
  inclusionsByFeatureFromRows,
} from "./workflowContextExportAssembly";
import type { FeatureWorkflowContext, ProductWorkflowContext } from "../../types/productWorkflowContext";
import type { FeatureSelection } from "../../services/productConfigService";
import type { AuthoringCaptureField, WorkflowAuthoringContext } from "../../types/workflowAuthoringContext";
import { deterministicId } from "../../utils/deterministicId";

/**
 * REGRESSION: "Export Workflow Context" used to export dependencies as bare `dependencyIds` and
 * capture fields as a flat, de-duplicated list of strings — losing dependency names/configuration,
 * which dependency each capture field belongs to, field labels/types/required flags, generated
 * ids, and Feature options. These tests build a realistic workflow and assert the export keeps
 * BOTH machine identity and human-readable names, and that the ids it reports are the ones the
 * backend generators really produce (ids below marked ".NET" are reference values computed by the
 * .NET runtime with the backend's exact algorithm — see deterministicId.test.ts).
 */

const F1 = "feat-1";
const DEP_A = "dep-a"; // inventory: serial/firmware/mac
const DEP_B = "dep-b"; // non-inventory: quantity + unit + price

function feature(over: Partial<FeatureWorkflowContext> & Pick<FeatureWorkflowContext, "featureId" | "name">): FeatureWorkflowContext {
  return {
    valueType: "text",
    options: [],
    subProperties: [],
    isInventory: true,
    selectable: true,
    sortOrder: 0,
    dependencies: [],
    captureFields: [],
    ...over,
  };
}

const PRODUCT: ProductWorkflowContext = {
  schemaVersion: 1,
  product: { id: "prod-node", name: "Fibre Node" },
  features: [
    feature({
      featureId: F1,
      name: "Interface Module",
      description: "Line interface card",
      valueType: "select",
      options: ["Type A", "Type B", "Type C"], // dropdown / wheel values
      subProperties: [{ id: "sp-1", name: "Slot", valueType: "number", unit: "no." }],
      sortOrder: 1,
      alternativePartNumber: "IM-100",
      manufacturerPartNumber: "MFR-9",
      productLink: "https://example.test/im-100",
      // Deliberately listed OUT of sortOrder to prove ordering is preserved from sortOrder, not array order.
      dependencies: [
        { dependencyId: DEP_B, name: "Patch lead", featureId: F1, isInventory: false, captureFields: [], defaultQty: 2, unit: "m", unitPrice: 4.5, sortOrder: 2 },
        { dependencyId: DEP_A, name: "Interface module", featureId: F1, isInventory: true, captureFields: ["serialNo", "firmware", "macAddress"], defaultQty: 1, unit: null, unitPrice: 0, sortOrder: 1 },
      ],
      captureFields: [],
    }),
    feature({
      featureId: "feat-junction",
      name: "Junction Box",
      sortOrder: 2,
      alternativePartNumber: "HA-363",
      dependencies: [],
      captureFields: ["serialNo", "location", "certificate"], // "certificate": no built-in label
    }),
    feature({
      featureId: "feat-cable",
      name: "Fibre Cable",
      isInventory: false,
      sortOrder: 3,
      dependencies: [],
      captureFields: ["length"], // non-inventory: generation never produces fields from this
    }),
  ],
};

const sel = (featureId: string, activeCount: number): FeatureSelection => ({ featureId, included: activeCount > 0, activeCount });
const SELECTIONS = [sel(F1, 2), sel("feat-junction", 1), sel("feat-cable", 1)];

function exportContext(inclusions?: Parameters<typeof assembleAuthoringContextFromBuilderState>[4]) {
  return assembleAuthoringContextFromBuilderState(PRODUCT, SELECTIONS, "cfg-42", "Fibre Node Install", inclusions);
}
const featureOf = (ctx: WorkflowAuthoringContext, id: string) => ctx.features.find((f) => f.featureId === id)!;

describe("workflow context export completeness — identity", () => {
  it("keeps workflow, product and Feature identity (id AND name)", () => {
    const ctx = exportContext();
    expect(ctx).toMatchObject({
      schemaVersion: 1,
      product: { id: "prod-node", name: "Fibre Node" },
      workflowConfigId: "cfg-42",
      workflowConfigName: "Fibre Node Install",
    });
    expect(featureOf(ctx, F1)).toMatchObject({ featureId: F1, name: "Interface Module", quantity: 2 });
  });

  it("exports every dependency with id + name + type + parent + configuration, ordered by sortOrder", () => {
    const deps = featureOf(exportContext(), F1).dependencies!;
    expect(deps.map((d) => d.dependencyId)).toEqual([DEP_A, DEP_B]); // sortOrder 1, 2 — not input order
    expect(deps[0]).toMatchObject({
      dependencyId: DEP_A,
      name: "Interface module",
      featureId: F1,
      featureName: "Interface Module",
      isInventory: true,
      generatedStepType: "installation",
      defaultQty: 1,
      unit: null,
      unitPrice: 0,
      sortOrder: 1,
      included: null, // no inclusion state supplied -> unknown, NOT false
    });
    expect(deps[1]).toMatchObject({
      dependencyId: DEP_B,
      name: "Patch lead",
      isInventory: false,
      generatedStepType: "data-collection",
      defaultQty: 2,
      unit: "m",
      unitPrice: 4.5,
      sortOrder: 2,
    });
  });

  it("keeps the Feature configuration: options, valueType, sub-properties, description, link, part number", () => {
    expect(featureOf(exportContext(), F1)).toMatchObject({
      description: "Line interface card",
      valueType: "select",
      options: ["Type A", "Type B", "Type C"],
      subProperties: [{ id: "sp-1", name: "Slot", valueType: "number", unit: "no." }],
      isInventory: true,
      sortOrder: 1,
      productLink: "https://example.test/im-100",
      partNumber: "IM-100", // alternative wins over manufacturer, as in generation
    });
  });
});

describe("workflow context export completeness — capture fields", () => {
  it("exports each capture field with id-bearing identity, key, label, type, required, owner and order", () => {
    const [serial, firmware, mac] = featureOf(exportContext(), F1).dependencies![0].captureFields;

    expect(serial).toMatchObject({
      key: "serialNo",
      label: "Serial Number",
      type: "text",
      required: true,
      order: 0,
      source: "dependency",
      featureId: F1,
      featureName: "Interface Module",
      dependencyId: DEP_A,
      dependencyName: "Interface module",
      identity: "feature:feat-1:dep:dep-a:key:serialNo",
    });
    expect(firmware).toMatchObject({ key: "firmware", label: "Firmware Version", order: 1 });
    expect(mac).toMatchObject({ key: "macAddress", label: "MAC Address", order: 2 });
  });

  it("exports the numeric quantity field of a non-inventory dependency", () => {
    const [qty] = featureOf(exportContext(), F1).dependencies![1].captureFields;
    expect(qty).toMatchObject({
      key: "qty",
      label: "Actual qty — Patch lead (m)",
      type: "number",
      required: true,
      dependencyId: DEP_B,
      dependencyName: "Patch lead",
    });
  });

  it("reports the EXACT per-unit field ids the backend generates (verified against the .NET runtime)", () => {
    const serial = featureOf(exportContext(), F1).dependencies![0].captureFields[0];
    expect(serial.generatedFieldIds).toEqual([
      { unitIndex: 1, fieldId: "318cdfd3-43c8-e922-a956-b14058f77a6d" }, // .NET: field:feat-1:unit:1:dep:dep-a:key:serialNo
      { unitIndex: 2, fieldId: deterministicId("field:feat-1:unit:2:dep:dep-a:key:serialNo") },
    ]);
    const qty = featureOf(exportContext(), F1).dependencies![1].captureFields[0];
    expect(qty.generatedFieldIds[0]).toEqual({ unitIndex: 1, fieldId: "4e5245f5-8ae2-9c9f-c3aa-584cd6f0b8b0" }); // .NET: ...dep:dep-b:key:qty
  });

  it("reports the generated steps per unit with the .NET-verified step ids", () => {
    const steps = featureOf(exportContext(), F1).generatedSteps!;
    expect(steps.map((s) => `${s.unitIndex}:${s.stepType}`)).toEqual([
      "1:installation", "1:data-collection", "2:installation", "2:data-collection",
    ]);
    expect(steps[0]).toEqual({
      unitIndex: 1,
      stepType: "installation",
      generatorKey: "feature:feat-1:unit:1:installation",
      stepId: "7efc169e-cde5-1271-4404-e49d6e411d73", // .NET
    });
    expect(steps[3].stepId).toBe("2b3f2c12-3356-462b-84bb-574ff3f678c3"); // .NET: step:feature:feat-1:unit:2:data-collection
  });

  it("flat captureFieldDefinitions equals the dependencies' fields in order, and the legacy list is unchanged", () => {
    const f = featureOf(exportContext(), F1);
    expect(f.captureFieldSource).toBe("dependencies");
    expect(f.captureFieldDefinitions).toEqual(f.dependencies!.flatMap((d) => d.captureFields));
    // LEGACY fields keep their exact original shape and meaning
    expect(f.captureFields).toEqual(["serialNo", "firmware", "macAddress"]);
    expect(f.dependencyIds).toEqual([DEP_B, DEP_A]); // original master order, untouched
  });

  it("Feature-level fallback: fields are owned by the synthetic dependency (id === featureId), with part number reference", () => {
    const f = featureOf(exportContext(), "feat-junction");
    expect(f.dependencies).toEqual([]);
    expect(f.captureFieldSource).toBe("feature");
    expect(f.captureFieldDefinitions!.map((c) => [c.key, c.label, c.source, c.dependencyId, c.dependencyName])).toEqual([
      ["serialNo", "Serial Number", "feature", "feat-junction", "Junction Box"],
      ["location", "Location", "feature", "feat-junction", "Junction Box"],
      ["certificate", "certificate", "feature", "feat-junction", "Junction Box"], // unknown key: label = key
    ]);
    expect(f.captureFieldDefinitions![0].generatedFieldIds).toHaveLength(1);
    expect(f.generatedSteps!.map((s) => s.stepType)).toEqual(["installation"]);

    // optional, read-only reference field vs required editable fields
    expect(f.partNumberField).toMatchObject({ key: "partNumber", label: "Part Number", type: "text", required: false, readOnly: true, value: "HA-363", source: "part-number" });
    expect(f.captureFieldDefinitions!.every((c) => c.required)).toBe(true);
  });

  it("a non-inventory Feature's fallback fields are described but generate nothing", () => {
    const f = featureOf(exportContext(), "feat-cable");
    expect(f.captureFieldSource).toBe("feature");
    expect(f.captureFieldDefinitions![0]).toMatchObject({ key: "length" });
    expect(f.captureFieldDefinitions![0].generatedFieldIds).toEqual([]);
    expect(f.generatedSteps).toEqual([]);
  });
});

describe("workflow context export completeness — inclusion state", () => {
  it("records per-dependency inclusion, and an excluded dependency generates no fields or step", () => {
    const ctx = exportContext({ inclusionsByFeature: { [F1]: { [DEP_A]: true, [DEP_B]: false } } });
    const f = featureOf(ctx, F1);
    expect(f.dependencies!.map((d) => [d.dependencyId, d.included])).toEqual([[DEP_A, true], [DEP_B, false]]);
    expect(f.dependencies![1].captureFields[0].generatedFieldIds).toEqual([]);
    expect(f.generatedSteps!.every((s) => s.stepType === "installation")).toBe(true);
    // the excluded dependency is still described, never dropped
    expect(f.dependencies![1]).toMatchObject({ dependencyId: DEP_B, name: "Patch lead" });
  });

  it("parses persisted inclusions safely (malformed JSON = no state, not a crash)", () => {
    expect(
      inclusionsByFeatureFromRows([
        { featureId: F1, inclusionsJson: JSON.stringify({ [DEP_A]: true, [DEP_B]: false }) },
        { featureId: "bad", inclusionsJson: "{not json" },
        { featureId: "arr", inclusionsJson: "[1,2]" },
        { featureId: "empty", inclusionsJson: "" },
      ]),
    ).toEqual({ [F1]: { [DEP_A]: true, [DEP_B]: false }, empty: {} });
  });
});

describe("workflow context export completeness — semantic round trip", () => {
  it("survives JSON serialisation and every relationship resolves back to the source model", () => {
    const exported: WorkflowAuthoringContext = JSON.parse(JSON.stringify(exportContext()));

    for (const f of exported.features) {
      const source = PRODUCT.features.find((s) => s.featureId === f.featureId)!;

      // identity + name survive for the Feature
      expect(f.name).toBe(source.name);

      // every source dependency is present with the same id, name and configuration
      expect(new Set(f.dependencies!.map((d) => d.dependencyId))).toEqual(new Set(source.dependencies.map((d) => d.dependencyId)));
      for (const dep of f.dependencies!) {
        const src = source.dependencies.find((d) => d.dependencyId === dep.dependencyId)!;
        expect({ name: dep.name, isInventory: dep.isInventory, defaultQty: dep.defaultQty, unit: dep.unit ?? undefined, unitPrice: dep.unitPrice, sortOrder: dep.sortOrder })
          .toEqual({ name: src.name, isInventory: src.isInventory, defaultQty: src.defaultQty, unit: src.unit ?? undefined, unitPrice: src.unitPrice, sortOrder: src.sortOrder });
        // every configured capture key of an inventory dependency is exported under ITS OWN dependency
        if (dep.isInventory) expect(dep.captureFields.map((c) => c.key)).toEqual(src.captureFields);
      }

      // every capture field's owner id resolves to an exported dependency (or the synthetic Feature-level owner)
      const owners = new Set([...f.dependencies!.map((d) => d.dependencyId), f.featureId]);
      for (const c of f.captureFieldDefinitions as AuthoringCaptureField[]) {
        expect(owners.has(c.dependencyId!)).toBe(true);
        expect(c.identity).toBe(`feature:${f.featureId}:dep:${c.dependencyId}:key:${c.key}`);
      }

      // identities and generated ids are unique (no two fields collide)
      const all = [...(f.captureFieldDefinitions ?? [])].concat(f.partNumberField ? [f.partNumberField] : []);
      expect(new Set(all.map((c) => c.identity)).size).toBe(all.length);
      const ids = all.flatMap((c) => c.generatedFieldIds.map((g) => g.fieldId));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("is deterministic: same input -> identical JSON, regardless of selection order", () => {
    const a = JSON.stringify(exportContext());
    const b = JSON.stringify(assembleAuthoringContextFromBuilderState(PRODUCT, [...SELECTIONS].reverse(), "cfg-42", "Fibre Node Install"));
    expect(b).toBe(a);
  });

  it("keeps every legacy field for old readers, alongside the new ones (additive, schemaVersion stays 1)", () => {
    const f = featureOf(exportContext(), F1);
    for (const legacyKey of ["featureId", "name", "quantity", "captureFields", "brand", "supplier", "alternativePartNumber", "manufacturerPartNumber", "unitPrice", "dependencyIds"]) {
      expect(f, legacyKey).toHaveProperty(legacyKey);
    }
    expect(exportContext().schemaVersion).toBe(1);
  });
});
