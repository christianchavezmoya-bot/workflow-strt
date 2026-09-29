import { describe, expect, it } from "vitest";
import { compHeight, isolateTextLine } from "./ocrLineIsolation";
import { blank, drawRun, fillRect } from "./ocrSyntheticImages.testutil";

// Band geometry used throughout: 800×200 analysis image, guide on the centre row.
const W = 800;
const H = 200;
const GUIDE = H / 2;

function ok(result: ReturnType<typeof isolateTextLine>) {
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result;
}

describe("isolateTextLine — choosing the aimed line", () => {
  it("one centred line: selects all of its characters", () => {
    const img = blank(W, H);
    drawRun(img, { x: 250, centerY: GUIDE, count: 6, charH: 50 }); // e.g. 324775
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(6);
    expect(r.bbox.y).toBeCloseTo(75, -1);
    expect(r.bbox.height).toBeCloseTo(50, -1);
    expect(r.medianHeight).toBeCloseTo(50, -1);
  });

  it("two lines (C250 above 12/24V): the line on the guide wins, the other is rejected", () => {
    const img = blank(W, H);
    drawRun(img, { x: 300, centerY: 32, count: 4, charH: 40 }); // C250 — above the guide
    drawRun(img, { x: 260, centerY: GUIDE + 5, count: 6, charH: 40 }); // 12/24V — on it
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(6);
    expect(r.bbox.y).toBeGreaterThan(70);
    expect(r.others.length).toBeGreaterThanOrEqual(4);
  });

  it("…and aiming at the upper line selects that one instead (ranking follows the guide, not size)", () => {
    const img = blank(W, H);
    drawRun(img, { x: 300, centerY: 60, count: 4, charH: 40 });
    drawRun(img, { x: 260, centerY: 140, count: 6, charH: 40 });
    const r = ok(isolateTextLine(img, 60));
    expect(r.selected).toHaveLength(4);
  });

  it("a neighbouring PARTIAL line cut by the top edge is ignored", () => {
    const img = blank(W, H);
    drawRun(img, { x: 200, centerY: 5, count: 8, charH: 40 }); // bottoms of a line above
    drawRun(img, { x: 280, centerY: GUIDE, count: 5, charH: 45 });
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(5);
    expect(r.selected.every((c) => c.y0 > 50)).toBe(true);
  });

  it("a neighbouring PARTIAL line cut by the bottom edge is ignored", () => {
    const img = blank(W, H);
    drawRun(img, { x: 280, centerY: GUIDE, count: 5, charH: 45 });
    drawRun(img, { x: 150, centerY: H - 4, count: 9, charH: 40 });
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(5);
    expect(r.selected.every((c) => c.y1 < 150)).toBe(true);
  });

  it("unrelated text further along the same row (wide gap) is not part of the value", () => {
    const img = blank(W, H);
    drawRun(img, { x: 300, centerY: GUIDE, count: 6, charH: 40 }); // the value, centred
    drawRun(img, { x: 30, centerY: GUIDE, count: 3, charH: 40 }); // far-left label text
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(6);
    expect(r.bbox.x).toBeGreaterThanOrEqual(295);
  });

  it("keeps words of one value together (317931 3824 / Christian Chavez)", () => {
    const img = blank(W, H);
    drawRun(img, { x: 150, centerY: GUIDE, count: 6, charH: 40 });
    drawRun(img, { x: 150 + 6 * 34 + 20, centerY: GUIDE, count: 4, charH: 40 }); // word gap ≈ 0.5h
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(10);
    expect(r.compact).toBe(false);
  });

  it("keeps small punctuation on the line (the '.' in 19.0006X)", () => {
    const img = blank(W, H);
    drawRun(img, { x: 250, centerY: GUIDE, count: 8, charH: 50, dots: [2] });
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(8);
    expect(r.compact).toBe(true);
  });

  it("folds i/j dots back into their line rather than masking them", () => {
    const img = blank(W, H);
    drawRun(img, { x: 250, centerY: GUIDE, count: 6, charH: 44 });
    fillRect(img, 250 + 1 * 37 + 10, GUIDE - 22 - 14, 7, 7); // a dot above the 2nd character
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(7);
  });
});

