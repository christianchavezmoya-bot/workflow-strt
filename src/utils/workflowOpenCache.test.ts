import { describe, expect, it, beforeEach } from "vitest";
import type { WorkflowConfig } from "../types/workflowConfig";
import {
  _clearWorkflowOpenCacheForTests,
  getCachedWorkflowShell,
  mergeWorkflowConfigMedia,
  parseWorkflowFromConfig,
  setCachedWorkflowShell,
} from "./workflowOpenCache";

describe("workflowOpenCache", () => {
  beforeEach(() => {
    _clearWorkflowOpenCacheForTests();
  });

  it("parses workflow steps from config json", () => {
    const cfg: WorkflowConfig = {
      id: "cfg-1",
      name: "Test",
      productId: "p1",
      version: 1,
      status: "Published",
      stepsJson: JSON.stringify({ steps: [{ id: "s1", title: "Step", inputs: [] }] }),
      mediaJson: "[]",
      featureSelectionsJson: "[]",
      configType: "Install",
      displayName: "Test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const wf = parseWorkflowFromConfig(cfg);
    expect(wf?.steps).toHaveLength(1);
  });

  it("stores and retrieves parsed workflow shells", () => {
    const wf = {
      id: "cfg-1",
      name: "Cached",
      productId: "p1",
      createdAt: Date.now(),
      steps: [],
      media: [],
    };
    setCachedWorkflowShell("cfg-1", wf);
    expect(getCachedWorkflowShell("cfg-1")?.name).toBe("Cached");
  });

  it("merges non-empty config mediaJson into a media-less workflow shell", () => {
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media: [] };
    const cfg = {
      mediaJson: JSON.stringify([
        { id: "photoA", type: "image", name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 },
      ]),
    };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged.media).toHaveLength(1);
    expect(merged.media[0].id).toBe("photoA");
  });

  it("does not overwrite media that is already present on the shell", () => {
    const existing = [{ id: "existing", type: "image" as const, name: "existing.jpg", size: 1, mime: "image/jpeg", url: "/e", createdAt: 1 }];
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media: existing };
    const cfg = { mediaJson: JSON.stringify([{ id: "other", type: "image", name: "other.jpg", size: 1, mime: "image/jpeg", url: "/o", createdAt: 2 }]) };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged.media).toBe(existing);
  });

  it("save/reload round trip preserves each step's own mediaIds association (TEST C)", () => {
    const cfg: WorkflowConfig = {
      id: "cfg-roundtrip",
      name: "Test",
      productId: "p1",
      version: 1,
      status: "Draft",
      // Simulates what the Builder serializes on save: two steps, distinct mediaIds.
      stepsJson: JSON.stringify([
        { id: "stepA", order: 1, title: "Step A", description: "", overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true, mediaIds: ["photoA"], decisionsEnabled: false, decisions: [], inputs: [], nextStepId: "stepB" },
        { id: "stepB", order: 2, title: "Step B", description: "", overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true, mediaIds: ["videoB"], decisionsEnabled: false, decisions: [], inputs: [], nextStepId: null },
      ]),
      mediaJson: JSON.stringify([
        { id: "photoA", type: "image", name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 },
        { id: "videoB", type: "video", name: "videoB.mp4", size: 200, mime: "video/mp4", url: "/media/videoB", createdAt: 2 },
      ]),
      featureSelectionsJson: "[]",
      configType: "Install",
      displayName: "Test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = parseWorkflowFromConfig(cfg);
    const reloaded = parsed ? mergeWorkflowConfigMedia(parsed, cfg) : null;

    const stepA = reloaded?.steps.find((s) => s.id === "stepA");
    const stepB = reloaded?.steps.find((s) => s.id === "stepB");

    expect(stepA?.mediaIds).toEqual(["photoA"]);
    expect(stepB?.mediaIds).toEqual(["videoB"]);
    expect(reloaded?.media).toHaveLength(2);
  });
});
