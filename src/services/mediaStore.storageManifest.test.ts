import { beforeEach, describe, expect, it, vi } from "vitest";

const filesystemMocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  deleteFile: vi.fn(),
  stat: vi.fn(),
}));

const platformMocks = vi.hoisted(() => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

const localDBMocks = vi.hoisted(() => ({
  storageManifestGet: vi.fn(),
  storageManifestPut: vi.fn(),
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: filesystemMocks,
}));

vi.mock("../utils/platform", () => platformMocks);

vi.mock("./localDB", () => localDBMocks);

vi.mock("../utils/ensureNativeDataDir", () => ({
  ensureNativeDataDir: vi.fn(),
}));

vi.mock("../utils/randomId", () => ({
  randomId: () => "fixed-media-id",
}));

import { mediaStore } from "./mediaStore";

beforeEach(() => {
  vi.clearAllMocks();
  platformMocks.isMobileNativePlatform.mockReturnValue(true);
  localDBMocks.storageManifestGet.mockResolvedValue(null);
});

// ── Phase 1B: exact byte size + attribution ─────────────────────────────────────────────────
describe("mediaStore storage manifest bookkeeping — write path", () => {
  it("savePhoto (Blob source) writes a CAPTURED_MEDIA manifest entry with the EXACT Blob byte size", async () => {
    const blob = new Blob(["x".repeat(777)], { type: "image/jpeg" });
    expect(blob.size).toBe(777);

    await mediaStore.savePhoto(blob, "run-step", "run-1:step-1:field-1", undefined, {
      projectId: "proj-1",
      assetId: "asset-1",
      workflowRunId: "run-1",
    });

    expect(localDBMocks.storageManifestPut).toHaveBeenCalledTimes(1);
    const entry = localDBMocks.storageManifestPut.mock.calls[0][0];
    expect(entry).toMatchObject({
      id: "fixed-media-id",
      category: "CAPTURED_MEDIA",
      locationKind: "filesystem",
      sizeBytes: 777, // exact — proves Blob.size is used, not any base64 string length
      shared: false,
      projectId: "proj-1",
      assetId: "asset-1",
      workflowRunId: "run-1",
    });
    expect(entry.issueId).toBeUndefined();
  });

  it("saveSignature (base64 string source) writes the EXACT decoded byte size, never the base64 string length", async () => {
    const original = "y".repeat(3000); // divisible by 3 -> no base64 padding, clean assertion
    const b64 = Buffer.from(original, "utf8").toString("base64");
    const dataUrl = `data:image/png;base64,${b64}`;

    await mediaStore.saveSignature(dataUrl, "run-1:Customer", undefined, { workflowRunId: "run-1" });

    const entry = localDBMocks.storageManifestPut.mock.calls[0][0];
    expect(entry.sizeBytes).toBe(3000);
    expect(entry.sizeBytes).toBeLessThan(dataUrl.length); // the old, wrong measurement was much larger
    expect(entry.category).toBe("CAPTURED_MEDIA");
  });

  it("persistMediaValue(kind: document) is categorized DOCUMENT, not CAPTURED_MEDIA", async () => {
    const blob = new Blob(["report bytes"], { type: "application/pdf" });
    await mediaStore.persistMediaValue(blob, "document", "document", "doc-download-url", "report.pdf", {
      documentId: "doc-1",
      shared: true,
    });

    const entry = localDBMocks.storageManifestPut.mock.calls[0][0];
    expect(entry.category).toBe("DOCUMENT");
    expect(entry.documentId).toBe("doc-1");
    expect(entry.shared).toBe(true);
  });

  it("attribution fields are omitted (not set to undefined-valued keys) when not supplied — never invents ids", async () => {
    await mediaStore.savePhoto(new Blob(["a"]), "issue-report", "issue-1:0");

    const entry = localDBMocks.storageManifestPut.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(entry, "projectId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(entry, "assetId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(entry, "workflowRunId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(entry, "issueId")).toBe(false);
  });

  it("persistIssueMediaInJson attributes each resolution photo with the specific issueId, alongside the caller's run/asset/project attribution", async () => {
    const issuesJson = JSON.stringify([
      { id: "issue-A", resolutionMedia: ["data:image/png;base64,QUJD"] },
      { id: "issue-B", resolutionMedia: ["data:image/png;base64,QUI="] },
    ]);

    await mediaStore.persistIssueMediaInJson(issuesJson, "run-1", { projectId: "proj-1", assetId: "asset-1", workflowRunId: "run-1" });

    expect(localDBMocks.storageManifestPut).toHaveBeenCalledTimes(2);
    const entries = localDBMocks.storageManifestPut.mock.calls.map((c) => c[0]);
    expect(entries.find((e) => true)).toMatchObject({ projectId: "proj-1", assetId: "asset-1", workflowRunId: "run-1" });
    // Each entry carries the issue it actually belongs to, not a shared/ambiguous id.
    const issueIds = entries.map((e) => e.issueId).sort();
    expect(issueIds).toEqual(["issue-A", "issue-B"]);
  });

  it("persistStepMediaInJson/persistCaptureValueMedia propagate the caller's workflowRunId attribution through to every captured field", async () => {
    const stepResultsJson = JSON.stringify([
      { stepId: "step-1", values: { serialNo: "data:image/jpeg;base64,QUJD" } },
    ]);

    await mediaStore.persistStepMediaInJson(stepResultsJson, "run-42", {
      projectId: "proj-9", assetId: "asset-9", workflowRunId: "run-42",
    });

    const entry = localDBMocks.storageManifestPut.mock.calls[0][0];
    expect(entry).toMatchObject({ projectId: "proj-9", assetId: "asset-9", workflowRunId: "run-42" });
  });

  it("web fallback (no native filesystem) writes NO manifest entry — bytes are embedded inline in the owning JSON, not a separate storage location", async () => {
    platformMocks.isMobileNativePlatform.mockReturnValue(false);
    const blob = new Blob(["x"], { type: "image/png" });

    await mediaStore.persistMediaValue(blob, "photo", "run-step", "run-1:step-1:field-1");

    expect(localDBMocks.storageManifestPut).not.toHaveBeenCalled();
    expect(filesystemMocks.writeFile).not.toHaveBeenCalled();
  });
});

// ── Phase 1C: lazy legacy backfill on the generic read path ────────────────────────────────
describe("mediaStore storage manifest bookkeeping — lazy backfill on read", () => {
  it("readMedia backfills a manifest entry (fire-and-forget) for a legacy file with no existing entry", async () => {
    filesystemMocks.readFile.mockResolvedValue({ data: "QUJD" });
    filesystemMocks.stat.mockResolvedValue({ size: 12_345 });
    localDBMocks.storageManifestGet.mockResolvedValue(null);

    await mediaStore.readMedia("offline-media/photo-legacy.jpg", "image/jpeg");
    await Promise.resolve();
    await Promise.resolve();

    expect(localDBMocks.storageManifestGet).toHaveBeenCalledWith("legacy:offline-media/photo-legacy.jpg");
    expect(localDBMocks.storageManifestPut).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "legacy:offline-media/photo-legacy.jpg",
        category: "CAPTURED_MEDIA",
        path: "offline-media/photo-legacy.jpg",
        sizeBytes: 12_345,
        shared: false,
      }),
    );
  });

  it("readMedia does NOT re-stat or re-write when a manifest entry already exists for that path", async () => {
    filesystemMocks.readFile.mockResolvedValue({ data: "QUJD" });
    localDBMocks.storageManifestGet.mockResolvedValue({ id: "legacy:offline-media/x.jpg", category: "CAPTURED_MEDIA" });

    await mediaStore.readMedia("offline-media/x.jpg", "image/jpeg");
    await Promise.resolve();
    await Promise.resolve();

    expect(filesystemMocks.stat).not.toHaveBeenCalled();
    expect(localDBMocks.storageManifestPut).not.toHaveBeenCalled();
  });

  it("backfill is fire-and-forget: readMedia resolves even if the stat call fails, and returns the correct data URL", async () => {
    filesystemMocks.readFile.mockResolvedValue({ data: "QUJD" });
    filesystemMocks.stat.mockRejectedValue(new Error("ENOENT"));
    localDBMocks.storageManifestGet.mockResolvedValue(null);

    const result = await mediaStore.readMedia("offline-media/gone.jpg", "image/jpeg");

    expect(result).toBe("data:image/jpeg;base64,QUJD");
    await Promise.resolve();
    await Promise.resolve();
    expect(localDBMocks.storageManifestPut).not.toHaveBeenCalled();
  });

  it("backfillManifestEntryIfMissing is a no-op on web (no filesystem to stat)", async () => {
    platformMocks.isMobileNativePlatform.mockReturnValue(false);

    mediaStore.backfillManifestEntryIfMissing("id-1", "offline-media/x.jpg", "CAPTURED_MEDIA");
    await Promise.resolve();

    expect(filesystemMocks.stat).not.toHaveBeenCalled();
    expect(localDBMocks.storageManifestGet).not.toHaveBeenCalled();
  });
});
