import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MediaLibraryPanel } from "./MediaLibraryPanel";
import type { MediaItem, Workflow, WorkflowStep } from "../../types/workflow";

// QRUploadButton pulls in axios/qrcode.react/documentService — irrelevant to
// this fix, stub it out so these tests only exercise MediaLibraryPanel itself.
vi.mock("../../components/QRUploadButton", () => ({
  default: () => null,
}));

// jsdom's default test origin differs from this mocked API origin — a test
// relying on this proves the thumbnail resolves against the real API host,
// not window.location.origin.
const getApiBaseUrl = vi.fn(() => "https://api.staging.strata-ngo.com/api");
vi.mock("../../services/apiBase", () => ({
  getApiBaseUrl: () => getApiBaseUrl(),
}));

const uploadMedia = vi.fn();
vi.mock("../../services/workflowConfigService", () => ({
  workflowConfigService: {
    uploadMedia: (...args: unknown[]) => uploadMedia(...args),
    deleteMedia: vi.fn(),
  },
}));

function photoA(): MediaItem {
  return { id: "photoA", type: "image", name: "photoA.jpg", size: 1000, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 };
}
function videoB(): MediaItem {
  return { id: "videoB", type: "video", name: "videoB.mp4", size: 2000, mime: "video/mp4", url: "/media/videoB", createdAt: 2 };
}
function baseStep(id: string, mediaIds: string[] = []): WorkflowStep {
  return {
    id, order: 1, title: `Step ${id}`, description: "", overrideInReport: false, overrideReportText: "",
    includeDescriptionInReport: true, mediaIds, decisionsEnabled: false, decisions: [], inputs: [], nextStepId: null,
  };
}
function baseWorkflow(media: MediaItem[]): Workflow {
  return { id: "wf-1", name: "Workflow", productId: "prod-1", createdAt: Date.now(), steps: [], media };
}

describe("MediaLibraryPanel — reference Content scoped to the selected step (TEST A)", () => {
  it("shows only the selected step's attached media, not the whole library", () => {
    const workflow = baseWorkflow([photoA(), videoB()]);
    const stepA = baseStep("A", ["photoA"]);

    const { rerender } = render(
      <MediaLibraryPanel
        workflow={workflow}
        step={stepA}
        templateId="cfg-1"
        ensureConfigId={async () => "cfg-1"}
        onStepChange={vi.fn()}
        onWorkflowUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText("photoA.jpg")).toBeInTheDocument();
    expect(screen.queryByText("videoB.mp4")).not.toBeInTheDocument();

    const stepB = baseStep("B", ["videoB"]);
    rerender(
      <MediaLibraryPanel
        workflow={workflow}
        step={stepB}
        templateId="cfg-1"
        ensureConfigId={async () => "cfg-1"}
        onStepChange={vi.fn()}
        onWorkflowUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText("videoB.mp4")).toBeInTheDocument();
    expect(screen.queryByText("photoA.jpg")).not.toBeInTheDocument();
  });

  it("shows the empty-content message when the selected step has no attached media, even if the library is non-empty", () => {
    const workflow = baseWorkflow([photoA()]);
    const step = baseStep("A", []);

    render(
      <MediaLibraryPanel
        workflow={workflow}
        step={step}
        templateId="cfg-1"
        ensureConfigId={async () => "cfg-1"}
        onStepChange={vi.fn()}
        onWorkflowUpdate={vi.fn()}
      />,
    );

    expect(screen.queryByText("photoA.jpg")).not.toBeInTheDocument();
    expect(screen.getByText(/No content attached to this step yet/i)).toBeInTheDocument();
  });
});

describe("MediaLibraryPanel — thumbnail resolves against the API origin (TEST 7)", () => {
  it("resolves a relative media URL against getApiBaseUrl(), not window.location.origin", () => {
    const workflow = baseWorkflow([photoA()]);
    const step = baseStep("A", ["photoA"]);

    const { container } = render(
      <MediaLibraryPanel
        workflow={workflow}
        step={step}
        templateId="cfg-1"
        ensureConfigId={async () => "cfg-1"}
        onStepChange={vi.fn()}
        onWorkflowUpdate={vi.fn()}
      />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://api.staging.strata-ngo.com/media/photoA");
  });
});

describe("MediaLibraryPanel — upload auto-attaches to the selected step (TEST B)", () => {
  beforeEach(() => {
    uploadMedia.mockReset();
  });

  it("attaches a successful upload to the currently selected step only", async () => {
    const newItem = { id: "videoNew", type: "video", name: "clip.mp4", size: 500, mime: "video/mp4", url: "/media/videoNew", createdAt: 3 };
    uploadMedia.mockResolvedValue({ mediaJson: JSON.stringify([newItem]) });

    const workflow = baseWorkflow([]);
    const stepA = baseStep("A", []);
    const onStepChange = vi.fn();
    const onWorkflowUpdate = vi.fn();

    const { container } = render(
      <MediaLibraryPanel
        workflow={workflow}
        step={stepA}
        templateId="cfg-1"
        ensureConfigId={async () => "cfg-1"}
        onStepChange={onStepChange}
        onWorkflowUpdate={onWorkflowUpdate}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-video-bytes"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onWorkflowUpdate).toHaveBeenCalled());

    expect(onWorkflowUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ media: [expect.objectContaining({ id: "videoNew" })] }),
    );
    expect(onStepChange).toHaveBeenCalledWith({ mediaIds: ["videoNew"] });
  });

  it("does not change mediaIds when the upload fails", async () => {
    uploadMedia.mockRejectedValue(new Error("network error"));

    const workflow = baseWorkflow([]);
    const stepA = baseStep("A", []);
    const onStepChange = vi.fn();
    const onWorkflowUpdate = vi.fn();

    const { container } = render(
      <MediaLibraryPanel
        workflow={workflow}
        step={stepA}
        templateId="cfg-1"
        ensureConfigId={async () => "cfg-1"}
        onStepChange={onStepChange}
        onWorkflowUpdate={onWorkflowUpdate}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-video-bytes"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Upload failed/i)).toBeInTheDocument());

    expect(onStepChange).not.toHaveBeenCalled();
    expect(onWorkflowUpdate).not.toHaveBeenCalled();
  });
});
