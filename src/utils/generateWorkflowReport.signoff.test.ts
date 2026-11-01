/**
 * SIGN-OFF block for every signature state. A customer waiver is recorded as
 * run.signatureStatus = "WaivedCustomer" with NO customer signature event (waive-customer-signature,
 * paper completion and inspection import all work that way), so the customer column must say the
 * signature was waived instead of showing an empty "Sign here" box — and the installer's real
 * signature must still render, with nothing fabricated for the customer.
 * Real jsPDF (jsdom); text()/addImage() are spied on a real instance and call through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as jspdfModule from "jspdf";
import { generateWorkflowReport } from "./generateWorkflowReport";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import type { SignatureEvent } from "../types/signature";

// 1×1 PNG — a genuine image so jsPDF's addImage really embeds it.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const asset = { id: "asset-1", projectId: "p", productId: "x", assetTag: "CM-102", status: "Closed", featureValuesJson: "{}", issuesJson: "[]", createdAt: "", updatedAt: "" } as unknown as ProjectAsset;

function run(signatureStatus: string): AssetWorkflowRun {
  return {
    id: "run-1", assetId: "asset-1", workflowConfigId: "cfg-1", workflowVersion: 1,
    workflowSnapshotJson: JSON.stringify({ stepsJson: "[]" }), status: "Complete", isLocked: true,
    stepResultsJson: "[]", issuesJson: "[]", timeTrackingJson: "[]", productiveSeconds: 0, downtimeSeconds: 0,
    downtimeEvents: 0, runNumber: 1, signatureStatus,
    startedAt: "2026-10-20T00:00:00.000Z", completedAt: "2026-10-20T03:00:00.000Z", createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T03:00:00.000Z",
  } as unknown as AssetWorkflowRun;
}

const installer: SignatureEvent = {
  id: "e1", runId: "run-1", signerRole: "Installer", signerName: "Tess Tech", signedAtUtc: "2026-10-20T03:05:00.000Z",
  hasDrawnSignature: true, signatureData: PNG, reasonCode: "Completed",
};
const customerSigned: SignatureEvent = {
  id: "e2", runId: "run-1", signerRole: "Customer", signerName: "Cora Customer", signedAtUtc: "2026-10-20T04:00:00.000Z",
  hasDrawnSignature: true, signatureData: PNG, reasonCode: "Completed",
};
const customerDeclined: SignatureEvent = {
  ...customerSigned, id: "e3", hasDrawnSignature: false, signatureData: undefined, reasonCode: "Declined", notes: "Gland not sealed",
};

type TextCall = { text: string; x: number; y: number };
type ImageCall = { x: number; y: number };

// Image.onload never fires in jsdom; the generator awaits it to size the signature.
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 240;
  naturalHeight = 80;
  set src(_v: string) { queueMicrotask(() => this.onload?.()); }
}
const RealImage = globalThis.Image;
beforeEach(() => { (globalThis as { Image: unknown }).Image = LoadingImage; });
afterEach(() => { (globalThis as { Image: unknown }).Image = RealImage; });

async function render(signatureStatus: string, signatureEvents: SignatureEvent[]) {
  const RealJsPDF = jspdfModule.jsPDF;
  const texts: TextCall[] = [];
  const images: ImageCall[] = [];
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  const spy = vi.spyOn(jspdfModule, "jsPDF").mockImplementation(function (this: unknown, ...args: unknown[]) {
    const inst = new RealJsPDF(...(args as ConstructorParameters<typeof RealJsPDF>)) as InstanceType<typeof RealJsPDF>;
    const text = inst.text.bind(inst);
    const addImage = inst.addImage.bind(inst);
    const rect = inst.rect.bind(inst);
    vi.spyOn(inst, "text").mockImplementation(((...a: Parameters<typeof text>) => {
      const [t, x, y] = a as unknown as [unknown, number, number];
      for (const s of Array.isArray(t) ? t : [t]) texts.push({ text: String(s), x, y });
      return text(...a);
    }) as never);
    vi.spyOn(inst, "addImage").mockImplementation(((...a: unknown[]) => {
      images.push({ x: a[2] as number, y: a[3] as number });
      return (addImage as (...b: unknown[]) => unknown)(...a);
    }) as never);
    vi.spyOn(inst, "rect").mockImplementation(((...a: Parameters<typeof rect>) => {
      const [x, y, w, h] = a as unknown as number[];
      rects.push({ x, y, w, h });
      return rect(...a);
    }) as never);
    return inst;
  } as unknown as typeof RealJsPDF);
  try {
    await generateWorkflowReport({ run: run(signatureStatus), asset, workflowConfigName: "HA-Coal SAT", jobNumber: "J000376", signatureEvents, outputMode: "blob" });
  } finally {
    spy.mockRestore();
  }
  const bar = texts.find((t) => t.text === "SIGN-OFF")!;
  const after = texts.filter((t) => t.y > bar.y);
  const colSplit = texts.find((t) => t.text === "CUSTOMER APPROVAL")!.x;
  return {
    texts: after.map((t) => t.text),
    techCol: after.filter((t) => t.x < colSplit).map((t) => t.text),
    custCol: after.filter((t) => t.x >= colSplit).map((t) => t.text),
    techImages: images.filter((i) => i.x < colSplit).length,
    custImages: images.filter((i) => i.x >= colSplit).length,
    barTextY: bar.y,
    headingY: texts.find((t) => t.text === "TECHNICIAN SIGN-OFF")!.y,
    rects,
  };
}

const WAIVER = "Customer signature waived";

describe("report SIGN-OFF block — every signature state", () => {
  it("Signed: both signatures render; no blank box, no waiver notice", async () => {
    const r = await render("Signed", [installer, customerSigned]);
    expect(r.techImages).toBe(1);
    expect(r.custImages).toBe(1);
    expect(r.custCol).toContain("Name: Cora Customer");
    expect(r.texts).not.toContain("Sign here");
    expect(r.texts.join("\n")).not.toMatch(/waived/i);
  });

  it("PendingCustomer: installer signature + an empty customer box to sign, no waiver notice", async () => {
    const r = await render("PendingCustomer", [installer]);
    expect(r.techImages).toBe(1);
    expect(r.techCol).toContain("Name: Tess Tech");
    expect(r.custImages).toBe(0);
    expect(r.custCol).toContain("Sign here");
    expect(r.custCol).toContain("Name / Date");
    expect(r.texts.join("\n")).not.toMatch(/waived/i);
  });

  it("Declined: the customer's declined outcome and reason render; no blank box, no waiver notice", async () => {
    const r = await render("Declined", [installer, customerDeclined]);
    expect(r.techImages).toBe(1);
    expect(r.custCol).toEqual(expect.arrayContaining(["Name: Cora Customer", "Outcome: Declined", "Notes: Gland not sealed"]));
    expect(r.texts).not.toContain("Sign here");
    expect(r.texts.join("\n")).not.toMatch(/waived/i);
  });

  it("WaivedCustomer: explicit waiver notice instead of an empty customer box; installer signature preserved", async () => {
    const r = await render("WaivedCustomer", [installer]);
    expect(r.techImages).toBe(1);
    expect(r.techCol).toEqual(expect.arrayContaining(["Name: Tess Tech", "Outcome: Completed"]));
    expect(r.custCol).toContain(WAIVER);
    expect(r.custCol).not.toContain("Sign here");
    expect(r.custCol).not.toContain("Name / Date");
    // nothing fabricated for the customer
    expect(r.custImages).toBe(0);
    expect(r.custCol.some((t) => t.startsWith("Name:") || t.startsWith("Date:") || t.startsWith("Outcome:"))).toBe(false);
  });

  it("WaivedCustomer without an installer signature: technician box stays blank to sign — the waiver covers the customer only", async () => {
    const r = await render("WaivedCustomer", []);
    expect(r.techCol).toContain("Sign here");
    expect(r.techCol).not.toContain(WAIVER);
    expect(r.custCol).toContain(WAIVER);
    expect(r.custCol).not.toContain("Sign here");
    expect(r.techImages + r.custImages).toBe(0);
  });

  it("column headings sit clear of the SIGN-OFF bar (bar is 6.5 mm tall; 8 pt caps ≈ 2 mm)", async () => {
    const r = await render("Signed", [installer, customerSigned]);
    const barTop = r.barTextY - 4.4;
    const barBottom = barTop + 6.5;
    expect(r.headingY - 2.1).toBeGreaterThanOrEqual(barBottom + 0.5);
    // the signature boxes still fit the block reserved for them (58 mm from the bar top)
    const boxes = r.rects.filter((b) => b.h === 22 && b.y > barTop);
    expect(boxes).toHaveLength(2);
    for (const b of boxes) expect(b.y + b.h).toBeLessThan(barTop + 58);
  });
});
