import { describe, expect, it } from "vitest";
import { CONFIDENT_SCORE, isConfidentEnough, scoreOcrCandidate, selectOcrCandidate } from "./ocrResultSelection";

const pass = (passId: string, text: string, confidence: number) => ({ passId, text, confidence });

describe("selectOcrCandidate", () => {
  it("prefers the higher-confidence clean candidate", () => {
    const best = selectOcrCandidate([pass("a", "S4912/89", 71), pass("b", "S4912/89 |", 64), pass("c", "54912/89", 58)]);
    expect(best?.text).toBe("S4912/89");
    expect(best?.passId).toBe("a");
  });

  it("a long noisy candidate does NOT win just because it's longer", () => {
    const best = selectOcrCandidate([
      pass("long", "SUPPLIED BY ; 324775 1 ' ~", 72),
      pass("short", "324775", 70),
    ]);
    expect(best?.text).toBe("324775");
  });

  it("penalizes stray punctuation (the device regression `3247751 ;`)", () => {
    const noisy = scoreOcrCandidate(pass("x", "3247751 ;", 80));
    const clean = scoreOcrCandidate(pass("y", "324775", 70));
    expect(noisy.reasons).toEqual(expect.arrayContaining(["edge-debris"]));
    expect(clean.score).toBeGreaterThan(noisy.score);
  });

  it("penalizes band-edge fragments (punctuation-only tokens at either end)", () => {
    const s = scoreOcrCandidate(pass("x", "| C250 ;", 90));
    expect(s.reasons.filter((r) => r === "edge-debris")).toHaveLength(2);
    expect(s.score).toBeLessThan(90 - 2 * 15 + 1);
  });

  it("penalizes multi-line output for a single-line target", () => {
    expect(scoreOcrCandidate(pass("x", "C250\n12/24V", 90)).reasons).toContain("multi-line");
  });

  it.each(["S4912/89", "19.0006X", "V1.2.3", "ABC-123", "12/24V", "J000376", "SN_01", "DR040", "317931 3824"])(
    "legitimate identifier punctuation is not penalized: %s",
    (value) => {
      const s = scoreOcrCandidate(pass("x", value, 90));
      expect(s.reasons).toEqual([]);
      expect(s.score).toBe(90);
    },
  );

  it("returns the engine's candidate EXACTLY (whitespace-normalized only) — never corrected", () => {
    for (const raw of ["O0O l1I", "S5B8", "3247751 ;", "Chr1stian Chavez"]) {
      expect(selectOcrCandidate([pass("x", `${raw}\n`, 50)])?.text).toBe(raw);
    }
  });

  it("rewards agreement between independent passes", () => {
    const best = selectOcrCandidate([pass("a", "J000376", 70), pass("b", "J0O0376", 74), pass("c", "J000376", 68)]);
    expect(best?.text).toBe("J000376");
    expect(best?.reasons.some((r) => r.startsWith("agrees"))).toBe(true);
  });

  it("is deterministic on ties: higher confidence, then plan order", () => {
    expect(selectOcrCandidate([pass("a", "AAA", 80), pass("b", "BBB", 80)])?.passId).toBe("a");
  });

  it("returns null when nothing alphanumeric was read", () => {
    expect(selectOcrCandidate([pass("a", "", 0), pass("b", " ; ' ", 40)])).toBeNull();
  });

  it("clamps odd engine confidences", () => {
    expect(scoreOcrCandidate(pass("a", "X1", Number.NaN)).confidence).toBe(0);
    expect(scoreOcrCandidate(pass("a", "X1", 140)).confidence).toBe(100);
  });
});

describe("isConfidentEnough (early exit after the first pass)", () => {
  it("only for a clean, high-confidence read", () => {
    expect(isConfidentEnough(scoreOcrCandidate(pass("a", "324775", CONFIDENT_SCORE + 2)))).toBe(true);
    expect(isConfidentEnough(scoreOcrCandidate(pass("a", "324775 ;", 99)))).toBe(false);
    expect(isConfidentEnough(scoreOcrCandidate(pass("a", "324775", 60)))).toBe(false);
  });
});
