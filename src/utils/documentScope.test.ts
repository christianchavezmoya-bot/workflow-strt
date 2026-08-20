import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "../services/documentService";
import {
  filterDocumentsForLibrary,
  filterDocumentsForTips,
  isDocumentsLibraryDocument,
  isTipsDocument,
  TIPS_DOCUMENT_TYPE,
} from "./documentScope";

const doc = (type: string): DocumentRecord => ({
  id: "1",
  name: "Sample",
  type,
  linkedTo: "",
  uploadedAt: "2026-01-01",
});

describe("documentScope", () => {
  it("identifies tips documents", () => {
    expect(isTipsDocument(doc(TIPS_DOCUMENT_TYPE))).toBe(true);
    expect(isTipsDocument(doc("technical"))).toBe(false);
  });

  it("filters library documents without tips or internal workflow types", () => {
    const all = [
      doc("technical"),
      doc(TIPS_DOCUMENT_TYPE),
      doc("issue-photo"),
      doc("drawings"),
    ];
    expect(filterDocumentsForLibrary(all).map((d) => d.type)).toEqual(["technical", "drawings"]);
    expect(filterDocumentsForTips(all).map((d) => d.type)).toEqual([TIPS_DOCUMENT_TYPE]);
  });

  it("excludes empty type from library", () => {
    expect(isDocumentsLibraryDocument(doc(""))).toBe(false);
  });
});
