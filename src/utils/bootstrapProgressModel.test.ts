import { describe, expect, it } from "vitest";
import { bootstrapOverallPercent, bootstrapStepLabel } from "./bootstrapProgressModel";

describe("bootstrapProgressModel", () => {
  it("caps overall percent below 100 mid-download", () => {
    expect(bootstrapOverallPercent("linked-configs", 3, 3)).toBeLessThan(100);
    expect(bootstrapOverallPercent("linked-configs", 3, 3)).toBeGreaterThan(0);
  });

  it("reaches higher percent on later phases", () => {
    const early = bootstrapOverallPercent("reference", 1, 1);
    const late = bootstrapOverallPercent("workflows", 5, 10);
    expect(late).toBeGreaterThan(early);
  });

  it("formats step label with phase index", () => {
    expect(bootstrapStepLabel("linked-configs", 2, 3)).toContain("step 5/10");
    expect(bootstrapStepLabel("linked-configs", 2, 3)).toContain("Workflow configs");
  });
});
