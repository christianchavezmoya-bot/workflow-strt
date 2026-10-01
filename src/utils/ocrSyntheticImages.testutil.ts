/**
 * Test-only synthetic label images for the OCR geometry tests. Characters are ink blocks placed
 * along a (possibly sloped or curved) centre line — enough to exercise component analysis, line
 * grouping, edge handling and deskew deterministically, with no dependence on any OCR engine.
 */
import type { GrayImage } from "./ocrPreprocess";

export const PAPER = 235;
export const INK = 30;

export function blank(width: number, height: number, bg = PAPER): GrayImage {
  return { data: new Uint8ClampedArray(width * height).fill(bg), width, height };
}

/** Fills a rect (clipped to the image — so a rect past the edge models a cut character). */
export function fillRect(img: GrayImage, x: number, y: number, w: number, h: number, value = INK): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(img.width, Math.round(x + w));
  const y1 = Math.min(img.height, Math.round(y + h));
  for (let yy = y0; yy < y1; yy += 1) img.data.fill(value, yy * img.width + x0, yy * img.width + x1);
}

export interface TextRun {
  /** Left edge of the first character. */
  x: number;
  /** Centre-line y at the first character. */
  centerY: number;
  count: number;
  charH: number;
  charW?: number;
  /** Gap between characters (default 0.25·charH). */
  gap?: number;
  /** Centre-line slope (dy/dx). */
  slope?: number;
  /** Parabolic sag: centre y += curve·((x − mid)/halfWidth)² · charH. */
  curve?: number;
  /** Indices of characters to draw as small baseline dots (like the "." in 19.0006X). */
  dots?: number[];
  value?: number;
}

/** Draws a run of block "characters"; returns each character's rect for assertions. */
export function drawRun(img: GrayImage, run: TextRun): Array<{ x: number; y: number; w: number; h: number }> {
  const charW = run.charW ?? Math.round(run.charH * 0.6);
  const gap = run.gap ?? Math.round(run.charH * 0.25);
  const total = run.count * charW + (run.count - 1) * gap;
  const mid = run.x + total / 2;
  const half = total / 2 || 1;
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < run.count; i += 1) {
    const x = run.x + i * (charW + gap);
    const xc = x + charW / 2;
    const yc = run.centerY + (run.slope ?? 0) * (xc - run.x) + (run.curve ?? 0) * ((xc - mid) / half) ** 2 * run.charH;
    if (run.dots?.includes(i)) {
      const d = Math.max(3, Math.round(run.charH * 0.18));
      const r = { x: xc - d / 2, y: yc + run.charH / 2 - d, w: d, h: d };
      fillRect(img, r.x, r.y, r.w, r.h, run.value);
      rects.push(r);
      continue;
    }
    const r = { x, y: yc - run.charH / 2, w: charW, h: run.charH };
    fillRect(img, r.x, r.y, r.w, r.h, run.value);
    rects.push(r);
  }
  return rects;
}

export function toRgba(img: GrayImage): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (let p = 0; p < img.data.length; p += 1) out.set([img.data[p], img.data[p], img.data[p], 255], p * 4);
  return out;
}

/** Rows (y) that contain at least one pixel darker than `threshold`. */
export function inkRows(img: GrayImage, threshold = 128): number[] {
  const rows: number[] = [];
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (img.data[y * img.width + x] < threshold) {
        rows.push(y);
        break;
      }
    }
  }
  return rows;
}
