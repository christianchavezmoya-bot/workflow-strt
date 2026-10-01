/**
 * Industrial field-value OCR, image side (pure, local, deterministic). From the captured OCR
 * target band to a SMALL, bounded set of line images ready for Tesseract:
 *
 *   band (source pixels) → grayscale → contrast stretch → dark-on-light polarity
 *     → downscaled analysis copy → isolate the ONE aimed line (ocrLineIsolation.ts)
 *     → cut that line from the FULL-resolution band with a margin, masking every other ink
 *       component (neighbouring lines, edge fragments, borders) to background
 *     → deskew when the line's slope estimate is confident
 *     → scale so characters are ~OCR_TARGET_CHAR_HEIGHT px, pad with a quiet zone
 *     → variants: normalized, illumination-flattened, (inverted only if polarity is ambiguous)
 *
 * planOcrPasses() then pairs variants with a deterministic set of page-segmentation modes. The
 * OCR engine itself lives in services/cameraCaptureService.ts.
 */

import { isolateTextLine, type Component } from "./ocrLineIsolation";
import {
  cropGray,
  decidePolarity,
  flattenBackground,
  grayFromRgba,
  invertGray,
  padGray,
  resizeGray,
  rotateGray,
  stretchContrast,
  type GrayImage,
  type IntRect,
} from "./ocrPreprocess";

/** Analysis copy bounds: enough resolution to separate characters, cheap to label on a phone. */
export const ANALYSIS_MAX_HEIGHT = 240;
export const ANALYSIS_MAX_WIDTH = 1200;
/** Character height Tesseract's LSTM model reads best at. */
export const OCR_TARGET_CHAR_HEIGHT = 40;
const MIN_OCR_SCALE = 0.5;
const MAX_OCR_SCALE = 4;
/** Polarity decisions below this confidence also get an inverted variant. */
export const AMBIGUOUS_POLARITY = 0.3;

export type OcrVariantId = "normalized" | "flattened" | "inverted";

export interface OcrVariant {
  id: OcrVariantId;
  image: GrayImage;
}

export type PreparedFieldOcr =
  | {
      status: "ok";
      variants: OcrVariant[];
      /** Selected value is a single compact token (no word gaps). */
      compact: boolean;
      /** Rotation applied, in degrees (0 when not deskewed). */
      deskewDegrees: number;
      /** The isolated line in band (source) pixels, before margin. */
      lineRect: IntRect;
    }
  | { status: "no-text" }
  | { status: "clipped" };

/** Tesseract page-segmentation modes we use (values of tesseract.js's PSM enum). */
export const PSM_SINGLE_LINE = "7";
export const PSM_SINGLE_WORD = "8";
export const PSM_RAW_LINE = "13";
export type OcrPsm = typeof PSM_SINGLE_LINE | typeof PSM_SINGLE_WORD | typeof PSM_RAW_LINE;

export interface OcrPass {
  id: string;
  variant: OcrVariantId;
  psm: OcrPsm;
}

/** Marks every analysis pixel of the given components (dilated by 1px so their antialiased
 *  fringe goes too), never touching a selected component's own pixels. */
function maskOf(others: Component[], labels: Int32Array, w: number, h: number, keep: Set<number>): Uint8Array {
  const otherIds = new Set(others.map((c) => c.id));
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < labels.length; p += 1) {
    if (!otherIds.has(labels[p])) continue;
    const x = p % w;
    const y = (p - x) / w;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!keep.has(labels[q])) mask[q] = 1;
      }
    }
  }
  return mask;
}

