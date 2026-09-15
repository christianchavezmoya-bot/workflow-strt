import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SyncFeatureStepsDialog } from "./SyncFeatureStepsDialog";
import type { WorkflowStep } from "../../types/workflow";
import type { SyncFeatureStepsResult } from "../../types/syncFeatureSteps";

const previewSyncFeatureSteps = vi.fn();
const syncFeatureSteps = vi.fn();
const getConfigById = vi.fn();
vi.mock("../../services/workflowConfigService", () => ({
  workflowConfigService: {
    previewSyncFeatureSteps: (...args: unknown[]) => previewSyncFeatureSteps(...args),
    syncFeatureSteps: (...args: unknown[]) => syncFeatureSteps(...args),
    getById: (...args: unknown[]) => getConfigById(...args),
  },
}));

function baseStep(overrides: Partial<WorkflowStep>): WorkflowStep {
  return {
    id: "existing-step", order: 1, title: "Step", description: "", overrideInReport: false, overrideReportText: "",
    includeDescriptionInReport: true, mediaIds: [], decisionsEnabled: false, decisions: [], inputs: [], nextStepId: null,
    ...overrides,
  };
}

function resultItem(overrides: Partial<SyncFeatureStepsResult["added"][number]>) {
  return {
    stepId: "step-x", generatorKey: "feature:feat-1:unit:1:installation", featureId: "feat-1",
    unitIndex: 1, stepType: "installation", title: "Junction Box 1 — Installation",
    ...overrides,
  };
}

