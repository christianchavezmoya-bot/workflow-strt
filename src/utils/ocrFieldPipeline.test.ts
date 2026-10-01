import { describe, expect, it } from "vitest";
import {
  OCR_TARGET_CHAR_HEIGHT,
  planOcrPasses,
  prepareFieldOcr,
  PSM_RAW_LINE,
  PSM_SINGLE_LINE,
  PSM_SINGLE_WORD,
  type PreparedFieldOcr,
} from "./ocrFieldPipeline";
import type { GrayImage } from "./ocrPreprocess";
import { blank, drawRun, fillRect, inkRows, toRgba } from "./ocrSyntheticImages.testutil";

function prepare(img: GrayImage, guideY = img.height / 2) {
  return prepareFieldOcr(toRgba(img), img.width, img.height, guideY);
}

function ok(p: PreparedFieldOcr) {
  if (p.status !== "ok") throw new Error(`expected ok, got ${p.status}`);
  return p;
}

const variant = (p: Extract<PreparedFieldOcr, { status: "ok" }>, id: string) => p.variants.find((v) => v.id === id)!.image;

describe("prepareFieldOcr — from target band to OCR-ready line images", () => {
  it("isolates the aimed line and scales characters to the OCR target height", () => {
    const img = blank(1200, 300); // full-res band (analysis copy will be downscaled)
    drawRun(img, { x: 380, centerY: 150, count: 6, charH: 70 });
    const p = ok(prepare(img));
    const line = variant(p, "normalized");
    const rows = inkRows(line);
    const charHeight = rows[rows.length - 1] - rows[0] + 1;
    expect(charHeight).toBeGreaterThan(OCR_TARGET_CHAR_HEIGHT * 0.85);
    expect(charHeight).toBeLessThan(OCR_TARGET_CHAR_HEIGHT * 1.2);
    // Quiet zone on every side.
    expect(rows[0]).toBeGreaterThanOrEqual(12);
    expect(line.height - 1 - rows[rows.length - 1]).toBeGreaterThanOrEqual(12);
  });

  it("masks a neighbouring line that intrudes into the line margin (C250 above 12/24V)", () => {
    const img = blank(800, 200);
    drawRun(img, { x: 300, centerY: 100, count: 6, charH: 40 }); // the aimed value
    drawRun(img, { x: 280, centerY: 52, count: 4, charH: 40 }); // line above, ~8px clear of it
    const p = ok(prepare(img));
    const line = variant(p, "normalized");
    const rows = inkRows(line);
    // Only ONE band of ink rows (the value) — none from the line above.
    const contiguous = rows.every((r, i) => i === 0 || r === rows[i - 1] + 1);
    expect(contiguous).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(OCR_TARGET_CHAR_HEIGHT + 4);
  });

  it("deskews a moderately rotated label, and leaves a level one alone", () => {
    const tilted = blank(800, 200);
    drawRun(tilted, { x: 150, centerY: 80, count: 9, charH: 36, slope: Math.tan((5 * Math.PI) / 180) });
    const t = ok(prepare(tilted));
    expect(t.deskewDegrees).toBeCloseTo(-5, 0);
    const rows = inkRows(variant(t, "normalized"));
    expect(rows.length).toBeLessThan(OCR_TARGET_CHAR_HEIGHT * 1.35); // levelled, not a tall slanted band

    const level = blank(800, 200);
    drawRun(level, { x: 250, centerY: 100, count: 6, charH: 40 });
    expect(ok(prepare(level)).deskewDegrees).toBe(0);
  });

  it("does not rotate a curved-surface (cylindrical) line", () => {
    const img = blank(800, 200);
    drawRun(img, { x: 170, centerY: 88, count: 8, charH: 40, curve: 0.45 });
    expect(ok(prepare(img)).deskewDegrees).toBe(0);
  });

  it("white print on a dark label comes out as dark text on light paper", () => {
    const img = blank(800, 200, 25);
    drawRun(img, { x: 300, centerY: 100, count: 5, charH: 40, value: 230 });
    const line = variant(ok(prepare(img)), "normalized");
    expect(line.data[0]).toBeGreaterThan(200); // paper corner
    expect(inkRows(line).length).toBeGreaterThan(20); // dark text present
  });

  it("produces a bounded set of variants — no inverted variant when polarity is clear", () => {
    const img = blank(800, 200);
    drawRun(img, { x: 300, centerY: 100, count: 5, charH: 40 });
    const p = ok(prepare(img));
    expect(p.variants.map((v) => v.id)).toEqual(["normalized", "flattened"]);
  });

  it("adds an inverted variant only when the background level is ambiguous", () => {
    // Label edge on dark casing: ~half the band is dark metal, half white label.
    const img = blank(800, 200);
    fillRect(img, 0, 0, 370, 200, 25);
    drawRun(img, { x: 420, centerY: 100, count: 5, charH: 40 });
    const p = ok(prepare(img));
    expect(p.variants.map((v) => v.id)).toContain("inverted");
    expect(p.variants.length).toBeLessThanOrEqual(3);
  });

  it("propagates clipped / no-text instead of guessing", () => {
    const clipped = blank(800, 200);
    drawRun(clipped, { x: -12, centerY: 100, count: 8, charH: 40 });
    expect(prepare(clipped).status).toBe("clipped");
    expect(prepare(blank(800, 200)).status).toBe("no-text");
  });

  it("is deterministic: identical input → byte-identical variants", () => {
    const img = blank(900, 220);
    drawRun(img, { x: 200, centerY: 105, count: 8, charH: 44, slope: 0.05, dots: [3] });
    fillRect(img, 0, 0, 900, 3, 90);
    const a = ok(prepare(img));
    const b = ok(prepare({ ...img, data: new Uint8ClampedArray(img.data) }));
    expect(a.variants.map((v) => Array.from(v.image.data))).toEqual(b.variants.map((v) => Array.from(v.image.data)));
  });

  it("reports the isolated line in band (source) pixels", () => {
    const img = blank(1200, 300);
    drawRun(img, { x: 380, centerY: 150, count: 6, charH: 70 });
    const p = ok(prepare(img));
    expect(p.lineRect.x).toBeCloseTo(380, -1);
    expect(p.lineRect.y).toBeCloseTo(115, -1);
  });
});

