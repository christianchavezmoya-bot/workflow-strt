/**
 * Regression coverage for two production-reported defects, both fixed in generateWorkflowReport.ts:
 *
 * 1. The report header hardcoded "INSTALLATION RECORD" regardless of the workflow's actual type.
 *    It must now show "<TYPE> REPORT" (resolved by the caller from the real workflow-types
 *    catalog — never guessed/hardcoded here) plus the Asset Tag and Workflow Name.
 * 2. The step-number badge's text was vertically offset from the circle's true center by a fixed
 *    "+2.5" baseline offset. It must now use jsPDF's own baseline:"middle" centering.
 *
 * jsPDF actually runs here (jsdom) — these tests spy on its own text()/circle() methods so the
 * real coordinate math this file computes is what gets asserted on, not a stubbed re-implementation.
 */
import { describe, expect, it, vi } from "vitest";
import * as jspdfModule from "jspdf";
import { generateWorkflowReport, type GenerateReportParams } from "./generateWorkflowReport";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import type { WorkflowStep } from "../types/workflow";

function makeStep(overrides: Partial<WorkflowStep> & { id: string; order: number }): WorkflowStep {
  return {
    title: `Step ${overrides.order}`,
    description: "",
    overrideInReport: false,
    overrideReportText: "",
    includeDescriptionInReport: true,
    mediaIds: [],
    decisionsEnabled: false,
    decisions: [],
    inputs: [],
    nextStepId: null,
    ...overrides,
  };
}

function makeRun(steps: WorkflowStep[], overrides: Partial<AssetWorkflowRun> = {}): AssetWorkflowRun {
  return {
    id: "run-1",
    assetId: "asset-1",
    workflowConfigId: "cfg-1",
    workflowVersion: 1,
    workflowSnapshotJson: JSON.stringify({ stepsJson: JSON.stringify(steps) }),
    status: "Completed",
    isLocked: true,
    stepResultsJson: "[]",
    issuesJson: "[]",
    timeTrackingJson: "[]",
    productiveSeconds: 0,
    downtimeSeconds: 0,
    downtimeEvents: 0,
    runNumber: 1,
    signatureStatus: "None",
    startedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as AssetWorkflowRun;
}

function makeAsset(overrides: Partial<ProjectAsset> = {}): ProjectAsset {
  return {
    id: "asset-1",
    projectId: "proj-1",
    productId: "prod-1",
    assetTag: "DR040",
    status: "Completed",
    featureValuesJson: "{}",
    issuesJson: "[]",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ProjectAsset;
}

// jsPDF attaches text()/circle()/etc. as OWN properties on each instance inside its own
// constructor (a plugin-registration pattern), not on jsPDF.prototype — so there is nothing to
// spy on ahead of time. Instead, intercept the jsPDF constructor itself: let it build a real
// instance (so all the real coordinate/geometry math this file relies on still runs), then attach
// spies to THAT instance's own text()/circle() before generateWorkflowReport starts calling them.
async function renderAndCapture(params: Omit<GenerateReportParams, "outputMode">) {
  const RealJsPDF = jspdfModule.jsPDF;
  const textCalls: [string, number, number, Record<string, unknown>?][] = [];
  const circleCalls: [number, number, number, string][] = [];

  const ctorSpy = vi.spyOn(jspdfModule, "jsPDF").mockImplementation(
    function (this: unknown, ...args: unknown[]) {
      const instance = new RealJsPDF(
        ...(args as ConstructorParameters<typeof RealJsPDF>),
      ) as InstanceType<typeof RealJsPDF>;
      // text()/circle() are the REAL, still-bound-to-this-instance closures at this point —
      // capture them before replacing, so the spy can call straight back into the real geometry
      // logic (autoTable and everything else this file draws still renders normally).
      const originalText = instance.text.bind(instance);
      const originalCircle = instance.circle.bind(instance);
      vi.spyOn(instance, "text").mockImplementation((...callArgs: unknown[]) => {
        textCalls.push(callArgs as [string, number, number, Record<string, unknown>?]);
        return originalText(...(callArgs as Parameters<typeof originalText>));
      });
      vi.spyOn(instance, "circle").mockImplementation((...callArgs: unknown[]) => {
        circleCalls.push(callArgs as [number, number, number, string]);
        return originalCircle(...(callArgs as Parameters<typeof originalCircle>));
      });
      return instance;
    } as unknown as typeof RealJsPDF,
  );

  try {
    await generateWorkflowReport({ ...params, outputMode: "blob" });
  } finally {
    ctorSpy.mockRestore();
  }
  return { textCalls, circleCalls };
}

describe("generateWorkflowReport — report title / Asset Tag / Workflow Name header", () => {
  const steps = [makeStep({ id: "s1", order: 1 })];

  // Required test #1 + #8: installation workflow report
  it("renders 'INSTALLATION REPORT' for an Installation workflow", async () => {
    const { textCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset({ assetTag: "DR040" }),
      workflowConfigName: "Refuge Chamber Site Audit",
      reportTypeLabel: "Installation",
    });
    expect(textCalls.some(([t]) => t === "INSTALLATION REPORT")).toBe(true);
    expect(textCalls.some(([t]) => t === "DR040")).toBe(true);
    expect(textCalls.some(([t]) => t === "Refuge Chamber Site Audit")).toBe(true);
  });

  // Required test #2 + #4: inspection workflow, dynamic title
  it("renders 'INSPECTION REPORT' — not 'Installation' — for an Inspection workflow", async () => {
    const { textCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset({ assetTag: "DR040" }),
      workflowConfigName: "Refuge Chamber Site Audit",
      reportTypeLabel: "Inspection",
    });
    expect(textCalls.some(([t]) => t === "INSPECTION REPORT")).toBe(true);
    expect(textCalls.some(([t]) => typeof t === "string" && t.includes("INSTALLATION"))).toBe(false);
  });

  // Required test #3: at least one additional real supported workflow type
  it("renders 'COMMISSIONING REPORT' for a Commissioning workflow", async () => {
    const { textCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset({ assetTag: "CM-102" }),
      workflowConfigName: "HA-Coal_CM_Full_PDS_Commissioning_SAT",
      reportTypeLabel: "Commissioning",
    });
    expect(textCalls.some(([t]) => t === "COMMISSIONING REPORT")).toBe(true);
    expect(textCalls.some(([t]) => t === "CM-102")).toBe(true);
    expect(textCalls.some(([t]) => t === "HA-Coal_CM_Full_PDS_Commissioning_SAT")).toBe(true);
  });

  // Required test #8: non-installation workflow does not show "Installation Report"
  it("never renders 'INSTALLATION REPORT' for a Repair workflow", async () => {
    const { textCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset(),
      workflowConfigName: "Wiring Repair",
      reportTypeLabel: "Repair",
    });
    expect(textCalls.some(([t]) => t === "REPAIR REPORT")).toBe(true);
    expect(textCalls.some(([t]) => t === "INSTALLATION REPORT")).toBe(false);
  });

  it("falls back to 'INSTALLATION REPORT' when no type label is resolvable (original behavior preserved)", async () => {
    const { textCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset(),
      workflowConfigName: "Legacy Config",
      // reportTypeLabel omitted entirely
    });
    expect(textCalls.some(([t]) => t === "INSTALLATION REPORT")).toBe(true);
  });

  // Required test #7: missing Asset Tag handled cleanly — never "undefined"/dangling
  it("never renders 'undefined' or a dangling line when Asset Tag is missing", async () => {
    const { textCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset({ assetTag: "" }),
      workflowConfigName: "Refuge Chamber Site Audit",
      reportTypeLabel: "Inspection",
    });
    const flat = textCalls.map(([t]) => t);
    expect(flat).not.toContain("undefined");
    expect(flat).not.toContain("null");
    expect(flat.some((t) => typeof t === "string" && /undefined|null/i.test(t))).toBe(false);
    // Workflow Name alone still renders — no dangling separator/blank line in its place.
    expect(flat).toContain("Refuge Chamber Site Audit");
  });

  it("never renders 'undefined' when Workflow Name is missing", async () => {
    const { textCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset({ assetTag: "DR040" }),
      workflowConfigName: "",
      reportTypeLabel: "Inspection",
    });
    const flat = textCalls.map(([t]) => t);
    expect(flat.some((t) => typeof t === "string" && /undefined|null/i.test(t))).toBe(false);
    expect(flat).toContain("DR040");
  });

  it("still centers a bare title when both Asset Tag and Workflow Name are missing", async () => {
    const { textCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset({ assetTag: "" }),
      workflowConfigName: "",
      reportTypeLabel: "Inspection",
    });
    const titleCall = textCalls.find(([t]) => t === "INSPECTION REPORT");
    expect(titleCall).toBeDefined();
    expect(titleCall?.[3]).toMatchObject({ align: "center", baseline: "middle" });
  });
});

