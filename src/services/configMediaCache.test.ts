import { beforeEach, describe, expect, it, vi } from "vitest";

const filesystemMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  getUri: vi.fn(),
  writeFile: vi.fn(),
}));

const capacitorMocks = vi.hoisted(() => ({
  convertFileSrc: vi.fn((uri: string) => `capacitor://localhost/_capacitor_file_${uri}`),
  getPlatform: vi.fn(() => "android"),
}));

const platformMocks = vi.hoisted(() => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

const localDBMocks = vi.hoisted(() => ({
  configMediaGet: vi.fn(),
  configMediaGetByConfig: vi.fn(),
  configMediaPut: vi.fn(),
}));

const localMediaServerMocks = vi.hoisted(() => ({
  getUrl: vi.fn(),
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: filesystemMocks,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: capacitorMocks,
}));

vi.mock("../utils/platform", () => platformMocks);

vi.mock("./localDB", () => localDBMocks);

vi.mock("./nativePlugins/localMediaServer", () => ({
  LocalMediaServer: localMediaServerMocks,
}));

vi.mock("../utils/ensureNativeDataDir", () => ({
  ensureNativeDataDir: vi.fn(),
}));

vi.mock("../utils/mediaUrl", () => ({
  resolveMediaUrl: (url: string) => url,
}));

import { configMediaCache } from "./configMediaCache";
import type { Workflow, MediaItem } from "../types/workflow";

function makeWorkflow(media: MediaItem[]): Workflow {
  return {
    id: "wf-1",
    media,
  } as unknown as Workflow;
}

const photoRecord = {
  id: "wf-1:photo-1",
  configId: "wf-1",
  mediaId: "photo-1",
  remoteUrl: "/api/workflow-configs/wf-1/media/photo-1/file",
  localPath: "offline-config-media/wf-1/photo-1.jpg",
  mimeType: "image/jpeg",
  syncedAt: "2026-01-01T00:00:00.000Z",
};

const videoRecord = {
  id: "wf-1:video-1",
  configId: "wf-1",
  mediaId: "video-1",
  remoteUrl: "/api/workflow-configs/wf-1/media/video-1/file",
  localPath: "offline-config-media/wf-1/video-1.mp4",
  mimeType: "video/mp4",
  syncedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  platformMocks.isMobileNativePlatform.mockReturnValue(true);
  capacitorMocks.convertFileSrc.mockImplementation((uri: string) => `capacitor://localhost/_capacitor_file_${uri}`);
  capacitorMocks.getPlatform.mockReturnValue("android");
  localDBMocks.configMediaGetByConfig.mockResolvedValue([]);
});

