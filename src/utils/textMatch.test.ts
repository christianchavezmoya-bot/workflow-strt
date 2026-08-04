import { describe, expect, it } from "vitest";
import { anyMatchesWordStart, matchesWordStart, tokenizeWords } from "./textMatch";

describe("tokenizeWords", () => {
  it("splits on hyphens and punctuation", () => {
    expect(tokenizeWords("CAD-0039")).toEqual(["cad", "0039"]);
  });
});

describe("matchesWordStart", () => {
  it("matches hyphenated asset tags when query includes hyphen", () => {
    expect(matchesWordStart("CAD-0039", "CAD-0039")).toBe(true);
    expect(matchesWordStart("CAD-0039", "cad-0039")).toBe(true);
  });

  it("matches partial hyphenated tag prefixes", () => {
    expect(matchesWordStart("CAD-0039", "CAD")).toBe(true);
    expect(matchesWordStart("CAD-0039", "0039")).toBe(true);
    expect(matchesWordStart("CAD-0039", "CAD-00")).toBe(true);
  });

  it("matches compact query without separators", () => {
    expect(matchesWordStart("CAD-0039", "cad0039")).toBe(true);
    expect(matchesWordStart("CAD-0039", "cad003")).toBe(true);
  });

  it("does not substring-match inside unrelated words", () => {
    expect(matchesWordStart("location", "cat")).toBe(false);
  });

  it("matches multi-word phrases by word start", () => {
    expect(matchesWordStart("base station alpha", "base stat")).toBe(true);
    expect(matchesWordStart("base station alpha", "ba st")).toBe(true);
  });
});

describe("anyMatchesWordStart", () => {
  it("matches when any haystack hits", () => {
    expect(anyMatchesWordStart(["foo bar", "CAD-0039"], "CAD-0039")).toBe(true);
    expect(anyMatchesWordStart(["foo bar", "baz"], "CAD")).toBe(false);
  });
});
