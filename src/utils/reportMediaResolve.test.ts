import { describe, expect, it } from "vitest";
import { normalizeBinaryDataUrl } from "./reportMediaResolve";

describe("normalizeBinaryDataUrl", () => {
  it("rewrites octet-stream JPEG payloads to image/jpeg", () => {
    // Minimal JPEG header bytes (/9j/ in base64)
    const jpegBase64 = "/9j/4AAQ";
    const src = `data:application/octet-stream;base64,${jpegBase64}`;
    expect(normalizeBinaryDataUrl(src)).toBe(`data:image/jpeg;base64,${jpegBase64}`);
  });

  it("leaves proper image/jpeg data URLs unchanged", () => {
    const src = "data:image/jpeg;base64,/9j/4AAQ";
    expect(normalizeBinaryDataUrl(src)).toBe(src);
  });
});
