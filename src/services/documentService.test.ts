import { describe, expect, it } from "vitest";
import { sortDocumentsForLibraryPrefetch, type DocumentPrefetchRecord } from "./documentService";

function record(partial: Partial<DocumentPrefetchRecord> & Pick<DocumentPrefetchRecord, "downloadUrl">): DocumentPrefetchRecord {
  return {
    contentType: "application/pdf",
    fileSize: 1024,
    type: "manual",
    ...partial,
  };
}

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