function emptyResult(): SyncFeatureStepsResult {
  return { added: [], updated: [], removed: [], unchanged: [], blocked: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SyncFeatureStepsDialog — server-authoritative preview", () => {
  it("opening the dialog calls the server preview endpoint, not a local diff computation", async () => {
    previewSyncFeatureSteps.mockResolvedValue({ ...emptyResult(), added: [resultItem({})] });
    render(<SyncFeatureStepsDialog open configId="config-1" steps={[]} onClose={vi.fn()} onSynced={vi.fn()} />);

    await waitFor(() => expect(previewSyncFeatureSteps).toHaveBeenCalledTimes(1));
    expect(previewSyncFeatureSteps).toHaveBeenCalledWith("config-1");
    // The apply endpoint must never be called just from opening the dialog.
    expect(syncFeatureSteps).not.toHaveBeenCalled();
  });

  it("renders the server preview's counts, including a run-blocked removal, before any confirmation", async () => {
    previewSyncFeatureSteps.mockResolvedValue({
      added: [], updated: [], removed: [], unchanged: [resultItem({ stepId: "u1" }), resultItem({ stepId: "u2" })],
      blocked: [resultItem({
        stepId: "step-blocked", title: "Generator 3 — Installation",
        blockingRuns: [{ runId: "run-abc", assetId: "asset-1" }],
      })],
    });

    render(<SyncFeatureStepsDialog open configId="config-1" steps={[]} onClose={vi.fn()} onSynced={vi.fn()} />);

    await screen.findByText(/0 to add/);
    expect(screen.getByText(/2 unchanged/)).toBeInTheDocument();
    // Collapsed by default, not listed one-by-one.
    expect(screen.getByText("2 generated steps unchanged")).toBeInTheDocument();
    expect(screen.getByText("Generator 3 — Installation")).toBeInTheDocument();
    expect(screen.getByText(/Reason: active run run-abc/)).toBeInTheDocument();
    // No apply call happened just to render this.
    expect(syncFeatureSteps).not.toHaveBeenCalled();
  });

  it("never shows a custom step supplied via the steps prop in the preview — only what the server preview response contains", async () => {
    const customStep = baseStep({ id: "custom-1", title: "Preparation & Permits", stepType: "preparation" });
    previewSyncFeatureSteps.mockResolvedValue({ ...emptyResult(), added: [resultItem({})] });

    render(<SyncFeatureStepsDialog open configId="config-1" steps={[customStep]} onClose={vi.fn()} onSynced={vi.fn()} />);

    await screen.findByText(/1 to add/);
    expect(screen.queryByText("Preparation & Permits")).not.toBeInTheDocument();
  });

  it("cancel never calls the apply endpoint", async () => {
    const onClose = vi.fn();
    previewSyncFeatureSteps.mockResolvedValue(emptyResult());
    render(<SyncFeatureStepsDialog open configId="config-1" steps={[]} onClose={onClose} onSynced={vi.fn()} />);

    await screen.findByText(/0 to add/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(syncFeatureSteps).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("confirm calls the apply endpoint exactly once, independently of what preview returned, and refreshes Builder state on success", async () => {
    const onSynced = vi.fn();
    // Preview said "nothing to do"...
    previewSyncFeatureSteps.mockResolvedValue(emptyResult());
    // ...but apply is recomputed independently server-side and can legitimately differ (state
    // changed between preview and confirm) — the dialog must render exactly what apply returns.
    syncFeatureSteps.mockResolvedValue({ ...emptyResult(), added: [resultItem({ title: "Junction Box 1 — Installation" })] });
    const freshConfig = { id: "config-1", productId: "p1", name: "Cfg", status: "Draft", version: 1, stepsJson: "[]", mediaJson: "[]", featureSelectionsJson: "[]", createdAt: "", updatedAt: "" };
    getConfigById.mockResolvedValue(freshConfig);

    render(<SyncFeatureStepsDialog open configId="config-1" steps={[]} onClose={vi.fn()} onSynced={onSynced} />);

    await screen.findByText(/0 to add/);
    fireEvent.click(screen.getByRole("button", { name: /Confirm & Sync/i }));

    await waitFor(() => expect(onSynced).toHaveBeenCalledTimes(1));
    expect(onSynced).toHaveBeenCalledWith(freshConfig);
    expect(syncFeatureSteps).toHaveBeenCalledTimes(1);
    expect(syncFeatureSteps).toHaveBeenCalledWith("config-1");
    // The rendered result reflects apply's own (different-from-preview) response.
    expect(await screen.findByText("Junction Box 1 — Installation")).toBeInTheDocument();
  });

  it("renders blocked run details and partial application (applied + blocked field labels) together in the result", async () => {
    previewSyncFeatureSteps.mockResolvedValue(emptyResult());
    const freshSteps: WorkflowStep[] = [
      baseStep({
        id: "step-blocked",
        stepOrigin: "feature-generated",
        captureFields: [
          { id: "field-applied", key: "serialNo", label: "Serial Number", type: "text", required: true },
          { id: "field-blocked", key: "certificate", label: "Certificate", type: "text", required: true },
        ],
      }),
    ];
    const freshConfig = { id: "config-1", productId: "p1", name: "Cfg", status: "Draft", version: 1, stepsJson: JSON.stringify(freshSteps), mediaJson: "[]", featureSelectionsJson: "[]", createdAt: "", updatedAt: "" };
    getConfigById.mockResolvedValue(freshConfig);

    syncFeatureSteps.mockResolvedValue({
      ...emptyResult(),
      blocked: [
        resultItem({
          stepId: "step-blocked",
          title: "Junction Box 2 — Installation",
          appliedFieldIds: ["field-applied"],
          blockedFieldIds: ["field-blocked"],
          blockingRuns: [{ runId: "run-abc-123", assetId: "asset-1" }],
        }),
      ],
    });

    render(<SyncFeatureStepsDialog open configId="config-1" steps={[]} onClose={vi.fn()} onSynced={vi.fn()} />);

    await screen.findByText(/0 to add/);
    fireEvent.click(screen.getByRole("button", { name: /Confirm & Sync/i }));

    await screen.findByText("Junction Box 2 — Installation");
    expect(screen.getByText(/Added: Serial Number/)).toBeInTheDocument();
    expect(screen.getByText(/Blocked removal: Certificate/)).toBeInTheDocument();
    expect(screen.getByText(/Reason: active run run-abc-123/)).toBeInTheDocument();
  });

  it("on preview error, surfaces the error and never calls apply", async () => {
    previewSyncFeatureSteps.mockRejectedValue({ response: { data: { message: "Could not load preview." } } });
    render(<SyncFeatureStepsDialog open configId="config-1" steps={[]} onClose={vi.fn()} onSynced={vi.fn()} />);

    await screen.findByText("Could not load preview.");
    expect(syncFeatureSteps).not.toHaveBeenCalled();
  });

  it("on apply server error, leaves existing Builder workflow state intact (onSynced never called) and surfaces the error", async () => {
    const onSynced = vi.fn();
    previewSyncFeatureSteps.mockResolvedValue({ ...emptyResult(), added: [resultItem({})] });
    syncFeatureSteps.mockRejectedValue({ response: { data: { message: "Sync failed because the config was archived." } } });

    render(<SyncFeatureStepsDialog open configId="config-1" steps={[]} onClose={vi.fn()} onSynced={onSynced} />);

    await screen.findByText(/1 to add/);
    fireEvent.click(screen.getByRole("button", { name: /Confirm & Sync/i }));

    await screen.findByText("Sync failed because the config was archived.");
    expect(onSynced).not.toHaveBeenCalled();
    expect(getConfigById).not.toHaveBeenCalled();
  });
});
