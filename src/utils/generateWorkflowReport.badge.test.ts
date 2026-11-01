/**
 * Step-number badge centering in the workflow PDF (remaining fix from PR #375; its report-title
 * work has since been delivered on main by #379, so only the badge fix is carried over).
 *
 * jsPDF really runs here (jsdom). Its text()/circle() are own properties set per instance, so the
 * constructor is intercepted: a REAL instance is built and its own methods are wrapped with spies
 * that still call through, so the coordinates asserted are the ones this file actually computes.
 */
import { describe, expect, it, vi } from "vitest";
import * as jspdfModule from "jspdf";
import { generateWorkflowReport, type GenerateReportParams } from "./generateWorkflowReport";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import type { WorkflowStep } from "../types/workflow";

function makeStep(order: number): WorkflowStep {
  return {
    id: `s${order}`,
    order,
    title: `Step ${order}`,
    description: "",
    overrideInReport: false,
    overrideReportText: "",
    includeDescriptionInReport: true,
    mediaIds: [],
    decisionsEnabled: false,
    decisions: [],
    inputs: [],
    nextStepId: null,
  } as WorkflowStep;
}

function makeRun(steps: WorkflowStep[]): AssetWorkflowRun {
  return {
    id: "run-1",
    assetId: "asset-1",
    workflowConfigId: "cfg-1",
    workflowVersion: 1,
    workflowSnapshotJson: JSON.stringify({ stepsJson: JSON.stringify(steps) }),
    status: "Complete",
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
  } as AssetWorkflowRun;
}

const asset = {
  id: "asset-1",
  projectId: "proj-1",
  productId: "prod-1",
  assetTag: "DR040",
  status: "Complete",
  featureValuesJson: "{}",
  issuesJson: "[]",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as ProjectAsset;

async function renderAndCapture(params: Omit<GenerateReportParams, "outputMode">) {
  const RealJsPDF = jspdfModule.jsPDF;
  const textCalls: [unknown, number, number, Record<string, unknown>?][] = [];
  const circleCalls: [number, number, number, string][] = [];
  const ctorSpy = vi.spyOn(jspdfModule, "jsPDF").mockImplementation(function (this: unknown, ...args: unknown[]) {
    const instance = new RealJsPDF(...(args as ConstructorParameters<typeof RealJsPDF>)) as InstanceType<typeof RealJsPDF>;
    const originalText = instance.text.bind(instance);
    const originalCircle = instance.circle.bind(instance);
    vi.spyOn(instance, "text").mockImplementation((...callArgs: unknown[]) => {
      textCalls.push(callArgs as [unknown, number, number, Record<string, unknown>?]);
      return originalText(...(callArgs as Parameters<typeof originalText>));
    });
    vi.spyOn(instance, "circle").mockImplementation((...callArgs: unknown[]) => {
      circleCalls.push(callArgs as [number, number, number, string]);
      return originalCircle(...(callArgs as Parameters<typeof originalCircle>));
    });
    return instance;
  } as unknown as typeof RealJsPDF);
  try {
    await generateWorkflowReport({ ...params, outputMode: "blob" });
  } finally {
    ctorSpy.mockRestore();
  }
  return { textCalls, circleCalls };
}

describe("generateWorkflowReport — step-number badge centering", () => {
  it("draws a single-digit step number at the circle's own centre, with baseline:middle", async () => {
    const { textCalls, circleCalls } = await renderAndCapture({
      run: makeRun([makeStep(1)]),
      asset,
      workflowConfigName: "Refuge Chamber Site Audit",
      includeAllSteps: true,
    });
    expect(circleCalls).toHaveLength(1);
    const [cx, cy] = circleCalls[0];
    const badge = textCalls.find(([t]) => t === "01");
    expect(badge).toBeDefined();
    const [, x, y, opts] = badge!;
    expect(x).toBe(cx);
    expect(y).toBe(cy); // no fixed "+2.5" (or any) manual baseline offset
    expect(opts).toMatchObject({ align: "center", baseline: "middle" });
  });

  it("centres a double-digit step number exactly like a single-digit one", async () => {
    const steps = Array.from({ length: 12 }, (_, i) => makeStep(i + 1));
    const { textCalls, circleCalls } = await renderAndCapture({
      run: makeRun(steps),
      asset,
      workflowConfigName: "Twelve Step Check",
      includeAllSteps: true,
    });
    const badge = textCalls.find(([t]) => t === "12");
    expect(badge).toBeDefined();
    const [, x, y, opts] = badge!;
    // Some badge circle is centred exactly where "12" is drawn (no offset for two digits either).
    const circle = circleCalls.find(([cx, cy]) => cx === x && cy === y);
    expect(circle).toBeDefined();
    expect(opts).toMatchObject({ align: "center", baseline: "middle" });
  });
});
