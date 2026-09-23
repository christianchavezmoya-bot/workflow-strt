import { describe, expect, it } from "vitest";
import { base64ByteLength } from "./byteSize";

describe("base64ByteLength", () => {
  it("matches known encodings exactly (verified against real base64 of ASCII strings)", () => {
    // "A" -> "QQ==" (1 byte), "AB" -> "QUI=" (2 bytes), "ABC" -> "QUJD" (3 bytes, no padding)
    expect(base64ByteLength("QQ==")).toBe(1);
    expect(base64ByteLength("QUI=")).toBe(2);
    expect(base64ByteLength("QUJD")).toBe(3);
  });

  it("handles the empty string", () => {
    expect(base64ByteLength("")).toBe(0);
  });

  it("handles a longer, unpadded payload (byte length divisible by 3)", () => {
    const original = "Hello, world!!!"; // 15 bytes -> divisible by 3 -> no base64 padding
    expect(original.length % 3).toBe(0);
    const b64 = Buffer.from(original, "utf8").toString("base64");
    expect(b64.endsWith("=")).toBe(false);
    expect(base64ByteLength(b64)).toBe(original.length);
  });

  it("is always dramatically smaller than the naive (wrong) `.length` figure for real payloads", () => {
    // This is the exact bug being fixed: base64 string length overstates true bytes by ~33%.
    const original = "x".repeat(3000);
    const b64 = Buffer.from(original, "utf8").toString("base64");
    const correct = base64ByteLength(b64);
    expect(correct).toBe(3000);
    expect(b64.length).toBeGreaterThan(correct); // the old, wrong measurement
    expect(b64.length / correct).toBeCloseTo(4 / 3, 1);
  });

  it("round-trips correctly across every padding case (0, 1, 2 chars)", () => {
    for (let n = 1; n <= 12; n++) {
      const original = "y".repeat(n);
      const b64 = Buffer.from(original, "utf8").toString("base64");
      expect(base64ByteLength(b64), `n=${n}`).toBe(n);
    }
  });
});
