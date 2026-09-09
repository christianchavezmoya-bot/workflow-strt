import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkerPreviewPanel } from "./WorkerPreviewPanel";
import type { MediaItem, Workflow, WorkflowStep } from "../../types/workflow";

function photoA(): MediaItem {
  return { id: "photoA", type: "image", name: "photoA.jpg", size: 1000, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 };
}
function videoB(): MediaItem {
  return { id: "videoB", type: "video", name: "videoB.mp4", size: 2000, mime: "video/mp4", url: "/media/videoB", createdAt: 2 };
}
function step(id: string, order: number, mediaIds: string[]): WorkflowStep {
  return {
    id, order, title: `Step ${id}`, description: "", overrideInReport: false, overrideReportText: "",
    includeDescriptionInReport: true, mediaIds, decisionsEnabled: false, decisions: [], inputs: [], nextStepId: null,
  };
}

describe("WorkerPreviewPanel — reference Content for the active step only (TEST D)", () => {
  it("shows only the active step's reference media, not other steps' media", () => {
    const stepA = step("A", 1, ["photoA"]);
    const stepB = step("B", 2, ["videoB"]);
    const workflow: Workflow = {
      id: "wf-1", name: "wf", productId: "p1", createdAt: Date.now(),
      steps: [stepA, stepB], media: [photoA(), videoB()],
    };

    const { rerender } = render(
      <WorkerPreviewPanel workflow={workflow} stepsSorted={[stepA, stepB]} selectedStepId="A" onSelectStep={vi.fn()} />,
    );

    expect(screen.getByText("Reference Content")).toBeInTheDocument();
    expect(screen.getByAltText("photoA.jpg")).toBeInTheDocument();
    expect(screen.queryByText("videoB.mp4")).not.toBeInTheDocument();

    rerender(
      <WorkerPreviewPanel workflow={workflow} stepsSorted={[stepA, stepB]} selectedStepId="B" onSelectStep={vi.fn()} />,
    );

    expect(screen.getByText("videoB.mp4")).toBeInTheDocument();
    expect(screen.queryByAltText("photoA.jpg")).not.toBeInTheDocument();
  });

  it("renders reference Content and a technician capture Input independently on the same step (TEST H)", () => {
    const stepWithBoth: WorkflowStep = {
      ...step("D", 4, ["photoA"]),
      inputs: [{ id: "inp1", type: "photo", label: "Capture installation photo", required: true }],
    };
    const workflow: Workflow = {
      id: "wf-1", name: "wf", productId: "p1", createdAt: Date.now(),
      steps: [stepWithBoth], media: [photoA()],
    };

    render(
      <WorkerPreviewPanel workflow={workflow} stepsSorted={[stepWithBoth]} selectedStepId="D" onSelectStep={vi.fn()} />,
    );

    // Reference Content (author-supplied) renders...
    expect(screen.getByText("Reference Content")).toBeInTheDocument();
    expect(screen.getByAltText("photoA.jpg")).toBeInTheDocument();
    // ...independently of the technician capture Input (evidence to be supplied at run time) —
    // neither becomes the other.
    expect(screen.getByText("Inputs")).toBeInTheDocument();
    expect(screen.getByText("Capture installation photo")).toBeInTheDocument();
    expect(screen.getByText("Capture photo")).toBeInTheDocument(); // disabled preview button for the Input, not the reference photo
  });

  it("shows no Reference Content section for a step with no attached media", () => {
    const stepC = step("C", 3, []);
    const workflow: Workflow = {
      id: "wf-1", name: "wf", productId: "p1", createdAt: Date.now(),
      steps: [stepC], media: [photoA()],
    };

    render(
      <WorkerPreviewPanel workflow={workflow} stepsSorted={[stepC]} selectedStepId="C" onSelectStep={vi.fn()} />,
    );

    expect(screen.queryByText("Reference Content")).not.toBeInTheDocument();
  });
});
