import { describe, expect, it } from "vitest";
import {
  documentFileCacheKey,
  documentSyncFingerprint,
  extractDocumentIdFromDownloadUrl,
  isBackendDocumentUrl,
  listDocumentsNeedingPrefetch,
  normalizeDocumentDownloadUrl,
  sortDocumentsForLibraryPrefetch,
  type DocumentPrefetchRecord,
  type DocumentRecord,
} from "./documentService";

function record(partial: Partial<DocumentPrefetchRecord> & Pick<DocumentPrefetchRecord, "downloadUrl">): DocumentPrefetchRecord {
  return {
    contentType: "application/pdf",
    fileSize: 1024,
    type: "manual",
    ...partial,
  };
}

describe("normalizeDocumentDownloadUrl", () => {
  it("rewrites absolute backend URLs without duplicating /api", () => {
    expect(
      normalizeDocumentDownloadUrl("http://172.20.8.16:4000/api/documents/abc/download"),
    ).toBe("/documents/abc/download");
  });

  it("rewrites /api-prefixed paths for axios baseURL …/api", () => {
    expect(normalizeDocumentDownloadUrl("/api/documents/abc/download")).toBe("/documents/abc/download");
  });

  it("leaves already-normalized paths unchanged", () => {
    expect(normalizeDocumentDownloadUrl("/documents/abc/download")).toBe("/documents/abc/download");
  });
});

describe("documentFileCacheKey", () => {
  it("uses stable id-based keys regardless of host", () => {
    expect(documentFileCacheKey("http://172.20.8.16:4000/api/documents/abc-123/download")).toBe(
      "document-file:id:abc-123",
    );
    expect(documentFileCacheKey("/api/documents/abc-123/download")).toBe("document-file:id:abc-123");
    expect(documentFileCacheKey("/documents/abc-123/download")).toBe("document-file:id:abc-123");
  });

  it("recognizes backend document URLs with or without /api prefix", () => {
    expect(isBackendDocumentUrl("http://172.20.8.16:4000/api/documents/abc/download")).toBe(true);
    expect(isBackendDocumentUrl("/documents/abc/download")).toBe(true);
    expect(isBackendDocumentUrl("https://cdn.example.com/file.pdf")).toBe(false);
  });

  it("extracts document id from download URLs", () => {
    expect(extractDocumentIdFromDownloadUrl("http://localhost:4000/api/documents/uuid-here/download")).toBe(
      "uuid-here",
    );
    expect(extractDocumentIdFromDownloadUrl("https://example.com/other")).toBeNull();
  });

  it("falls back to encoded URL when id cannot be parsed", () => {
    expect(documentFileCacheKey("https://cdn.example.com/file.xlsx")).toBe(
      "document-file:https%3A%2F%2Fcdn.example.com%2Ffile.xlsx",
    );
  });
});

describe("sortDocumentsForLibraryPrefetch", () => {
  it("prioritizes tips before other library documents", () => {
    const sorted = sortDocumentsForLibraryPrefetch([
      record({ downloadUrl: "/api/documents/a/download", type: "manual", fileSize: 100 }),
      record({ downloadUrl: "/api/documents/b/download", type: "tips", fileSize: 5000 }),
      record({ downloadUrl: "/api/documents/c/download", type: "drawing", fileSize: 50 }),
    ]);

    expect(sorted.map((item) => item.type)).toEqual(["tips", "drawing", "manual"]);
  });

  it("sorts by ascending file size within the same type", () => {
    const sorted = sortDocumentsForLibraryPrefetch([
      record({ downloadUrl: "/api/documents/l/download", type: "tips", fileSize: 9000 }),
      record({ downloadUrl: "/api/documents/s/download", type: "tips", fileSize: 200 }),
      record({ downloadUrl: "/api/documents/m/download", type: "tips", fileSize: 4000 }),
    ]);

    expect(sorted.map((item) => item.fileSize)).toEqual([200, 4000, 9000]);
  });

  it("does not mutate the input array", () => {
    const input = [
      record({ downloadUrl: "/api/documents/x/download", type: "manual", fileSize: 10 }),
    ];
    const snapshot = [...input];
    sortDocumentsForLibraryPrefetch(input);
    expect(input).toEqual(snapshot);
  });
});

describe("listDocumentsNeedingPrefetch", () => {
  const baseDoc = (overrides: Partial<DocumentRecord> = {}): DocumentRecord => ({
    id: "doc-1",
    name: "Manual",
    type: "manual",
    linkedTo: "General",
    uploadedAt: "2026-07-01T00:00:00Z",
    downloadUrl: "/api/documents/doc-1/download",
    fileSize: 1024,
    ...overrides,
  });

  it("returns only new or changed backend-hosted documents", () => {
    const cached = [baseDoc()];
    const fresh = [
      baseDoc(),
      baseDoc({ id: "doc-2", downloadUrl: "/api/documents/doc-2/download" }),
      baseDoc({ uploadedAt: "2026-07-02T00:00:00Z" }),
    ];

    const needed = listDocumentsNeedingPrefetch(cached, fresh);
    expect(needed.map((doc) => doc.id)).toEqual(["doc-2", "doc-1"]);
    expect(documentSyncFingerprint(baseDoc())).toBe(documentSyncFingerprint(fresh[0]));
  });

  it("skips unchanged records", () => {
    const docs = [baseDoc(), baseDoc({ id: "doc-2", downloadUrl: "/api/documents/doc-2/download" })];
    expect(listDocumentsNeedingPrefetch(docs, docs)).toEqual([]);
  });
});
