import { describe, expect, it, beforeEach } from "vitest";
import type { WorkflowConfig } from "../types/workflowConfig";
import {
  _clearWorkflowOpenCacheForTests,
  getCachedWorkflowShell,
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
});
