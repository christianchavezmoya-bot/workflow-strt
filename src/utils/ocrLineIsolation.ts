/**
 * Finds the ONE text line the technician aimed at inside the OCR target band, so Tesseract reads
 * that line — not the whole band with its neighbouring lines, logo edges, borders and clipped
 * fragments. Pure geometry on a grayscale analysis image: no OCR, no string heuristics, no
 * knowledge of any particular value.
 *
 *   1. local (adaptive) threshold → ink mask            — only to FIND text; never sent to OCR
 *   2. 8-connected components → character candidates
 *   3. drop structure: band-spanning bars (barcodes, borders), long rules, specks
 *   4. chain components into lines by LOCAL neighbour overlap — each character is compared with
 *      the previous character in its line, not with a global baseline, so moderately rotated,
 *      perspective-skewed and curved (cylindrical) lines still hold together
 *   5. rank lines by distance from the alignment guide (primary), then evidence
 *   6. within that line, keep the cluster of characters nearest the target centre (drops
 *      unrelated text further along the same row)
 *   7. edge handling: a character significantly cut by the band edge is either a separate
 *      neighbouring fragment (dropped) or part of the aimed value (→ "clipped": ask for a retake
 *      rather than read a partial value)
 *   8. estimate the line's slope for deskew — only when the fit is confident
 */

import type { GrayImage, IntRect } from "./ocrPreprocess";
import { boxMean, integralImage } from "./ocrPreprocess";

export interface Component {
  id: number;
  x0: number;
  y0: number;
  x1: number; // inclusive
  y1: number; // inclusive
  area: number;
  /** Ink pixels lying on each band boundary. */
  edge: { left: number; right: number; top: number; bottom: number };
}

export const compWidth = (c: Component) => c.x1 - c.x0 + 1;
export const compHeight = (c: Component) => c.y1 - c.y0 + 1;
const cx = (c: Component) => (c.x0 + c.x1) / 2;
const cy = (c: Component) => (c.y0 + c.y1) / 2;

export type LineIsolationResult =
  | {
      status: "ok";
      /** Union bbox of the selected characters (analysis pixels, no margin). */
      bbox: IntRect;
      selected: Component[];
      /** Every OTHER ink component — masked out of the OCR image. */
      others: Component[];
      /** Component label per analysis pixel (0 = background). */
      labels: Int32Array;
      medianHeight: number;
      maxHeight: number;
      /** Line slope in radians (y-down: positive = descending to the right). */
      angle: number;
      /** True only when the slope estimate is trustworthy enough to rotate by. */
      deskew: boolean;
      /** RMS deviation of character centres from the fitted line (analysis px). */
      residual: number;
      /** A single compact token (no word gaps) — lets OCR try single-word segmentation. */
      compact: boolean;
      /** Fitted centre-line y at a given x (analysis px). */
      fitY: (x: number) => number;
    }
  | { status: "no-text" }
  | { status: "clipped" };

// Tunables — expressed relative to the band height H or the line's character height h, so
// behaviour is the same at any capture resolution / zoom.
const THRESHOLD_OFFSET = 18; // ink = darker than the local mean by this much (0..255)
const MIN_LINE_CHAR_HEIGHT = 0.08; // × H — smaller "lines" are texture, not an aimed value
const MAX_GUIDE_DISTANCE = 0.3; // × H — nothing near the guide → no-text
const CLUSTER_GAP = 1.5; // × h — a wider gap separates unrelated text on the same row
const WORD_GAP = 0.5; // × h — a gap this wide means more than one token
const MAX_DESKEW_RAD = (15 * Math.PI) / 180; // beyond this we don't trust the geometry
const MIN_DESKEW_RAD = (0.6 * Math.PI) / 180; // below this rotating only adds blur
const DESKEW_MAX_RESIDUAL = 0.2; // × h — curved/ragged lines aren't rotated

