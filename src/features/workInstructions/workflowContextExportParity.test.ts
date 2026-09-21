import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleAuthoringContextFromBuilderState } from "./workflowContextExportAssembly";
import type { ProductWorkflowContext } from "../../types/productWorkflowContext";
import type { WorkflowAuthoringContext } from "../../types/workflowAuthoringContext";
import type { FeatureSelection } from "../../services/productConfigService";

/**
 * PARITY: the Builder button assembles the workflow context client-side, while
 * GET /workflow-configs/{id}/authoring-context builds it on the server. This test replays the
 * client assembler over the REAL backend responses captured in the shared golden fixture and
 * requires it to reproduce the backend's authoringContext exactly — same dependency ids/names,
 * capture-field keys/labels/types, per-unit generated ids and steps.
 *
 * The fixture is generated (and asserted) by the backend test
 * WorkflowAuthoringContextParityTests, so a change on EITHER side that breaks the contract fails CI.
 * Regenerate: UPDATE_CONTEXT_GOLDEN=1 dotnet test --filter WorkflowAuthoringContextParityTests
 */
interface Golden {
  selections: { featureId: string; activeCount: number }[];
  inclusionsByFeature: Record<string, Record<string, boolean>>;
  productContext: ProductWorkflowContext;
  authoringContext: WorkflowAuthoringContext;
}

const golden: Golden = JSON.parse(
  readFileSync(resolve(__dirname, "../../../server/Commtrac.Api.Tests/Fixtures/workflow-context-parity.json"), "utf8"),
);

describe("client export == backend authoring-context (golden fixture from the real endpoints)", () => {
  const selections: FeatureSelection[] = golden.selections.map((s) => ({ featureId: s.featureId, included: s.activeCount > 0, activeCount: s.activeCount }));
  const clientExport = assembleAuthoringContextFromBuilderState(
    golden.productContext,
    selections,
    golden.authoringContext.workflowConfigId,
    golden.authoringContext.workflowConfigName,
    { inclusionsByFeature: golden.inclusionsByFeature },
  );

  it("reproduces the backend export exactly", () => {
    // JSON round-trip drops `undefined`, matching what the button's downloadJsonFile writes.
    expect(JSON.parse(JSON.stringify(clientExport))).toEqual(golden.authoringContext);
  });

  it("the golden fixture really exercises the interesting shapes (guards against an empty/trivial fixture)", () => {
    const byId = new Map(golden.authoringContext.features.map((f) => [f.featureId, f]));
    expect(byId.get("feat-1")!.dependencies).toHaveLength(2);
    expect(byId.get("feat-1")!.options).toEqual(["Type A", "Type B", "Type C"]);
    expect(byId.get("feat-junction")!.captureFieldSource).toBe("feature");
    expect(byId.get("feat-cable")!.generatedSteps).toEqual([]);
    expect(byId.get("feat-excl")!.dependencies!.map((d) => d.included)).toEqual([true, false]);
    expect(golden.authoringContext.features[0].dependencies![0].captureFields[0].generatedFieldIds[0].fieldId)
      .toBe("318cdfd3-43c8-e922-a956-b14058f77a6d"); // .NET-verified id
  });
});
