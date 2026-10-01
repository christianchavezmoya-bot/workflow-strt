/**
 * Deterministic, pure-JS image operations for camera OCR of short identifiers (serials, asset
 * tags, firmware versions, labels). No canvas, no DOM: typed arrays in, typed arrays out, so the
 * same bytes come out on every platform and every step is unit-testable. All of it runs locally.
 *
 * Deliberately NOT done here:
 *  - Hard global thresholding of the image handed to Tesseract. Tesseract already Otsu-binarizes
 *    internally; a second global threshold in front of it, on a phone photo with glare or a
 *    gradient, erases thin strokes it would otherwise have recovered. (Line ANALYSIS does use a
 *    local threshold — see ocrLineIsolation.ts — but only to find where the text is.)
 *  - Any character-level correction. These functions only change pixels; recognized text is
 *    never rewritten (normalizeOcrCandidate touches whitespace only).
 */

export interface GrayImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface IntRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** RGBA → 8-bit luma (integer Rec.601 weights, so identical on every platform). */
export function toGrayscale(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; p < out.length; i += 4, p += 1) {
    out[p] = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >> 8;
  }
  return out;
}

export function grayFromRgba(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  return { data: toGrayscale(rgba), width, height };
}

/** Grayscale → opaque RGBA (for putImageData). */
export function grayToRgba(img: GrayImage): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (let p = 0, i = 0; p < img.data.length; p += 1, i += 4) {
    const v = img.data[p];
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Linear contrast stretch between the 1st and 99th luminance percentiles (so a few specular
 * highlights or deep shadows don't dictate the range). A near-flat image — nothing to separate —
 * is returned unchanged rather than amplifying sensor noise into fake strokes.
 */
export function stretchContrast(gray: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const lowCount = Math.floor(gray.length * 0.01);
  const highCount = Math.ceil(gray.length * 0.99);
  let lo = 0;
  let hi = 255;
  for (let v = 0, acc = 0; v < 256; v += 1) {
    acc += hist[v];
    if (acc > lowCount) { lo = v; break; }
  }
  for (let v = 0, acc = 0; v < 256; v += 1) {
    acc += hist[v];
    if (acc >= highCount) { hi = v; break; }
  }
  if (hi - lo < 16) return new Uint8ClampedArray(gray);
  const out = new Uint8ClampedArray(gray.length);
  const range = hi - lo;
  for (let i = 0; i < gray.length; i += 1) {
    out[i] = ((gray[i] - lo) * 255) / range; // Uint8ClampedArray clamps + rounds
  }
  return out;
}

export interface PolarityDecision {
  /** True when the background is dark (light text on a dark label) and should be inverted. */
  invert: boolean;
  /** 0 (a coin toss) … 1 (unambiguous). */
  confidence: number;
}

/**
 * Tesseract is trained on dark text on a light background. A target band is mostly background,
 * so if most pixels are dark the label is light-on-dark (e.g. white print on a black equipment
 * label) and should be inverted. Counting the dark fraction (rather than averaging levels) keeps a
 * big dark logo or bold run from flipping a light label, and makes the confidence honest: a band
 * that is half dark casing, half white label is a genuine coin toss (confidence ≈ 0).
 */
export function decidePolarity(gray: Uint8ClampedArray): PolarityDecision {
  if (gray.length === 0) return { invert: false, confidence: 0 };
  let dark = 0;
  for (let i = 0; i < gray.length; i += 1) if (gray[i] < 128) dark += 1;
  const darkFraction = dark / gray.length;
  return { invert: darkFraction > 0.5, confidence: Math.min(1, Math.abs(darkFraction - 0.5) * 2) };
}

export function invertGray(gray: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i += 1) out[i] = 255 - gray[i];
  return out;
}

/** Makes the image dark-text-on-light (see decidePolarity). */
export function normalizePolarity(gray: Uint8ClampedArray): Uint8ClampedArray {
  return decidePolarity(gray).invert ? invertGray(gray) : new Uint8ClampedArray(gray);
}

/** Resize: box-filter averaging when shrinking (keeps thin strokes from aliasing away), bilinear
 *  when enlarging. */
export function resizeGray(img: GrayImage, width: number, height: number): GrayImage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const out = new Uint8ClampedArray(w * h);
  const sx = img.width / w;
  const sy = img.height / h;
  if (sx >= 1 && sy >= 1) {
    for (let y = 0; y < h; y += 1) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) * sy)));
      for (let x = 0; x < w; x += 1) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) * sx)));
        let sum = 0;
        for (let yy = y0; yy < y1; yy += 1) {
          const row = yy * img.width;
          for (let xx = x0; xx < x1; xx += 1) sum += img.data[row + xx];
        }
        out[y * w + x] = sum / ((y1 - y0) * (x1 - x0));
      }
    }
    return { data: out, width: w, height: h };
  }
  for (let y = 0; y < h; y += 1) {
    const fy = Math.min(img.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(img.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x += 1) {
      const fx = Math.min(img.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const tx = fx - x0;
      const a = img.data[y0 * img.width + x0];
      const b = img.data[y0 * img.width + x1];
      const c = img.data[y1 * img.width + x0];
      const d = img.data[y1 * img.width + x1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return { data: out, width: w, height: h };
}

/** Crops to an integer rect clamped to the image. */
export function cropGray(img: GrayImage, rect: IntRect): GrayImage {
  const x0 = Math.max(0, Math.min(img.width, Math.floor(rect.x)));
  const y0 = Math.max(0, Math.min(img.height, Math.floor(rect.y)));
  const x1 = Math.max(x0, Math.min(img.width, Math.ceil(rect.x + rect.width)));
  const y1 = Math.max(y0, Math.min(img.height, Math.ceil(rect.y + rect.height)));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const out = new Uint8ClampedArray(w * h).fill(255);
  for (let y = 0; y < Math.min(h, y1 - y0); y += 1) {
    const src = (y0 + y) * img.width + x0;
    out.set(img.data.subarray(src, src + Math.min(w, x1 - x0)), y * w);
  }
  return { data: out, width: w, height: h };
}

/**
 * Rotates by `angle` radians (positive = clockwise on screen, i.e. y-down) about (cx, cy),
 * keeping the same canvas size; uncovered corners take `fill`. Bilinear, deterministic.
 */
export function rotateGray(img: GrayImage, angle: number, cx: number, cy: number, fill = 255): GrayImage {
  const { width: w, height: h } = img;
  const out = new Uint8ClampedArray(w * h);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      // Inverse mapping: where in the source does this output pixel come from?
      const dx = x - cx;
      const dy = y - cy;
      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) {
        out[y * w + x] = fill;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const tx = sx - x0;
      const ty = sy - y0;
      const a = img.data[y0 * w + x0];
      const b = img.data[y0 * w + x1];
      const c = img.data[y1 * w + x0];
      const d = img.data[y1 * w + x1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return { data: out, width: w, height: h };
}

/** Summed-area table for O(1) box means. (w+1)×(h+1). */
export function integralImage(img: GrayImage): Float64Array {
  const { width: w, height: h } = img;
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < w; x += 1) {
      rowSum += img.data[y * w + x];
      sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  return sat;
}

/** Mean of the (2r+1)² window centred on (x, y), clipped to the image. */
export function boxMean(sat: Float64Array, w: number, h: number, x: number, y: number, r: number): number {
  const x0 = Math.max(0, x - r);
  const y0 = Math.max(0, y - r);
  const x1 = Math.min(w, x + r + 1);
  const y1 = Math.min(h, y + r + 1);
  const W = w + 1;
  const sum = sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0];
  return sum / ((x1 - x0) * (y1 - y0));
}

/**
 * Illumination flattening: divides each pixel by its local background level (a wide box mean),
 * then re-stretches. Removes glare gradients and shadows across a label — the "adaptive" OCR
 * variant — without hard-thresholding anything. `radius` should be a few character heights so
 * ink is a minority of every window. Expects dark-on-light input.
 */
export function flattenBackground(img: GrayImage, radius: number): GrayImage {
  const r = Math.max(2, Math.round(radius));
  const sat = integralImage(img);
  const out = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const bg = boxMean(sat, img.width, img.height, x, y, r);
      out[y * img.width + x] = (img.data[y * img.width + x] * 255) / Math.max(1, bg);
    }
  }
  return { data: stretchContrast(out), width: img.width, height: img.height };
}

/** Adds a uniform border (Tesseract needs a quiet zone around the text). */
export function padGray(img: GrayImage, pad: number, fill = 255): GrayImage {
  const p = Math.max(0, Math.round(pad));
  const w = img.width + 2 * p;
  const h = img.height + 2 * p;
  const out = new Uint8ClampedArray(w * h).fill(fill);
  for (let y = 0; y < img.height; y += 1) {
    out.set(img.data.subarray(y * img.width, (y + 1) * img.width), (y + p) * w + p);
  }
  return { data: out, width: w, height: h };
}

/**
 * Whitespace-only cleanup of a recognized candidate: trims it and collapses any internal run of
 * whitespace (including the newlines Tesseract emits) into one space. Never touches a
 * non-whitespace character — no O→0, no dropped punctuation. Anything else that's wrong is the
 * technician's to correct in the editable review field.
 */
export function normalizeOcrCandidate(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