/** Ink mask by local mean thresholding (robust to glare gradients). Expects dark-on-light. */
export function binarizeForAnalysis(img: GrayImage): Uint8Array {
  const { width: w, height: h } = img;
  const r = Math.max(7, Math.round(h / 4));
  const sat = integralImage(img);
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = img.data[y * w + x];
      if (v < boxMean(sat, w, h, x, y, r) - THRESHOLD_OFFSET) ink[y * w + x] = 1;
    }
  }
  return ink;
}

/** 8-connected component labelling. Labels are 1-based; 0 = background. */
export function labelComponents(ink: Uint8Array, w: number, h: number): { labels: Int32Array; components: Component[] } {
  const labels = new Int32Array(w * h);
  const components: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < ink.length; start += 1) {
    if (!ink[start] || labels[start]) continue;
    const id = components.length + 1;
    const c: Component = { id, x0: w, y0: h, x1: -1, y1: -1, area: 0, edge: { left: 0, right: 0, top: 0, bottom: 0 } };
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      c.area += 1;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x === 0) c.edge.left += 1;
      if (x === w - 1) c.edge.right += 1;
      if (y === 0) c.edge.top += 1;
      if (y === h - 1) c.edge.bottom += 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (ink[q] && !labels[q]) {
            labels[q] = id;
            stack.push(q);
          }
        }
      }
    }
    components.push(c);
  }
  return { labels, components };
}

/** Components that can't be characters of an aimed value: specks, band-spanning bars
 *  (barcode bars, plate edges), long horizontal rules/borders, big hollow frames. */
export function isStructureOrNoise(c: Component, W: number, H: number): boolean {
  const w = compWidth(c);
  const h = compHeight(c);
  const minArea = Math.max(4, Math.round((H / 50) ** 2));
  if (c.area < minArea) return true;
  if (h >= 0.9 * H) return true; // spans the whole band: border / barcode / plate edge
  if (w >= 0.6 * W && h < 0.25 * w) return true; // long horizontal rule
  if (h > 0.55 * H && w * 6 < h) return true; // tall thin bar (barcode, divider)
  if (h > 0.5 * H && c.area / (w * h) < 0.06) return true; // big hollow frame/outline
  return false;
}

