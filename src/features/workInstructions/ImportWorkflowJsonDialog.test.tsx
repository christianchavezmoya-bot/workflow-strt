import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportWorkflowJsonDialog } from "./ImportWorkflowJsonDialog";
import type { WorkflowExportDocument } from "../../types/workflowExportSchema";
import type { WorkflowImportValidation } from "../../types/workflowImportValidation";

const validateImportWorkflow = vi.fn();
const importWorkflow = vi.fn();
vi.mock("../../services/workflowConfigService", () => ({
  workflowConfigService: {
    validateImportWorkflow: (...args: unknown[]) => validateImportWorkflow(...args),
    importWorkflow: (...args: unknown[]) => importWorkflow(...args),
  },
}));

function doc(): WorkflowExportDocument {
  return { schemaVersion: 1, productId: "prod-1", name: "Wf", featureSelections: [], steps: [] };
}

function validValidation(overrides: Partial<WorkflowImportValidation> = {}): WorkflowImportValidation {
  return {
    valid: true, productId: "prod-1", productName: "HA-Coal",
    featureReferencesMatched: 8, featureReferencesTotal: 8,
    dependencyReferencesMatched: 24, dependencyReferencesTotal: 24,
    customStepCount: 12, generatedStepsToReconstruct: 9,
    unknownFeatureIds: [], unknownDependencyIds: [], duplicateFeatureIds: [],
    schemaVersionSupported: true, productMatches: true,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("ImportWorkflowJsonDialog", () => {
  it("renders the validation summary (product, matched counts, step counts)", async () => {
    validateImportWorkflow.mockResolvedValue(validValidation());
    render(<ImportWorkflowJsonDialog doc={doc()} onClose={vi.fn()} configId="config-1" onImported={vi.fn()} />);

    await screen.findByText("HA-Coal");
    expect(screen.getByText("8/8 matched")).toBeInTheDocument();
    expect(screen.getByText("24/24 matched")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("disables Import and shows unknown feature ids when validation reports unknown features", async () => {
    validateImportWorkflow.mockResolvedValue(validValidation({ valid: false, unknownFeatureIds: ["missing-1"], featureReferencesMatched: 7 }));
    render(<ImportWorkflowJsonDialog doc={doc()} onClose={vi.fn()} configId="config-1" onImported={vi.fn()} />);

    await screen.findByText("HA-Coal");
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(importWorkflow).not.toHaveBeenCalled();
  });

  it("disables Import when an unknown dependency id is reported", async () => {
    validateImportWorkflow.mockResolvedValue(validValidation({ valid: false, unknownDependencyIds: ["missing-dep"], dependencyReferencesMatched: 23 }));
    render(<ImportWorkflowJsonDialog doc={doc()} onClose={vi.fn()} configId="config-1" onImported={vi.fn()} />);

    await screen.findByText("HA-Coal");
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("disables Import when duplicate feature selections are reported — never silently merges", async () => {
    validateImportWorkflow.mockResolvedValue(validValidation({ valid: false, duplicateFeatureIds: ["feat-1"] }));
    render(<ImportWorkflowJsonDialog doc={doc()} onClose={vi.fn()} configId="config-1" onImported={vi.fn()} />);

    await screen.findByText("HA-Coal");
    expect(screen.getByText(/same feature more than once/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("disables Import and warns on a product mismatch — never silently accepts a cross-product file", async () => {
    validateImportWorkflow.mockResolvedValue(validValidation({ valid: false, productMatches: false }));
    render(<ImportWorkflowJsonDialog doc={doc()} onClose={vi.fn()} configId="config-1" onImported={vi.fn()} />);

    await screen.findByText(/different product/i);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(importWorkflow).not.toHaveBeenCalled();
  });

  it("disables Import on an unsupported schema version", async () => {
    validateImportWorkflow.mockResolvedValue(validValidation({ valid: false, schemaVersionSupported: false }));
    render(<ImportWorkflowJsonDialog doc={doc()} onClose={vi.fn()} configId="config-1" onImported={vi.fn()} />);

    await screen.findByText(/Unsupported file version/i);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("cancel never calls the import endpoint", async () => {
    const onClose = vi.fn();
    validateImportWorkflow.mockResolvedValue(validValidation());
    render(<ImportWorkflowJsonDialog doc={doc()} onClose={onClose} configId="config-1" onImported={vi.fn()} />);

    await screen.findByText("HA-Coal");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(importWorkflow).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("import calls the endpoint exactly once and hands the caller the refreshed config", async () => {
    const onImported = vi.fn();
    const onClose = vi.fn();
    validateImportWorkflow.mockResolvedValue(validValidation());
    const freshConfig = { id: "config-1", productId: "prod-1", name: "Wf", status: "Draft", version: 1, stepsJson: "[]", mediaJson: "[]", featureSelectionsJson: "[]", createdAt: "", updatedAt: "" };
    importWorkflow.mockResolvedValue(freshConfig);

    render(<ImportWorkflowJsonDialog doc={doc()} onClose={onClose} configId="config-1" onImported={onImported} />);

    await screen.findByText("HA-Coal");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(onImported).toHaveBeenCalledWith(freshConfig);
    expect(importWorkflow).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("on import server error, does not call onImported and surfaces the error", async () => {
    const onImported = vi.fn();
    validateImportWorkflow.mockResolvedValue(validValidation());
    importWorkflow.mockRejectedValue({ response: { data: { message: "Import validation failed." } } });

    render(<ImportWorkflowJsonDialog doc={doc()} onClose={vi.fn()} configId="config-1" onImported={onImported} />);

    await screen.findByText("HA-Coal");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText("Import validation failed.");
    expect(onImported).not.toHaveBeenCalled();
  });

  it("on a 409 blocked-import response, shows which step(s)/run(s) blocked it and does not call onImported", async () => {
    const onImported = vi.fn();
    validateImportWorkflow.mockResolvedValue(validValidation());
    importWorkflow.mockRejectedValue({
      response: {
        status: 409,
        data: {
          message: "Import cannot proceed: applying it would require changing a generated step that an active run still references.",
          blockedSteps: [
            {
              stepId: "step-x", generatorKey: "feature:feat-1:unit:2:installation", featureId: "feat-1",
              unitIndex: 2, stepType: "installation", title: "Junction Box 2 — Installation",
              blockingRuns: [{ runId: "run-abc", assetId: "asset-1" }],
            },
          ],
        },
      },
    });

    render(<ImportWorkflowJsonDialog doc={doc()} onClose={vi.fn()} configId="config-1" onImported={onImported} />);

    await screen.findByText("HA-Coal");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText("Junction Box 2 — Installation");
    expect(screen.getByText(/Reason: active run run-abc/)).toBeInTheDocument();
    expect(screen.getByText(/rejected in full, not partially applied/i)).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });
});