describe("isolateTextLine — band edges", () => {
  it("drops a sliced glyph of neighbouring text at the LEFT edge", () => {
    const img = blank(W, H);
    fillRect(img, -10, GUIDE - 20, 22, 40); // cut by x=0, well separated from the value
    drawRun(img, { x: 70, centerY: GUIDE, count: 6, charH: 40 });
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(6);
    expect(r.bbox.x).toBeGreaterThanOrEqual(65);
  });

  it("drops a sliced glyph of neighbouring text at the RIGHT edge", () => {
    const img = blank(W, H);
    drawRun(img, { x: 470, centerY: GUIDE, count: 6, charH: 40 });
    fillRect(img, W - 12, GUIDE - 20, 30, 40);
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(6);
    expect(r.bbox.x + r.bbox.width).toBeLessThan(W - 20);
  });

  it("reports CLIPPED when the value itself runs off the edge (never reads a partial value)", () => {
    const img = blank(W, H);
    drawRun(img, { x: -12, centerY: GUIDE, count: 8, charH: 40 }); // first character cut
    expect(isolateTextLine(img, GUIDE).status).toBe("clipped");
  });

  it("reports CLIPPED when the value's characters are cut by the top of the band", () => {
    const img = blank(W, H);
    drawRun(img, { x: 250, centerY: 22, count: 5, charH: 60 }); // tops sliced off by y=0
    expect(isolateTextLine(img, 25).status).toBe("clipped");
  });

  it("reports CLIPPED when the value's characters are cut by the bottom of the band", () => {
    const img = blank(W, H);
    drawRun(img, { x: 250, centerY: H - 22, count: 5, charH: 60 });
    expect(isolateTextLine(img, H - 25).status).toBe("clipped");
  });

  it("does NOT treat a character merely near the edge (antialiasing distance) as clipped", () => {
    const img = blank(W, H);
    drawRun(img, { x: 2, centerY: GUIDE, count: 6, charH: 40 });
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(6);
  });

  it("does NOT treat a single stray edge pixel touching the first character as a cut", () => {
    const img = blank(W, H);
    drawRun(img, { x: 3, centerY: GUIDE, count: 6, charH: 40 });
    fillRect(img, 0, GUIDE, 3, 1); // one-pixel whisker joining the character to the edge
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(6);
  });
});

describe("isolateTextLine — rotation, perspective and curved surfaces", () => {
  it("modest rotation (≈5° clockwise): one line, deskew recommended with the right angle", () => {
    const img = blank(W, H);
    drawRun(img, { x: 150, centerY: GUIDE - 25, count: 9, charH: 36, slope: Math.tan((5 * Math.PI) / 180) });
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(9);
    expect(r.deskew).toBe(true);
    expect((r.angle * 180) / Math.PI).toBeCloseTo(5, 0);
  });

  it("modest counter-clockwise rotation (≈−4°)", () => {
    const img = blank(W, H);
    drawRun(img, { x: 150, centerY: GUIDE + 20, count: 9, charH: 36, slope: Math.tan((-4 * Math.PI) / 180) });
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.deskew).toBe(true);
    expect((r.angle * 180) / Math.PI).toBeCloseTo(-4, 0);
  });

  it("perspective (characters shrinking along the line) still groups as one line", () => {
    const img = blank(W, H);
    [44, 42, 40, 38, 36, 34, 32].forEach((h, i) => fillRect(img, 200 + i * 45, GUIDE - h / 2 + i * 2, 26, h));
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(7);
  });

  it("curved (cylindrical) baseline — e.g. S4912/89 on a pipe: one line, not rotated", () => {
    const img = blank(W, H);
    drawRun(img, { x: 170, centerY: GUIDE - 12, count: 8, charH: 40, curve: 0.45 });
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected).toHaveLength(8);
    expect(r.deskew).toBe(false); // symmetric curve: no dominant slope to trust
  });

  it("does not rotate when the slope is beyond what the geometry can support", () => {
    const img = blank(W, H);
    drawRun(img, { x: 250, centerY: GUIDE - 40, count: 5, charH: 26, gap: 12, slope: Math.tan((25 * Math.PI) / 180) });
    const r = isolateTextLine(img, GUIDE);
    if (r.status === "ok") expect(r.deskew).toBe(false);
  });
});

describe("isolateTextLine — nothing to read", () => {
  it("blank band → no-text", () => {
    expect(isolateTextLine(blank(W, H), GUIDE).status).toBe("no-text");
  });

  it("only specks of noise → no-text", () => {
    const img = blank(W, H);
    for (let i = 0; i < 40; i += 1) fillRect(img, (i * 97) % W, (i * 53) % H, 2, 2);
    expect(isolateTextLine(img, GUIDE).status).toBe("no-text");
  });

  it("barcode bars / plate borders spanning the band are not text", () => {
    const img = blank(W, H);
    for (let i = 0; i < 30; i += 1) fillRect(img, 100 + i * 12, 0, 4 + (i % 3) * 2, H);
    fillRect(img, 0, 190, W, 6); // a horizontal plate edge
    expect(isolateTextLine(img, GUIDE).status).toBe("no-text");
  });

  it("text far from the guide → no-text (never silently reads some other line)", () => {
    const img = blank(W, H);
    drawRun(img, { x: 250, centerY: 25, count: 6, charH: 30 });
    expect(isolateTextLine(img, H - 10).status).toBe("no-text");
  });

  it("light text on a dark label is found once polarity is normalized by the caller", () => {
    const img = blank(W, H, 255 - 235);
    drawRun(img, { x: 250, centerY: GUIDE, count: 6, charH: 40, value: 255 - 30 });
    for (let i = 0; i < img.data.length; i += 1) img.data[i] = 255 - img.data[i];
    const r = ok(isolateTextLine(img, GUIDE));
    expect(r.selected.every((c) => compHeight(c) > 30)).toBe(true);
  });
});
