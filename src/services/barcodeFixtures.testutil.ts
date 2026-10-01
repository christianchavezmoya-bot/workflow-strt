/**
 * Test-only real barcode fixtures, generated deterministically by bwip-js (MIT, devDependency
 * only — never in the app bundle). Shared by the format-support and rotation tests so both decode
 * the exact same symbols.
 */
// The explicit `/browser` subpath: bwip-js's root export is conditional-only, which TypeScript's
// "bundler" module resolution cannot resolve. This subpath carries its own types and is a pure-JS
// build, so it works under vitest's jsdom environment.
import bwipjs from "bwip-js/browser";

export interface LuminanceFixture {
  luminance: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Renders a bwip-js 1D bar/space width sequence into a greyscale buffer. bwip-js emits `sbs`
 *  starting with a BAR, and ZXing needs a real quiet zone either side to find the symbol. */
export function render1D(sbs: number[], scale = 3, quiet = 32, barHeight = 80) {
  const totalModules = sbs.reduce((a, b) => a + b, 0);
  const width = totalModules * scale + quiet * 2;
  const height = barHeight + 20;
  const luminance = new Uint8ClampedArray(width * height).fill(255);
  let x = quiet;
  let isBar = true;
  for (const moduleWidth of sbs) {
    if (isBar) {
      for (let i = 0; i < moduleWidth * scale; i += 1) {
        for (let y = 10; y < 10 + barHeight; y += 1) luminance[y * width + x + i] = 0;
      }
    }
    x += moduleWidth * scale;
    isBar = !isBar;
  }
  return { luminance, width, height };
}

/** Renders a bwip-js 2D pixel matrix (QR / Data Matrix / PDF417) into a greyscale buffer. */
export function render2D(pixs: number[], pixx: number, pixy: number, scale = 4, quiet = 32) {
  const width = pixx * scale + quiet * 2;
  const height = pixy * scale + quiet * 2;
  const luminance = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < pixy; y += 1) {
    for (let x = 0; x < pixx; x += 1) {
      if (!pixs[y * pixx + x]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          luminance[(quiet + y * scale + dy) * width + (quiet + x * scale + dx)] = 0;
        }
      }
    }
  }
  return { luminance, width, height };
}

export function encodeFixture(bcid: string, text: string) {
  const encoded = bwipjs.raw({ bcid, text })[0] as unknown as {
    sbs?: number[];
    pixs?: number[];
    pixx?: number;
    pixy?: number;
  };
  if (encoded.pixs && encoded.pixx && encoded.pixy) {
    return render2D(encoded.pixs, encoded.pixx, encoded.pixy);
  }
  if (encoded.sbs) return render1D(encoded.sbs);
  throw new Error(`bwip-js produced neither a 1D nor a 2D symbol for ${bcid}`);
}

