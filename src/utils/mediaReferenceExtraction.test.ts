import { describe, expect, it } from "vitest";
import { extractMediaReferencePaths, extractMediaReferencePathsFromJsonField } from "./mediaReferenceExtraction";

/** Builds a reference string in the EXACT format mediaStore.ts's toStoredMediaValue() produces. */
function ref(kind: string, mime: string, path: string): string {
  return `offline-media-ref:${kind}|${encodeURIComponent(mime)}|${encodeURIComponent(path)}`;
}

describe("extractMediaReferencePaths — basic shapes", () => {
  it("extracts a bare reference string", () => {
    expect(extractMediaReferencePaths(ref("photo", "image/jpeg", "offline-media/photo-1.jpg"))).toEqual([
      "offline-media/photo-1.jpg",
    ]);
  });

  it("returns [] for a plain non-media string", () => {
    expect(extractMediaReferencePaths("just some text")).toEqual([]);
  });

  it("returns [] for an unwritten data: URL (nothing has been persisted to a path yet)", () => {
    expect(extractMediaReferencePaths("data:image/png;base64,QUJD")).toEqual([]);
  });

  it("decodes paths containing characters requiring percent-encoding", () => {
    const path = "offline-media/photo with spaces & stuff.jpg";
    expect(extractMediaReferencePaths(ref("photo", "image/jpeg", path))).toEqual([path]);
  });

  it("extracts from an array of reference strings", () => {
    const paths = ["offline-media/a.jpg", "offline-media/b.mp4"];
    const arr = paths.map((p, i) => ref(i === 1 ? "video" : "photo", "x/y", p));
    expect(extractMediaReferencePaths(arr).sort()).toEqual([...paths].sort());
  });

  it("deduplicates repeated references to the same path", () => {
    const r = ref("photo", "image/jpeg", "offline-media/dup.jpg");
    expect(extractMediaReferencePaths([r, r, r])).toEqual(["offline-media/dup.jpg"]);
  });
});

describe("extractMediaReferencePaths — real issuesJson / stepResultsJson shapes", () => {
  it("extracts resolution media from a parsed issuesJson array", () => {
    const issues = [
      { id: "issue-1", resolutionMedia: [ref("photo", "image/jpeg", "offline-media/i1.jpg")] },
      { id: "issue-2", resolutionMedia: [] },
      { id: "issue-3" }, // no resolutionMedia at all
    ];
    expect(extractMediaReferencePaths(issues)).toEqual(["offline-media/i1.jpg"]);
  });

  it("extracts capture-field media from a parsed stepResultsJson array (single value)", () => {
    const steps = [
      { stepId: "s1", values: { serialNo: ref("photo", "image/jpeg", "offline-media/s1.jpg") } },
    ];
    expect(extractMediaReferencePaths(steps)).toEqual(["offline-media/s1.jpg"]);
  });

  it("extracts capture-field media from a JSON-array-encoded step value (multi-photo field)", () => {
    // mirrors persistCaptureValueMedia's array branch: a step value can itself be a
    // JSON-stringified array of reference strings.
    const arrayValue = JSON.stringify([
      ref("photo", "image/jpeg", "offline-media/multi-1.jpg"),
      ref("photo", "image/jpeg", "offline-media/multi-2.jpg"),
    ]);
    const steps = [{ stepId: "s1", values: { sitePhotos: arrayValue } }];
    expect(extractMediaReferencePaths(steps).sort()).toEqual([
      "offline-media/multi-1.jpg",
      "offline-media/multi-2.jpg",
    ]);
  });

  it("parses a raw JSON STRING (as actually stored in stepResultsJson/issuesJson fields) via the field-key hint", () => {
    const json = JSON.stringify([{ stepId: "s1", values: { serialNo: ref("photo", "x/y", "offline-media/raw.jpg") } }]);
    expect(extractMediaReferencePathsFromJsonField(json, "stepResultsJson")).toEqual(["offline-media/raw.jpg"]);
  });

  it("recognizes a JSON array/object STRING even without the special-cased field key, by its [ / { prefix", () => {
    const arrayJson = JSON.stringify([ref("photo", "x/y", "offline-media/prefixed.jpg")]);
    expect(extractMediaReferencePaths(arrayJson)).toEqual(["offline-media/prefixed.jpg"]);
  });

  it("handles a full realistic run: multiple steps, mixed captured/uncaptured fields, and issues together", () => {
    const run = {
      stepResultsJson: JSON.stringify([
        { stepId: "s1", values: { serialNo: ref("photo", "x/y", "offline-media/run-a.jpg"), notes: "just text" } },
        { stepId: "s2", values: { macAddress: "AA:BB:CC" } }, // no media captured for this step
      ]),
      issuesJson: JSON.stringify([
        { id: "iss-1", resolutionMedia: [ref("video", "x/y", "offline-media/run-b.mp4")] },
      ]),
    };
    const paths = new Set([
      ...extractMediaReferencePathsFromJsonField(run.stepResultsJson, "stepResultsJson"),
      ...extractMediaReferencePathsFromJsonField(run.issuesJson, "issuesJson"),
    ]);
    expect([...paths].sort()).toEqual(["offline-media/run-a.jpg", "offline-media/run-b.mp4"]);
  });
});

describe("extractMediaReferencePaths — conservative on malformed/unexpected input (required test #14)", () => {
  it("a string that LOOKS like JSON but is malformed returns [] rather than throwing or guessing", () => {
    expect(() => extractMediaReferencePaths("[not valid json")).not.toThrow();
    expect(extractMediaReferencePaths("[not valid json")).toEqual([]);
  });

  it("a malformed reference string missing its path segment is ignored, not partially deleted", () => {
    expect(extractMediaReferencePaths("offline-media-ref:photo|image%2Fjpeg")).toEqual([]); // no 3rd segment
  });

  it("null/undefined/number/boolean values are all safely ignored", () => {
    expect(extractMediaReferencePaths(null)).toEqual([]);
    expect(extractMediaReferencePaths(undefined)).toEqual([]);
    expect(extractMediaReferencePaths(42)).toEqual([]);
    expect(extractMediaReferencePaths(true)).toEqual([]);
  });

  it("extractMediaReferencePathsFromJsonField returns [] for null/empty input without throwing", () => {
    expect(extractMediaReferencePathsFromJsonField(null, "stepResultsJson")).toEqual([]);
    expect(extractMediaReferencePathsFromJsonField(undefined, "stepResultsJson")).toEqual([]);
    expect(extractMediaReferencePathsFromJsonField("", "stepResultsJson")).toEqual([]);
  });

  it("a deeply malformed/circular-looking (but JSON-serializable) structure never throws", () => {
    const weird = { a: { b: { c: [{ d: ref("photo", "x/y", "offline-media/deep.jpg") }] } } };
    expect(() => extractMediaReferencePaths(weird)).not.toThrow();
    expect(extractMediaReferencePaths(weird)).toEqual(["offline-media/deep.jpg"]);
  });

  it("mixed valid and malformed entries in the same array: the valid one is still recovered", () => {
    const arr = ["not a ref", ref("photo", "x/y", "offline-media/valid.jpg"), 123, null];
    expect(extractMediaReferencePaths(arr)).toEqual(["offline-media/valid.jpg"]);
  });
});
