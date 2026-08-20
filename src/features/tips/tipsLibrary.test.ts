import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "../../services/documentService";
import {
  buildTipCustomValues,
  formatRatingSummary,
  isStaleTip,
  resolveTipLinkedTo,
  sortTips,
} from "./tipsLibrary";

function tip(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "t1",
    name: "Tip",
    type: "tips",
    linkedTo: "General",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = Date.parse("2026-08-19T00:00:00.000Z");

describe("sortTips", () => {
  const docs = [
    tip({ id: "a", name: "Beta", uploadedAt: "2026-02-01T00:00:00.000Z", viewCount: 5, ratingAverage: 3, ratingCount: 2 }),
    tip({ id: "b", name: "Alpha", uploadedAt: "2026-05-01T00:00:00.000Z", viewCount: 1, ratingAverage: 5, ratingCount: 1 }),
    tip({ id: "c", name: "Gamma", uploadedAt: "2026-03-01T00:00:00.000Z", viewCount: 9 }),
  ];

  it("orders newest first by default", () => {
    expect(sortTips(docs, "newest").map((d) => d.id)).toEqual(["b", "c", "a"]);
  });

  it("orders oldest first", () => {
    expect(sortTips(docs, "oldest").map((d) => d.id)).toEqual(["a", "c", "b"]);
  });

  it("orders by most viewed", () => {
    expect(sortTips(docs, "most-viewed").map((d) => d.id)).toEqual(["c", "a", "b"]);
  });

  it("orders by least viewed so unused tips surface first", () => {
    expect(sortTips(docs, "least-viewed").map((d) => d.id)).toEqual(["b", "a", "c"]);
  });

  it("orders by rating and puts unrated last", () => {
    expect(sortTips(docs, "top-rated").map((d) => d.id)).toEqual(["b", "a", "c"]);
  });

  it("orders by title", () => {
    expect(sortTips(docs, "name").map((d) => d.id)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [...docs];
    sortTips(input, "most-viewed");
    expect(input.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });
});

describe("isStaleTip", () => {
  it("flags a tip whose last view is older than the window", () => {
    expect(isStaleTip(tip({ lastViewedAtUtc: "2025-12-01T00:00:00.000Z" }), NOW)).toBe(true);
  });

  it("does not flag a recently viewed tip", () => {
    expect(isStaleTip(tip({ lastViewedAtUtc: "2026-08-01T00:00:00.000Z" }), NOW)).toBe(false);
  });

  it("falls back to the upload date when a tip was never opened", () => {
    expect(isStaleTip(tip({ uploadedAt: "2026-08-10T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isStaleTip(tip({ uploadedAt: "2025-01-01T00:00:00.000Z" }), NOW)).toBe(true);
  });

  it("honours a custom window", () => {
    const doc = tip({ lastViewedAtUtc: "2026-06-01T00:00:00.000Z" });
    expect(isStaleTip(doc, NOW, 6)).toBe(false);
    expect(isStaleTip(doc, NOW, 1)).toBe(true);
  });
});

describe("tip metadata helpers", () => {
  it("builds the stored customValues shape", () => {
    expect(
      buildTipCustomValues({
        contentType: "Drawing",
        division: "HazardAvert-Coal",
        productId: "p1",
        productName: "AIM-100",
      }),
    ).toEqual({
      contentType: "Drawing",
      division: "HazardAvert-Coal",
      productId: "p1",
      productLabel: "AIM-100",
      product: "AIM-100",
    });
  });

  it("falls back through product, division, then General", () => {
    expect(resolveTipLinkedTo({ contentType: "Tip", division: "D", productId: "p1" })).toBe("p1");
    expect(resolveTipLinkedTo({ contentType: "Tip", division: "D" })).toBe("D");
    expect(resolveTipLinkedTo({ contentType: "Tip", division: "" })).toBe("General");
  });
});

describe("formatRatingSummary", () => {
  it("reports unrated tips plainly", () => {
    expect(formatRatingSummary(tip())).toBe("Not rated");
  });

  it("shows one decimal and the number of raters", () => {
    expect(formatRatingSummary(tip({ ratingAverage: 4.333, ratingCount: 3 }))).toBe("4.3 (3)");
  });
});
