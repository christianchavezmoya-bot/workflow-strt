/**
 * Proves, for every barcode format this feature CLAIMS to support, that the decoder we actually
 * ship can really decode it — by encoding a fixture and decoding it back.
 *
 * Why it is written this way:
 *  - Fixtures are GENERATED here, deterministically, by bwip-js (MIT, devDependency only, never
 *    in the app bundle). Nothing is downloaded, and no third-party barcode image is committed.
 *  - Decoding goes through @zxing/library's MultiFormatReader with no format hints, which is the
 *    same "try everything" configuration BrowserMultiFormatReader uses in
 *    cameraCaptureService.ts. This is the FALLBACK decoder — the one that has to work when the
 *    browser has no native BarcodeDetector (notably Safari/iOS), so it is the honest lower bound
 *    on what we can promise.
 *  - We use RGBLuminanceSource rather than a canvas because jsdom has no 2D context. That is a
 *    test-harness detail only: in production BrowserMultiFormatReader reads the cropped canvas
 *    and hands ZXing the same luminance data.
 *
 * The point of this file is that SUPPORTED_BARCODE_FORMATS cannot drift away from reality
 * without a test failing.
 */
import { describe, expect, it } from "vitest";
// The explicit `/browser` subpath: bwip-js's root export is conditional-only, which TypeScript's
// "bundler" module resolution cannot resolve. This subpath carries its own types and is a pure-JS
// build, so it works under vitest's jsdom environment.
import bwipjs from "bwip-js/browser";
import {
  BarcodeFormat as ZXingFormat,
  BinaryBitmap,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { SUPPORTED_BARCODE_FORMATS, type BarcodeFormat } from "./cameraCaptureService";

/** Renders a bwip-js 1D bar/space width sequence into a greyscale buffer. bwip-js emits `sbs`
 *  starting with a BAR, and ZXing needs a real quiet zone either side to find the symbol. */
function render1D(sbs: number[], scale = 3, quiet = 32, barHeight = 80) {
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
function render2D(pixs: number[], pixx: number, pixy: number, scale = 4, quiet = 32) {
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

function encodeFixture(bcid: string, text: string) {
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

/** Decodes with no format hints — exactly how the production fallback reader is configured. */
function decodeAnyFormat(fixture: { luminance: Uint8ClampedArray; width: number; height: number }) {
  const source = new RGBLuminanceSource(fixture.luminance, fixture.width, fixture.height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  const reader = new MultiFormatReader();
  reader.setHints(null);
  const result = reader.decode(bitmap);
  return {
    text: result.getText(),
    format: ZXingFormat[result.getBarcodeFormat()] as string,
  };
}

/**
 * bwip-js symbology id -> our format id, plus the payload to round-trip. The payloads are the
 * kind of thing this feature actually reads: asset tags, serials and equipment IDs. For the
 * UPC/EAN family bwip-js computes the check digit, so the decoded text is one digit longer than
 * the input — `expected` records the full decoded value.
 */
const FORMAT_FIXTURES: ReadonlyArray<{
  format: BarcodeFormat;
  bcid: string;
  text: string;
  expected: string;
  zxingName: string;
}> = [
  { format: "qr_code", bcid: "qrcode", text: "SN-ABC123456789", expected: "SN-ABC123456789", zxingName: "QR_CODE" },
  { format: "code_128", bcid: "code128", text: "ASSET-00123456", expected: "ASSET-00123456", zxingName: "CODE_128" },
  { format: "code_39", bcid: "code39", text: "ABC123456", expected: "ABC123456", zxingName: "CODE_39" },
  { format: "ean_13", bcid: "ean13", text: "978020137962", expected: "9780201379624", zxingName: "EAN_13" },
  { format: "ean_8", bcid: "ean8", text: "9638507", expected: "96385074", zxingName: "EAN_8" },
  { format: "upc_a", bcid: "upca", text: "03600029145", expected: "036000291452", zxingName: "UPC_A" },
  { format: "data_matrix", bcid: "datamatrix", text: "DM-TEST-9988", expected: "DM-TEST-9988", zxingName: "DATA_MATRIX" },
  { format: "pdf417", bcid: "pdf417", text: "PDF417-TEST-123", expected: "PDF417-TEST-123", zxingName: "PDF_417" },
];

describe("claimed barcode formats decode for real", () => {
  it.each(FORMAT_FIXTURES)(
    "$format: a generated fixture round-trips through the shipped ZXing decoder",
    ({ bcid, text, expected, zxingName }) => {
      const result = decodeAnyFormat(encodeFixture(bcid, text));
      expect(result.text).toBe(expected);
      expect(result.format).toBe(zxingName);
    },
  );

  it("every format in SUPPORTED_BARCODE_FORMATS has a passing round-trip fixture above", () => {
    const covered = FORMAT_FIXTURES.map((f) => f.format).sort();
    expect([...SUPPORTED_BARCODE_FORMATS].sort()).toEqual(covered);
  });
});

describe("formats deliberately NOT claimed", () => {
  /**
   * Regression guard for a real limitation, so nobody "helpfully" re-adds upc_e without checking.
   *
   * @zxing/library@0.23.0 does ship a UPCEReader and MultiFormatReader does instantiate it when
   * no format hints are given — but it cannot decode a structurally valid UPC-E symbol (51
   * modules: 101 start guard + 6x7 data + 010101 end guard), at any scale, quiet zone or
   * orientation we tried, including calling UPCEReader directly. So UPC-E is excluded from the
   * claimed list rather than advertised and silently failing in the field.
   */
  it("upc_e is not claimed, because the shipped decoder cannot decode a valid UPC-E symbol", () => {
    expect(SUPPORTED_BARCODE_FORMATS).not.toContain("upc_e" as BarcodeFormat);

    const fixture = encodeFixture("upce", "0123456");
    expect(() => decodeAnyFormat(fixture)).toThrow();
  });

  it("UPC-A is unaffected and still decodes, so UPC-family codes are not broadly lost", () => {
    const result = decodeAnyFormat(encodeFixture("upca", "03600029145"));
    expect(result.text).toBe("036000291452");
  });
});