describe("planOcrPasses — small, deterministic, never automatic page segmentation", () => {
  const base = { status: "ok" as const, deskewDegrees: 0, lineRect: { x: 0, y: 0, width: 1, height: 1 } };
  const img = { data: new Uint8ClampedArray(1), width: 1, height: 1 };

  it("compact single token: line, flattened line, then single-word", () => {
    const passes = planOcrPasses({ ...base, compact: true, variants: [{ id: "normalized", image: img }, { id: "flattened", image: img }] });
    expect(passes.map((p) => [p.variant, p.psm])).toEqual([
      ["normalized", PSM_SINGLE_LINE],
      ["flattened", PSM_SINGLE_LINE],
      ["normalized", PSM_SINGLE_WORD],
    ]);
  });

  it("multi-word value: raw-line instead of single-word", () => {
    const passes = planOcrPasses({ ...base, compact: false, variants: [{ id: "normalized", image: img }, { id: "flattened", image: img }] });
    expect(passes[2].psm).toBe(PSM_RAW_LINE);
  });

  it("at most 4 passes, and never PSM AUTO (3) / sparse modes", () => {
    const passes = planOcrPasses({
      ...base,
      compact: false,
      variants: [{ id: "normalized", image: img }, { id: "flattened", image: img }, { id: "inverted", image: img }],
    });
    expect(passes).toHaveLength(4);
    expect(passes.every((p) => ["7", "8", "13"].includes(p.psm))).toBe(true);
  });
});