// These tests run with Capacitor.getPlatform() === "android" (the beforeEach default),
// exercising the Filesystem.getUri()+Capacitor.convertFileSrc() path that is preserved
// unchanged for Android. The iOS-specific LocalMediaServer path is covered in the
// "iOS local media server video path" describe block below.
describe("configMediaCache offline video hydration (Android/default native path)", () => {
  it("A. resolves a native cached video via getUri + convertFileSrc, without reading file bytes", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([videoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(videoRecord);
    filesystemMocks.getUri.mockResolvedValue({ uri: "file:///var/mobile/offline-config-media/wf-1/video-1.mp4" });

    const videoItem: MediaItem = {
      id: "video-1",
      type: "video",
      name: "Panel install",
      size: 1024,
      mime: "video/mp4",
      url: "/api/workflow-configs/wf-1/media/video-1/file",
      createdAt: Date.now(),
    };

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([videoItem]));

    expect(filesystemMocks.getUri).toHaveBeenCalledWith({
      path: videoRecord.localPath,
      directory: "DATA",
    });
    expect(capacitorMocks.convertFileSrc).toHaveBeenCalledWith(
      "file:///var/mobile/offline-config-media/wf-1/video-1.mp4",
    );
    expect(result.media[0].url).toBe(
      "capacitor://localhost/_capacitor_file_file:///var/mobile/offline-config-media/wf-1/video-1.mp4",
    );
    expect(filesystemMocks.readFile).not.toHaveBeenCalled();
  });

  it("B. cached image hydration remains unchanged (base64 data: URL, no native URI resolution)", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([photoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(photoRecord);
    filesystemMocks.readFile.mockResolvedValue({ data: "QUJD" });

    const photoItem: MediaItem = {
      id: "photo-1",
      type: "image",
      name: "Panel photo",
      size: 512,
      mime: "image/jpeg",
      url: "/api/workflow-configs/wf-1/media/photo-1/file",
      createdAt: Date.now(),
    };

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([photoItem]));

    expect(filesystemMocks.readFile).toHaveBeenCalledWith({
      path: photoRecord.localPath,
      directory: "DATA",
    });
    expect(result.media[0].url).toBe("data:image/jpeg;base64,QUJD");
    expect(filesystemMocks.getUri).not.toHaveBeenCalled();
    expect(capacitorMocks.convertFileSrc).not.toHaveBeenCalled();
  });

  it("C. is a no-op on web for both prefetch and hydrate", async () => {
    platformMocks.isMobileNativePlatform.mockReturnValue(false);

    const videoItem: MediaItem = {
      id: "video-1",
      type: "video",
      name: "Panel install",
      size: 1024,
      mime: "video/mp4",
      url: "/api/workflow-configs/wf-1/media/video-1/file",
      createdAt: Date.now(),
    };
    const workflow = makeWorkflow([videoItem]);

    const result = await configMediaCache.hydrateWorkflowMedia(workflow);

    expect(result).toBe(workflow);
    expect(localDBMocks.configMediaGetByConfig).not.toHaveBeenCalled();
    expect(filesystemMocks.getUri).not.toHaveBeenCalled();
    expect(filesystemMocks.readFile).not.toHaveBeenCalled();

    await configMediaCache.prefetchConfig({ id: "wf-1", mediaJson: JSON.stringify([videoItem]) });
    expect(filesystemMocks.writeFile).not.toHaveBeenCalled();
  });

  it("D. an existing (pre-fix) ConfigMediaRecord hydrates successfully through the new video path", async () => {
    // Simulates a video downloaded by an older app build: the ConfigMediaRecord
    // shape (id/configId/mediaId/remoteUrl/localPath/mimeType/syncedAt) is
    // unchanged, so it must work with no re-download and no migration.
    localDBMocks.configMediaGetByConfig.mockResolvedValue([videoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(videoRecord);
    filesystemMocks.getUri.mockResolvedValue({ uri: "file:///var/mobile/offline-config-media/wf-1/video-1.mp4" });

    const videoItem: MediaItem = {
      id: "video-1",
      type: "video",
      name: "Panel install",
      size: 1024,
      mime: "video/mp4",
      url: "/api/workflow-configs/wf-1/media/video-1/file",
      createdAt: Date.now(),
    };

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([videoItem]));

    expect(result.media[0].url).toContain("capacitor://localhost/_capacitor_file_");
    expect(localDBMocks.configMediaPut).not.toHaveBeenCalled(); // no re-download / no migration write
  });

  it("E. a media item with incomplete type metadata still hydrates via the video path when MIME says video", async () => {
    const untypedVideoRecord = { ...videoRecord, mediaId: "video-2", id: "wf-1:video-2" };
    localDBMocks.configMediaGetByConfig.mockResolvedValue([untypedVideoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(untypedVideoRecord);
    filesystemMocks.getUri.mockResolvedValue({ uri: "file:///var/mobile/offline-config-media/wf-1/video-2.mp4" });

    // item.type is missing/wrong, but item.mime correctly says video/mp4.
    const legacyItem = {
      id: "video-2",
      name: "Legacy video",
      size: 2048,
      mime: "video/mp4",
      url: "/api/workflow-configs/wf-1/media/video-2/file",
      createdAt: Date.now(),
    } as unknown as MediaItem;

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([legacyItem]));

    expect(filesystemMocks.getUri).toHaveBeenCalled();
    expect(filesystemMocks.readFile).not.toHaveBeenCalled();
    expect(result.media[0].url).toContain("capacitor://localhost/_capacitor_file_");
  });

  it("E2. falls back to the ConfigMediaRecord's stored mimeType when the item carries neither type nor mime", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([videoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(videoRecord);
    filesystemMocks.getUri.mockResolvedValue({ uri: "file:///var/mobile/offline-config-media/wf-1/video-1.mp4" });

    const bareItem = {
      id: "video-1",
      name: "Bare metadata video",
      size: 2048,
      url: "/api/workflow-configs/wf-1/media/video-1/file",
      createdAt: Date.now(),
    } as unknown as MediaItem;

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([bareItem]));

    expect(filesystemMocks.getUri).toHaveBeenCalled();
    expect(result.media[0].url).toContain("capacitor://localhost/_capacitor_file_");
  });

  it("F. does NOT fall back to base64 hydration when getUri fails — leaves the item unresolved and logs", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([videoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(videoRecord);
    filesystemMocks.getUri.mockRejectedValue(new Error("ENOENT: file not found"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const videoItem: MediaItem = {
      id: "video-1",
      type: "video",
      name: "Panel install",
      size: 1024,
      mime: "video/mp4",
      url: "/api/workflow-configs/wf-1/media/video-1/file",
      createdAt: Date.now(),
    };

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([videoItem]));

    // Unresolved: still the original remote URL, never the base64 data: URL.
    expect(result.media[0].url).toBe(videoItem.url);
    expect(filesystemMocks.readFile).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to resolve a native seekable URL"),
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("F2. does NOT fall back to base64 hydration when convertFileSrc returns an empty URL", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([videoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(videoRecord);
    filesystemMocks.getUri.mockResolvedValue({ uri: "file:///var/mobile/offline-config-media/wf-1/video-1.mp4" });
    capacitorMocks.convertFileSrc.mockReturnValue("");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const videoItem: MediaItem = {
      id: "video-1",
      type: "video",
      name: "Panel install",
      size: 1024,
      mime: "video/mp4",
      url: "/api/workflow-configs/wf-1/media/video-1/file",
      createdAt: Date.now(),
    };

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([videoItem]));

    expect(result.media[0].url).toBe(videoItem.url);
    expect(filesystemMocks.readFile).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

describe("configMediaCache offline video hydration (iOS local media server path)", () => {
  const videoItem: MediaItem = {
    id: "video-1",
    type: "video",
    name: "Panel install",
    size: 1024,
    mime: "video/mp4",
    url: "/api/workflow-configs/wf-1/media/video-1/file",
    createdAt: Date.now(),
  };

  beforeEach(() => {
    capacitorMocks.getPlatform.mockReturnValue("ios");
  });

  it("G. resolves a cached video via LocalMediaServer.getUrl, not Filesystem.getUri/convertFileSrc", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([videoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(videoRecord);
    localMediaServerMocks.getUrl.mockResolvedValue({ url: "http://127.0.0.1:54321/media/abc-token" });

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([videoItem]));

    expect(localMediaServerMocks.getUrl).toHaveBeenCalledWith({ path: videoRecord.localPath });
    expect(result.media[0].url).toBe("http://127.0.0.1:54321/media/abc-token");
    expect(filesystemMocks.getUri).not.toHaveBeenCalled();
    expect(filesystemMocks.readFile).not.toHaveBeenCalled();
    expect(capacitorMocks.convertFileSrc).not.toHaveBeenCalled();
  });

  it("H. does NOT fall back to base64 hydration when LocalMediaServer.getUrl rejects — leaves the item unresolved and logs", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([videoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(videoRecord);
    localMediaServerMocks.getUrl.mockRejectedValue(new Error("Path is outside the allowed cache root"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([videoItem]));

    expect(result.media[0].url).toBe(videoItem.url);
    expect(filesystemMocks.readFile).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to obtain a local-media-server URL"),
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("I. does NOT fall back to base64 hydration when LocalMediaServer.getUrl resolves with an empty url", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([videoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(videoRecord);
    localMediaServerMocks.getUrl.mockResolvedValue({ url: "" });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([videoItem]));

    expect(result.media[0].url).toBe(videoItem.url);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("J. cached photo hydration on iOS is unaffected — still the base64 data: URL path", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([photoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(photoRecord);
    filesystemMocks.readFile.mockResolvedValue({ data: "QUJD" });

    const photoItem: MediaItem = {
      id: "photo-1",
      type: "image",
      name: "Panel photo",
      size: 512,
      mime: "image/jpeg",
      url: "/api/workflow-configs/wf-1/media/photo-1/file",
      createdAt: Date.now(),
    };

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([photoItem]));

    expect(result.media[0].url).toBe("data:image/jpeg;base64,QUJD");
    expect(localMediaServerMocks.getUrl).not.toHaveBeenCalled();
  });

  it("K. an existing (pre-fix) ConfigMediaRecord hydrates successfully through the iOS local-server path with no re-download", async () => {
    localDBMocks.configMediaGetByConfig.mockResolvedValue([videoRecord]);
    localDBMocks.configMediaGet.mockResolvedValue(videoRecord);
    localMediaServerMocks.getUrl.mockResolvedValue({ url: "http://127.0.0.1:54321/media/abc-token" });

    const result = await configMediaCache.hydrateWorkflowMedia(makeWorkflow([videoItem]));

    expect(result.media[0].url).toBe("http://127.0.0.1:54321/media/abc-token");
    expect(localDBMocks.configMediaPut).not.toHaveBeenCalled();
  });
});
