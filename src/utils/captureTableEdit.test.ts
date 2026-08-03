import { describe, expect, it } from "vitest";
import { isCaptureColumnEditable, patchCaptureCellValue } from "./captureTableEdit";

describe("captureTableEdit", () => {
  it("patches an existing step value", () => {
    const json = JSON.stringify([
      { stepId: "s1", values: { f1: "old" }, completedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const next = patchCaptureCellValue(json, { stepId: "s1", inputId: "f1" }, "new");
    const parsed = JSON.parse(next) as Array<{ values: Record<string, string> }>;
    expect(parsed[0].values.f1).toBe("new");
  });

  it("creates a step result when missing", () => {
    const next = patchCaptureCellValue("[]", { stepId: "s2", inputId: "serial" }, "ABC123");
    const parsed = JSON.parse(next) as Array<{ stepId: string; values: Record<string, string> }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].stepId).toBe("s2");
    expect(parsed[0].values.serial).toBe("ABC123");
  });

  it("respects iterationIndex when matching steps", () => {
    const json = JSON.stringify([
      { stepId: "s1", iterationIndex: 0, values: { f1: "a" }, completedAt: "2026-01-01T00:00:00.000Z" },
      { stepId: "s1", iterationIndex: 1, values: { f1: "b" }, completedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const next = patchCaptureCellValue(json, { stepId: "s1", inputId: "f1", iterationIndex: 1 }, "B2");
    const parsed = JSON.parse(next) as Array<{ iterationIndex?: number; values: Record<string, string> }>;
    expect(parsed.find((r) => r.iterationIndex === 1)?.values.f1).toBe("B2");
    expect(parsed.find((r) => (r.iterationIndex ?? 0) === 0)?.values.f1).toBe("a");
  });

  it("blocks photo/video/signature columns from inline edit", () => {
    expect(isCaptureColumnEditable("photo")).toBe(false);
    expect(isCaptureColumnEditable("capture:video")).toBe(false);
    expect(isCaptureColumnEditable("signature")).toBe(false);
    expect(isCaptureColumnEditable("text")).toBe(true);
  });
});