interface Line {
  comps: Component[];
  x1: number;
  lastBody: Component;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Does `c` continue the line whose most recent full-height character is `n`? */
function continuesLine(c: Component, n: Component, lineX1: number): boolean {
  const ch = compHeight(c);
  const nh = compHeight(n);
  const minH = Math.min(ch, nh);
  const maxH = Math.max(ch, nh);
  const overlap = Math.min(c.y1, n.y1) - Math.max(c.y0, n.y0) + 1;
  if (overlap <= 0) return false;
  const gap = c.x0 - lineX1 - 1;
  if (gap > 1.6 * maxH) return false;
  const similar = overlap / minH >= 0.4 && maxH / minH <= 2.5;
  // Punctuation (. , - /) sits inside a neighbour's vertical span but is much smaller.
  const containedSmall = ch < 0.6 * nh && overlap >= 0.8 * ch;
  return similar || containedSmall;
}

/** Chains components (sorted by x) into lines via local neighbour agreement. */
export function groupIntoLines(comps: Component[]): Component[][] {
  const sorted = [...comps].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
  const lines: Line[] = [];
  for (const c of sorted) {
    let best: Line | null = null;
    let bestOverlap = -1;
    for (const line of lines) {
      if (!continuesLine(c, line.lastBody, line.x1)) continue;
      const n = line.lastBody;
      const overlap = (Math.min(c.y1, n.y1) - Math.max(c.y0, n.y0) + 1) / Math.min(compHeight(c), compHeight(n));
      if (overlap > bestOverlap) {
        best = line;
        bestOverlap = overlap;
      }
    }
    if (best) {
      best.comps.push(c);
      best.x1 = Math.max(best.x1, c.x1);
      // Only full-height characters steer the line, so a "." doesn't break "19.0006X".
      const lineMedian = median(best.comps.map(compHeight));
      if (compHeight(c) >= 0.6 * lineMedian) best.lastBody = c;
    } else {
      lines.push({ comps: [c], x1: c.x1, lastBody: c });
    }
  }
  const result = lines.map((l) => l.comps);
  attachDiacritics(result);
  return result.filter((l) => l.length > 0);
}

/** Dots of i/j and similar marks form their own tiny "line" just above/below a real line —
 *  fold them back into the line they belong to rather than mask them out. */
function attachDiacritics(lines: Component[][]): void {
  const heights = lines.map((l) => median(l.map(compHeight)));
  for (let i = 0; i < lines.length; i += 1) {
    const small = lines[i];
    for (let j = 0; j < lines.length; j += 1) {
      if (i === j || !lines[j].length || !small.length) continue;
      if (heights[i] >= 0.5 * heights[j]) continue;
      const host = lines[j];
      const fits = small.every((m) => host.some((c) =>
        m.x1 >= c.x0 - 1 && m.x0 <= c.x1 + 1 && // horizontally over a host character
        (c.y0 - m.y1 <= 0.6 * compHeight(c)) && (m.y0 - c.y1 <= 0.6 * compHeight(c)) &&
        compHeight(m) < 0.5 * compHeight(c)));
      if (fits) {
        host.push(...small);
        lines[i] = [];
        break;
      }
    }
  }
}

/** Least-squares line through character centres: y = a + b·x, with RMS residual. */
export function fitCentreLine(comps: Component[]): { a: number; b: number; residual: number } {
  const n = comps.length;
  if (n === 0) return { a: 0, b: 0, residual: 0 };
  const xs = comps.map(cx);
  const ys = comps.map(cy);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const b = n >= 2 && sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  const residual = Math.sqrt(ys.reduce((s, y, i) => s + (y - (a + b * xs[i])) ** 2, 0) / n);
  return { a, b, residual };
}

function bodiesOf(comps: Component[]): Component[] {
  const m = median(comps.map(compHeight));
  return comps.filter((c) => compHeight(c) >= 0.6 * m);
}

/** Splits a line into clusters separated by wide gaps (unrelated text on the same row). */
function splitClusters(line: Component[], h: number): Component[][] {
  const sorted = [...line].sort((a, b) => a.x0 - b.x0);
  const clusters: Component[][] = [];
  let current: Component[] = [];
  let x1 = -Infinity;
  for (const c of sorted) {
    if (current.length && c.x0 - x1 - 1 > CLUSTER_GAP * h) {
      clusters.push(current);
      current = [];
      x1 = -Infinity;
    }
    current.push(c);
    x1 = Math.max(x1, c.x1);
  }
  if (current.length) clusters.push(current);
  return clusters;
}

/** A band edge cutting through a real part of a character — not a few antialiasing pixels. */
function cutBy(c: Component, side: "left" | "right" | "top" | "bottom"): boolean {
  const span = side === "left" || side === "right" ? compHeight(c) : compWidth(c);
  return c.edge[side] >= Math.max(2, 0.25 * span);
}

export function isolateTextLine(img: GrayImage, guideY: number): LineIsolationResult {
  const { width: W, height: H } = img;
  if (W < 4 || H < 4) return { status: "no-text" };
  const { labels, components } = labelComponents(binarizeForAnalysis(img), W, H);
  const candidates = components.filter((c) => !isStructureOrNoise(c, W, H));
  if (!candidates.length) return { status: "no-text" };

  // ── Rank lines by distance from the alignment guide ──
  let best: { comps: Component[]; distance: number; bodies: number; h: number } | null = null;
  for (const line of groupIntoLines(candidates)) {
    const bodies = bodiesOf(line);
    const h = median(bodies.map(compHeight));
    if (h < MIN_LINE_CHAR_HEIGHT * H) continue;
    const { a, b } = fitCentreLine(bodies);
    const x0 = Math.min(...line.map((c) => c.x0));
    const x1 = Math.max(...line.map((c) => c.x1));
    const gx = Math.max(x0, Math.min(x1, W / 2));
    const distance = Math.abs(a + b * gx - guideY);
    const better = !best ||
      distance < best.distance - 0.02 * H ||
      (Math.abs(distance - best.distance) <= 0.02 * H && (bodies.length > best.bodies || (bodies.length === best.bodies && h > best.h)));
    if (better) best = { comps: line, distance, bodies: bodies.length, h };
  }
  if (!best || best.distance > MAX_GUIDE_DISTANCE * H) return { status: "no-text" };

  // ── Keep the cluster nearest the target centre ──
  const clusters = splitClusters(best.comps, best.h);
  const centre = W / 2;
  const spanDistance = (cl: Component[]) => {
    const x0 = Math.min(...cl.map((c) => c.x0));
    const x1 = Math.max(...cl.map((c) => c.x1));
    return centre < x0 ? x0 - centre : centre > x1 ? centre - x1 : 0;
  };
  let chosen = clusters[0];
  for (const cl of clusters.slice(1)) {
    const d = spanDistance(cl);
    const dc = spanDistance(chosen);
    if (d < dc || (d === dc && bodiesOf(cl).length > bodiesOf(chosen).length)) chosen = cl;
  }
  let selected = [...chosen].sort((a, b) => a.x0 - b.x0);
  const h = median(bodiesOf(selected).map(compHeight)) || best.h;

  // ── Band-edge fragments vs a clipped value ──
  const dropEdge = (side: "left" | "right"): boolean => {
    if (!selected.length) return false;
    const edgeComp = side === "left" ? selected[0] : selected[selected.length - 1];
    if (!cutBy(edgeComp, side)) return false;
    if (selected.length === 1) return true; // the value itself is cut → clipped
    const neighbour = side === "left" ? selected[1] : selected[selected.length - 2];
    const gap = side === "left" ? neighbour.x0 - edgeComp.x1 - 1 : edgeComp.x0 - neighbour.x1 - 1;
    if (gap > 0.9 * h) {
      // A separate glyph of some neighbouring text, sliced by the edge: not part of the value.
      selected = side === "left" ? selected.slice(1) : selected.slice(0, -1);
      return false;
    }
    return true; // cut character sits right against the value → the value is clipped
  };
  if (dropEdge("left") || dropEdge("right")) return { status: "clipped" };
  const bodies = bodiesOf(selected);
  if (!bodies.length) return { status: "clipped" };
  if (bodies.some((c) => cutBy(c, "top") || cutBy(c, "bottom"))) return { status: "clipped" };

  // ── Geometry of the selected value ──
  const fit = fitCentreLine(bodies);
  const angle = Math.atan(fit.b);
  const absAngle = Math.abs(angle);
  const deskew = bodies.length >= 3 && absAngle >= MIN_DESKEW_RAD && absAngle <= MAX_DESKEW_RAD &&
    fit.residual <= DESKEW_MAX_RESIDUAL * h;

  // Gaps between ALL selected marks (punctuation included — the "." in 19.0006X isn't a word gap).
  let maxGap = 0;
  let runX1 = selected[0].x1;
  for (let i = 1; i < selected.length; i += 1) {
    maxGap = Math.max(maxGap, selected[i].x0 - runX1 - 1);
    runX1 = Math.max(runX1, selected[i].x1);
  }
  const compact = maxGap <= WORD_GAP * h && bodies.length <= 12;

  const x0 = Math.min(...selected.map((c) => c.x0));
  const y0 = Math.min(...selected.map((c) => c.y0));
  const x1 = Math.max(...selected.map((c) => c.x1));
  const y1 = Math.max(...selected.map((c) => c.y1));
  const selectedIds = new Set(selected.map((c) => c.id));
  return {
    status: "ok",
    bbox: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
    selected,
    others: components.filter((c) => !selectedIds.has(c.id)),
    labels,
    medianHeight: h,
    maxHeight: Math.max(...bodies.map(compHeight)),
    angle,
    deskew,
    residual: fit.residual,
    compact,
    fitY: (x: number) => fit.a + fit.b * x,
  };
}
