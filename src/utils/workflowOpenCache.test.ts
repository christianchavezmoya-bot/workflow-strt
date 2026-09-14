import { describe, expect, it, beforeEach } from "vitest";
import type { WorkflowConfig } from "../types/workflowConfig";
import {
  _clearWorkflowOpenCacheForTests,
  getCachedWorkflowShell,
  mergeWorkflowConfigMedia,
  parseWorkflowFromConfig,
  setCachedWorkflowShell,
} from "./workflowOpenCache";

describe("workflowOpenCache", () => {
  beforeEach(() => {
    _clearWorkflowOpenCacheForTests();
  });

  it("parses workflow steps from config json", () => {
    const cfg: WorkflowConfig = {
      id: "cfg-1",
      name: "Test",
      productId: "p1",
      version: 1,
      status: "Published",
      stepsJson: JSON.stringify({ steps: [{ id: "s1", title: "Step", inputs: [] }] }),
      mediaJson: "[]",
      featureSelectionsJson: "[]",
      configType: "Install",
      displayName: "Test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const wf = parseWorkflowFromConfig(cfg);
    expect(wf?.steps).toHaveLength(1);
  });

  it("stores and retrieves parsed workflow shells", () => {
    const wf = {
      id: "cfg-1",
      name: "Cached",
      productId: "p1",
      createdAt: Date.now(),
      steps: [],
      media: [],
    };
    setCachedWorkflowShell("cfg-1", wf);
    expect(getCachedWorkflowShell("cfg-1")?.name).toBe("Cached");
  });

  it("merges non-empty config mediaJson into a media-less workflow shell", () => {
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media: [] };
    const cfg = {
      mediaJson: JSON.stringify([
        { id: "photoA", type: "image", name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 },
      ]),
    };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged.media).toHaveLength(1);
    expect(merged.media[0].id).toBe("photoA");
  });

  // mergeWorkflowConfigMedia: reconciliation by media id (PR #355 offline-video fix).
  // configMediaCache.hydrateConfig() keeps cfg.mediaJson current (including locally
  // hydrated offline URLs); the workflow shell's own media array can be stale. These
  // tests lock in reconciliation-by-id in place of the old "wf.media non-empty means
  // skip merging entirely" guard, which silently discarded hydrated URLs.

  it("1. same id, different url (hydrated config url) — result uses the config's url", () => {
    const wf = {
      id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [],
      media: [{ id: "video1", type: "video" as const, name: "video1.mp4", size: 100, mime: "video/mp4", url: "https://api.example.com/media/video1", createdAt: 1 }],
    };
    const cfg = { mediaJson: JSON.stringify([{ id: "video1", type: "video", name: "video1.mp4", size: 100, mime: "video/mp4", url: "http://127.0.0.1:54751/media/abc-token", createdAt: 1 }]) };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged.media).toHaveLength(1);
    expect(merged.media[0].url).toBe("http://127.0.0.1:54751/media/abc-token");
    expect(merged.media[0].id).toBe("video1");
    expect(merged.media[0].name).toBe("video1.mp4"); // workflow item's own metadata preserved
  });

  it("2. same id, same url — result is referentially stable (no needless churn)", () => {
    const media = [{ id: "photoA", type: "image" as const, name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 }];
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media };
    const cfg = { mediaJson: JSON.stringify(media) };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged).toBe(wf);
    expect(merged.media).toBe(media);
  });

  it("3. workflow has media, config mediaJson is empty — workflow media preserved unchanged", () => {
    const media = [{ id: "photoA", type: "image" as const, name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 }];
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media };
    const cfg = { mediaJson: "[]" };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged).toBe(wf);
    expect(merged.media).toBe(media);
  });

  it("4. config has media, workflow media is empty — config media is used (existing fallback behavior)", () => {
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media: [] };
    const cfg = {
      mediaJson: JSON.stringify([
        { id: "photoA", type: "image", name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 },
      ]),
    };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged.media).toHaveLength(1);
    expect(merged.media[0].id).toBe("photoA");
  });

  it("5. unmatched workflow media item (no config counterpart) is preserved unchanged", () => {
    const existing = [{ id: "existing", type: "image" as const, name: "existing.jpg", size: 1, mime: "image/jpeg", url: "/e", createdAt: 1 }];
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media: existing };
    const cfg = { mediaJson: JSON.stringify([{ id: "other", type: "image", name: "other.jpg", size: 1, mime: "image/jpeg", url: "/o", createdAt: 2 }]) };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    const existingResult = merged.media.find((m) => m.id === "existing");
    expect(existingResult).toBe(existing[0]); // untouched, same object
    // The config-only item is still included — same fallback semantics as case 4.
    expect(merged.media.find((m) => m.id === "other")?.url).toBe("/o");
    expect(merged.media).toHaveLength(2);
  });

  it("6. multiple media items are each reconciled independently by id", () => {
    const wf = {
      id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [],
      media: [
        { id: "a", type: "image" as const, name: "a.jpg", size: 1, mime: "image/jpeg", url: "/stale/a", createdAt: 1 },
        { id: "b", type: "video" as const, name: "b.mp4", size: 1, mime: "video/mp4", url: "/stale/b", createdAt: 2 },
        { id: "c", type: "image" as const, name: "c.jpg", size: 1, mime: "image/jpeg", url: "/current/c", createdAt: 3 },
      ],
    };
    const cfg = {
      mediaJson: JSON.stringify([
        { id: "a", type: "image", name: "a.jpg", size: 1, mime: "image/jpeg", url: "/fresh/a", createdAt: 1 },
        { id: "b", type: "video", name: "b.mp4", size: 1, mime: "video/mp4", url: "http://127.0.0.1:1/media/b-token", createdAt: 2 },
        { id: "c", type: "image", name: "c.jpg", size: 1, mime: "image/jpeg", url: "/current/c", createdAt: 3 },
      ]),
    };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged.media.find((m) => m.id === "a")?.url).toBe("/fresh/a");
    expect(merged.media.find((m) => m.id === "b")?.url).toBe("http://127.0.0.1:1/media/b-token");
    expect(merged.media.find((m) => m.id === "c")?.url).toBe("/current/c"); // unchanged url
  });

  it("7. photos and videos both survive reconciliation correctly", () => {
    const wf = {
      id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [],
      media: [
        { id: "photo1", type: "image" as const, name: "photo1.jpg", size: 1, mime: "image/jpeg", url: "https://api/photo1", createdAt: 1 },
        { id: "video1", type: "video" as const, name: "video1.mp4", size: 1, mime: "video/mp4", url: "https://api/video1", createdAt: 2 },
      ],
    };
    const cfg = {
      mediaJson: JSON.stringify([
        { id: "photo1", type: "image", name: "photo1.jpg", size: 1, mime: "image/jpeg", url: "data:image/jpeg;base64,QUJD", createdAt: 1 },
        { id: "video1", type: "video", name: "video1.mp4", size: 1, mime: "video/mp4", url: "http://127.0.0.1:54751/media/video1-token", createdAt: 2 },
      ]),
    };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    const photo = merged.media.find((m) => m.id === "photo1");
    const video = merged.media.find((m) => m.id === "video1");
    expect(photo?.type).toBe("image");
    expect(photo?.url).toBe("data:image/jpeg;base64,QUJD");
    expect(video?.type).toBe("video");
    expect(video?.url).toBe("http://127.0.0.1:54751/media/video1-token");
  });

  it("8. malformed config mediaJson does not throw and preserves existing workflow media", () => {
    const media = [{ id: "photoA", type: "image" as const, name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 }];
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media };
    const cfg = { mediaJson: "{not valid json" };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged).toBe(wf);
    expect(merged.media).toBe(media);
  });

  it("9. does not mutate the original wf.media array or its items", () => {
    const originalItem = { id: "video1", type: "video" as const, name: "video1.mp4", size: 100, mime: "video/mp4", url: "https://api/video1", createdAt: 1 };
    const media = [originalItem];
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media };
    const cfg = { mediaJson: JSON.stringify([{ id: "video1", type: "video", name: "video1.mp4", size: 100, mime: "video/mp4", url: "http://127.0.0.1:1/media/token", createdAt: 1 }]) };

    mergeWorkflowConfigMedia(wf, cfg);

    expect(media).toHaveLength(1);
    expect(media[0]).toBe(originalItem);
    expect(originalItem.url).toBe("https://api/video1"); // original object's url untouched
  });

  it("10. remote URLs that hydration hasn't rewritten (Android/online) remain unchanged", () => {
    // Simulates the Android/web path, where configMediaCache never rewrites the url —
    // cfg and wf both still carry the original remote URL for the same id.
    const media = [{ id: "video1", type: "video" as const, name: "video1.mp4", size: 100, mime: "video/mp4", url: "https://api.staging.strata-ngo.com/media/video1", createdAt: 1 }];
    const wf = { id: "cfg-1", name: "wf", productId: "p1", createdAt: Date.now(), steps: [], media };
    const cfg = { mediaJson: JSON.stringify(media) };

    const merged = mergeWorkflowConfigMedia(wf, cfg);

    expect(merged.media[0].url).toBe("https://api.staging.strata-ngo.com/media/video1");
    expect(merged).toBe(wf);
  });

  it("save/reload round trip preserves each step's own mediaIds association (TEST C)", () => {
    const cfg: WorkflowConfig = {
      id: "cfg-roundtrip",
      name: "Test",
      productId: "p1",
      version: 1,
      status: "Draft",
      // Simulates what the Builder serializes on save: two steps, distinct mediaIds.
      stepsJson: JSON.stringify([
        { id: "stepA", order: 1, title: "Step A", description: "", overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true, mediaIds: ["photoA"], decisionsEnabled: false, decisions: [], inputs: [], nextStepId: "stepB" },
        { id: "stepB", order: 2, title: "Step B", description: "", overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true, mediaIds: ["videoB"], decisionsEnabled: false, decisions: [], inputs: [], nextStepId: null },
      ]),
      mediaJson: JSON.stringify([
        { id: "photoA", type: "image", name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 },
        { id: "videoB", type: "video", name: "videoB.mp4", size: 200, mime: "video/mp4", url: "/media/videoB", createdAt: 2 },
      ]),
      featureSelectionsJson: "[]",
      configType: "Install",
      displayName: "Test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = parseWorkflowFromConfig(cfg);
    const reloaded = parsed ? mergeWorkflowConfigMedia(parsed, cfg) : null;

    const stepA = reloaded?.steps.find((s) => s.id === "stepA");
    const stepB = reloaded?.steps.find((s) => s.id === "stepB");

    expect(stepA?.mediaIds).toEqual(["photoA"]);
    expect(stepB?.mediaIds).toEqual(["videoB"]);
    expect(reloaded?.media).toHaveLength(2);
  });
});
