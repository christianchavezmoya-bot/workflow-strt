/**
 * Deterministic, on-device image preparation for camera OCR of short identifiers (serials,
 * asset tags, firmware versions, labels). Runs on the ALREADY-CROPPED target-window canvas —
 * it never widens what the technician aimed at.
 *
 * Pipeline: upscale → grayscale → contrast stretch → dark-text-on-light polarity → white margin.
 *
 * Deliberately NOT done here:
 *  - Hard thresholding/binarization. Tesseract already Otsu-binarizes internally; a second global
 *    threshold in front of it, on a phone photo with glare or a gradient, erases thin strokes it
 *    would otherwise have recovered. Handing it a clean, high-contrast grayscale is the safer win.
 *  - Any character-level correction. This only changes pixels; recognized text is never rewritten.
 *
 * The pixel functions are pure (typed arrays in, typed arrays out) so they are testable without
 * a real canvas; preprocessCanvasForOcr is the thin canvas wrapper used at runtime.
 */

/** Text in the target band should end up at least this tall (px) — Tesseract's LSTM model is
 *  markedly less accurate on small glyphs, which is what a 720p frame's crop band yields. */
export const OCR_MIN_HEIGHT_PX = 160;
/** Never upscale more than this — beyond ~3x interpolation adds blur, not detail. */
export const OCR_MAX_SCALE = 3;
/** Keep the working image bounded so recognition time stays predictable on older phones. */
export const OCR_MAX_WIDTH_PX = 2400;
/** Quiet zone Tesseract expects around text; glyphs touching the edge are often dropped or
 *  mis-segmented into stray characters. */
export const OCR_PADDING_PX = 16;

/** Upscale factor for a crop of the given size: ≥1, ≤OCR_MAX_SCALE, and width-bounded. */
export function computeOcrScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  let scale = Math.min(OCR_MAX_SCALE, Math.max(1, OCR_MIN_HEIGHT_PX / height));
  if (width * scale > OCR_MAX_WIDTH_PX) scale = Math.max(1, OCR_MAX_WIDTH_PX / width);
  return scale;
}

/** RGBA → 8-bit luma (integer Rec.601 weights, so identical on every platform). */
export function toGrayscale(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; p < out.length; i += 4, p += 1) {
    out[p] = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >> 8;
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

/**
 * Tesseract is trained on dark text on a light background. A target band is mostly background,
 * so a dark mean means light-on-dark (e.g. white print on a black equipment label): invert it.
 */
export function normalizePolarity(gray: Uint8ClampedArray): Uint8ClampedArray {
  let sum = 0;
  for (let i = 0; i < gray.length; i += 1) sum += gray[i];
  if (gray.length === 0 || sum / gray.length >= 128) return new Uint8ClampedArray(gray);
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i += 1) out[i] = 255 - gray[i];
  return out;
}

/** The full pixel pipeline (after scaling): RGBA in, grayscale-as-RGBA out, same dimensions. */
export function preprocessOcrPixels(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const gray = normalizePolarity(stretchContrast(toGrayscale(rgba)));
  const out = new Uint8ClampedArray(rgba.length);
  for (let p = 0, i = 0; p < gray.length; p += 1, i += 4) {
    out[i] = gray[p];
    out[i + 1] = gray[p];
    out[i + 2] = gray[p];
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Returns a new canvas prepared for OCR: upscaled, preprocessed and padded with a white margin.
 * Best-effort — if a 2D context isn't available, the original crop is returned untouched, so
 * preprocessing can only ever help recognition, never block it.
 */
export function preprocessCanvasForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  try {
    const scale = computeOcrScale(source.width, source.height);
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));

    const scaled = document.createElement("canvas");
    scaled.width = w;
    scaled.height = h;
    const sctx = scaled.getContext("2d");
    if (!sctx) return source;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(source, 0, 0, w, h);
    const image = sctx.getImageData(0, 0, w, h);
    image.data.set(preprocessOcrPixels(image.data));

    const out = document.createElement("canvas");
    out.width = w + OCR_PADDING_PX * 2;
    out.height = h + OCR_PADDING_PX * 2;
    const octx = out.getContext("2d");
    if (!octx) return source;
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, out.width, out.height);
    octx.putImageData(image, OCR_PADDING_PX, OCR_PADDING_PX);
    return out;
  } catch {
    return source;
  }
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
