import { describe, expect, it } from "vitest";
import { generateFaultReferenceCode, normalizeFaultReferenceCode } from "./referenceCode";

describe("generateFaultReferenceCode", () => {
  it("produces an FR- prefixed code of fixed length", () => {
    const code = generateFaultReferenceCode();
    expect(code).toMatch(/^FR-[23456789BCDFGHJKMNPQRSTVWXZ]{6}$/);
  });

  it("avoids vowels and the glyphs that get confused when written down", () => {
    const codes = Array.from({ length: 200 }, () => generateFaultReferenceCode());
    const body = codes.map((c) => c.slice(3)).join("");
    expect(body).not.toMatch(/[AEIOUY01L]/);
  });

  it("does not repeat within a small sample", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateFaultReferenceCode()));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe("normalizeFaultReferenceCode", () => {
  it("accepts the canonical form", () => {
    expect(normalizeFaultReferenceCode("FR-7QK2M4")).toBe("FR-7QK2M4");
  });

  it("tolerates what a user is likely to type", () => {
    expect(normalizeFaultReferenceCode("fr-7qk2m4")).toBe("FR-7QK2M4");
    expect(normalizeFaultReferenceCode("  FR-7QK2M4  ")).toBe("FR-7QK2M4");
    expect(normalizeFaultReferenceCode("FR 7QK2M4")).toBe("FR-7QK2M4");
    // Prefix omitted — people read out just the code part.
    expect(normalizeFaultReferenceCode("7QK2M4")).toBe("FR-7QK2M4");
  });

  it("rejects codes containing excluded characters", () => {
    expect(normalizeFaultReferenceCode("FR-7QK2M0")).toBeNull();
    expect(normalizeFaultReferenceCode("FR-AEIOUL")).toBeNull();
  });

  it("rejects empty or wrongly sized input", () => {
    expect(normalizeFaultReferenceCode("")).toBeNull();
    expect(normalizeFaultReferenceCode(null)).toBeNull();
    expect(normalizeFaultReferenceCode(undefined)).toBeNull();
    expect(normalizeFaultReferenceCode("FR-2")).toBeNull();
    expect(normalizeFaultReferenceCode("FR-2345678901234")).toBeNull();
  });
});
