import { describe, expect, it } from "vitest";
import { computeCaptureHeaderStickyTops } from "./captureSpreadsheet";

describe("computeCaptureHeaderStickyTops", () => {
  it("offsets row 2 and row 3 by measured header heights", () => {
    expect(computeCaptureHeaderStickyTops(42, 38)).toEqual({
      name: 0,
      pn: 42,
      fields: 80,
    });
  });

  it("never returns negative offsets", () => {
    expect(computeCaptureHeaderStickyTops(-10, -5)).toEqual({
      name: 0,
      pn: 0,
      fields: 0,
    });
  });
});