export function prepareFieldOcr(rgba: Uint8ClampedArray, width: number, height: number, guideY = height / 2): PreparedFieldOcr {
  const stretched = stretchContrast(grayFromRgba(rgba, width, height).data);
  const polarity = decidePolarity(stretched);
  const full: GrayImage = { data: polarity.invert ? invertGray(stretched) : stretched, width, height };

  const s = Math.min(1, ANALYSIS_MAX_HEIGHT / height, ANALYSIS_MAX_WIDTH / width);
  const analysis = s < 1 ? resizeGray(full, width * s, height * s) : full;
  const sx = analysis.width / width; // exact per-axis factors after rounding
  const sy = analysis.height / height;

  const line = isolateTextLine(analysis, guideY * sy);
  if (line.status !== "ok") return line;

  // ── Cut the line from the full-resolution band ──
  const charH = line.medianHeight / sy;
  const maxCharH = line.maxHeight / sy;
  const bbox = {
    x: line.bbox.x / sx,
    y: line.bbox.y / sy,
    width: line.bbox.width / sx,
    height: line.bbox.height / sy,
  };
  const marginX = 0.6 * charH;
  const marginY = 0.45 * charH;
  // A tilted line's bbox is taller than the line; rotation needs that extra room, and the tight
  // vertical crop happens after rotation.
  const crop: IntRect = {
    x: bbox.x - marginX,
    y: bbox.y - marginY,
    width: bbox.width + 2 * marginX,
    height: bbox.height + 2 * marginY,
  };
  let lineImg = cropGray(full, crop);
  const cropX0 = Math.max(0, Math.floor(crop.x));
  const cropY0 = Math.max(0, Math.floor(crop.y));

  // Mask everything that isn't the selected line (neighbour lines/fragments/borders) to paper.
  const keep = new Set(line.selected.map((c) => c.id));
  const mask = maskOf(line.others, line.labels, analysis.width, analysis.height, keep);
  for (let y = 0; y < lineImg.height; y += 1) {
    const ay = Math.min(analysis.height - 1, Math.floor((cropY0 + y) * sy));
    for (let x = 0; x < lineImg.width; x += 1) {
      const ax = Math.min(analysis.width - 1, Math.floor((cropX0 + x) * sx));
      if (mask[ay * analysis.width + ax]) lineImg.data[y * lineImg.width + x] = 255;
    }
  }

  let deskewDegrees = 0;
  if (line.deskew) {
    // Rotate about the point where the fitted centre line crosses the value's middle, so the
    // line ends up horizontal through that point; then crop tightly around it.
    const midXAnalysis = line.bbox.x + line.bbox.width / 2;
    const pivotX = midXAnalysis / sx - cropX0;
    const pivotY = line.fitY(midXAnalysis) / sy - cropY0;
    lineImg = rotateGray(lineImg, -line.angle, pivotX, pivotY);
    deskewDegrees = (-line.angle * 180) / Math.PI;
    const half = maxCharH / 2 + line.residual / sy + marginY;
    const halfW = (bbox.width / Math.cos(line.angle)) / 2 + marginX;
    lineImg = cropGray(lineImg, { x: pivotX - halfW, y: pivotY - half, width: 2 * halfW, height: 2 * half });
  }

  // ── Scale to Tesseract's preferred character height, add a quiet zone ──
  const scale = Math.min(MAX_OCR_SCALE, Math.max(MIN_OCR_SCALE, OCR_TARGET_CHAR_HEIGHT / Math.max(1, charH)));
  const base = resizeGray(lineImg, lineImg.width * scale, lineImg.height * scale);
  const pad = Math.max(12, Math.round(0.5 * OCR_TARGET_CHAR_HEIGHT));
  const normalized = { data: stretchContrast(base.data), width: base.width, height: base.height };

  const variants: OcrVariant[] = [
    { id: "normalized", image: padGray(normalized, pad) },
    { id: "flattened", image: padGray(flattenBackground(base, 2.5 * OCR_TARGET_CHAR_HEIGHT), pad) },
  ];
  if (polarity.confidence < AMBIGUOUS_POLARITY) {
    variants.push({ id: "inverted", image: padGray({ ...normalized, data: invertGray(normalized.data) }, pad, 0) });
  }

  return {
    status: "ok",
    variants,
    compact: line.compact,
    deskewDegrees,
    lineRect: { x: Math.round(bbox.x), y: Math.round(bbox.y), width: Math.round(bbox.width), height: Math.round(bbox.height) },
  };
}

/**
 * The bounded, deterministic OCR plan (≤ 4 passes, usually stopped after the first when it's
 * clean — see ocrResultSelection.isConfidentEnough). General automatic page segmentation is never
 * used: the input is one isolated line. SINGLE_WORD only when geometry says it's one compact token.
 */
export function planOcrPasses(prepared: Extract<PreparedFieldOcr, { status: "ok" }>): OcrPass[] {
  const passes: OcrPass[] = [
    { id: "normalized/line", variant: "normalized", psm: PSM_SINGLE_LINE },
    { id: "flattened/line", variant: "flattened", psm: PSM_SINGLE_LINE },
    prepared.compact
      ? { id: "normalized/word", variant: "normalized", psm: PSM_SINGLE_WORD }
      : { id: "normalized/raw", variant: "normalized", psm: PSM_RAW_LINE },
  ];
  if (prepared.variants.some((v) => v.id === "inverted")) {
    passes.push({ id: "inverted/line", variant: "inverted", psm: PSM_SINGLE_LINE });
  }
  return passes;
}