describe("generateWorkflowReport — step-number badge centering", () => {
  // Required test #9: single-digit step number
  it("centers a single-digit step number on the circle using baseline:middle, not a fixed y-offset", async () => {
    const { textCalls, circleCalls } = await renderAndCapture({
      run: makeRun([makeStep({ id: "s1", order: 1 })]),
      asset: makeAsset(),
      workflowConfigName: "Test",
      includeAllSteps: true,
    });
    expect(circleCalls).toHaveLength(1);
    const [cx, cy] = circleCalls[0];
    const badgeCall = textCalls.find(([t]) => t === "01");
    expect(badgeCall).toBeDefined();
    const [, x, y, opts] = badgeCall!;
    expect(x).toBe(cx);
    expect(y).toBe(cy); // same y as the circle's own center — no "+2.5" (or any) manual offset
    expect(opts).toMatchObject({ align: "center", baseline: "middle" });
  });

  // Required test #10: double-digit step number
  it("centers a double-digit step number identically to a single-digit one", async () => {
    const steps = Array.from({ length: 12 }, (_, i) => makeStep({ id: `s${i + 1}`, order: i + 1 }));
    const { textCalls, circleCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset(),
      workflowConfigName: "Test",
      includeAllSteps: true,
    });
    const lastCircle = circleCalls[circleCalls.length - 1];
    const [cx, cy] = lastCircle;
    const badgeCall = textCalls.find(([t]) => t === "12");
    expect(badgeCall).toBeDefined();
    const [, x, y, opts] = badgeCall!;
    expect(x).toBe(cx);
    expect(y).toBe(cy);
    expect(opts).toMatchObject({ align: "center", baseline: "middle" });
  });

  it("every step badge uses the same centering contract (no per-number special-casing)", async () => {
    const steps = Array.from({ length: 3 }, (_, i) => makeStep({ id: `s${i + 1}`, order: i + 1 }));
    const { textCalls, circleCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset: makeAsset(),
      workflowConfigName: "Test",
      includeAllSteps: true,
    });
    expect(circleCalls).toHaveLength(3);
    circleCalls.forEach(([cx, cy], i) => {
      const label = String(i + 1).padStart(2, "0");
      const badgeCall = textCalls.find(([t]) => t === label);
      expect(badgeCall, `badge text for step ${label}`).toBeDefined();
      expect(badgeCall![1]).toBe(cx);
      expect(badgeCall![2]).toBe(cy);
      expect(badgeCall![3]).toMatchObject({ align: "center", baseline: "middle" });
    });
  });
});
