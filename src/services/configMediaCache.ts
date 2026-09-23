import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import type { WorkflowConfig } from "../types/workflowConfig";
import type { MediaItem, Workflow } from "../types/workflow";
import { configMediaGet, configMediaGetByConfig, configMediaPut, storageManifestPut, type ConfigMediaRecord } from "./localDB";
import { ensureNativeDataDir } from "../utils/ensureNativeDataDir";
import { isMobileNativePlatform } from "../utils/platform";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { LocalMediaServer } from "./nativePlugins/localMediaServer";
import { mediaStore } from "./mediaStore";

/**
 * configMediaCache — downloads a workflow config's (or legacy workflow
 * template's) reference media (step photos, diagrams) to the device
 * filesystem so the WorkOrder runner and PDF reports render correctly while
 * offline.
 *
 * Config media that is already a data: URL is left untouched (it is already
 * embedded in the cached config). Only remote http(s) URLs are downloaded.
 *
 * `prefetchConfig`/`hydrateConfig` work with anything shaped like
 * { id, mediaJson } — this covers both WorkflowConfig and the raw
 * WorkflowTemplateDto returned by workflowTemplateService, so both the
 * modern config path and the legacy template path share one cache.
 *
 * Photos and videos hydrate to different URL shapes. Photos become an
 * embedded base64 data: URL (cheap, no seek requirement) on every platform.
 * Videos never read the file into JS memory and never base64-encode it — a
 * data: URL is not reliably seekable in native WebViews and can hit
 * media-element size limits, which is why offline reference video playback
 * was broken in the first place — but the two native platforms need
 * different video resolution strategies:
 *
 * - iOS: real-device testing proved that BOTH `capacitor://` and
 *   `http://localhost` convertFileSrc URLs are unreachable by <video>'s
 *   AVFoundation-backed resource loading on iOS (it does not consult
 *   WKWebView's registered scheme handlers at all for media elements — a
 *   platform limitation, not a bug in this app). iOS instead resolves
 *   cached videos through a local, loopback-only (127.0.0.1) HTTP server
 *   (LocalMediaServerPlugin, ios/App/App/LocalMediaServerPlugin.swift),
 *   which AVFoundation *can* genuinely connect to, with real Range/206
 *   support.
 * - Android: Chromium's WebView video pipeline is architecturally
 *   different and does consult the registered asset-loader for <video>, so
 *   the existing Filesystem.getUri()+Capacitor.convertFileSrc() path is
 *   preserved unchanged (not proven broken, so not touched).
 *
 * Either way, if native URL resolution fails it must NOT fall back to the
 * data: URL path — that would silently resurrect the bug this module
 * exists to fix.
 */

/** Minimal shape prefetchConfig needs — satisfied by WorkflowConfig and WorkflowTemplateDto. */
export interface MediaSource {
  id: string;
  mediaJson: string;
}

const CONFIG_MEDIA_ROOT = "offline-config-media";

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return "bin";
}

function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf("base64,");
  return idx >= 0 ? dataUrl.slice(idx + "base64,".length) : dataUrl;
}

/** A media URL worth caching: anything that isn't already embedded as data. */
function isCacheableUrl(url: string | undefined): url is string {
  return !!url && !url.startsWith("data:") && !url.startsWith("blob:");
}

function parseMedia(source: MediaSource): MediaItem[] {
  try {
    const parsed = JSON.parse(source.mediaJson || "[]");
    return Array.isArray(parsed) ? (parsed as MediaItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * Robust video detection: primary signal is the media item's own `type`,
 * but legacy/incomplete records (cached before `type` was reliably set, or
 * whose MediaItem metadata is stale) are still recognized via MIME —
 * either the item's declared `mime` or the MIME captured on download in
 * the ConfigMediaRecord.
 */
function isVideoRecord(item: MediaItem, record: ConfigMediaRecord): boolean {
  if (item.type === "video") return true;
  if (item.mime?.toLowerCase().startsWith("video/")) return true;
  if (record.mimeType?.toLowerCase().startsWith("video/")) return true;
  return false;
}

/** Reads a cached file fully into memory and returns it as a base64 data: URL. Photos only. */
async function readCachedDataUrl(record: ConfigMediaRecord): Promise<string | null> {
  try {
    const result = await Filesystem.readFile({ path: record.localPath, directory: Directory.Data });
    const base64 = typeof result.data === "string" ? result.data : "";
    return `data:${record.mimeType ?? "application/octet-stream"};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Android video path (unchanged from the original PR #355 approach —
 * Android's Chromium WebView video pipeline does consult the registered
 * asset loader for <video>, so this has not been proven broken there).
 * Never reads the file's bytes and never base64-encodes it. On failure,
 * logs loudly and returns null — callers must leave the item's URL
 * unresolved rather than falling back to readCachedDataUrl, so a broken
 * native URI resolution is visibly broken offline instead of silently
 * degrading back to the non-seekable data: URL.
 */
async function readCachedVideoFileUrl(record: ConfigMediaRecord): Promise<string | null> {
  try {
    const uriResult = await Filesystem.getUri({ path: record.localPath, directory: Directory.Data });
    const convertedUrl = Capacitor.convertFileSrc(uriResult.uri);
    if (!convertedUrl) {
      throw new Error("Capacitor.convertFileSrc returned an empty URL");
    }
    return convertedUrl;
  } catch (error) {
    console.error(
      `[configMediaCache] Failed to resolve a native seekable URL for cached video "${record.mediaId}" ` +
        `(localPath: ${record.localPath}). Not falling back to base64 hydration — this video will not ` +
        `play offline until this is resolved.`,
      error,
    );
    return null;
  }
}

/**
 * iOS video path: asks the local loopback-only HTTP server plugin for a
 * `http://127.0.0.1:<port>/media/<token>` URL — see the module doc comment
 * above for why iOS specifically cannot use convertFileSrc for video. Never
 * reads the file's bytes on the JS side (the native plugin streams them
 * directly to the socket) and never base64-encodes it. On failure, logs
 * loudly and returns null — same no-silent-fallback contract as the
 * Android path above.
 */
async function readCachedVideoLocalServerUrl(record: ConfigMediaRecord): Promise<string | null> {
  try {
    const { url } = await LocalMediaServer.getUrl({ path: record.localPath });
    if (!url) {
      throw new Error("LocalMediaServer.getUrl returned an empty URL");
    }
    return url;
  } catch (error) {
    console.error(
      `[configMediaCache] Failed to obtain a local-media-server URL for cached video "${record.mediaId}" ` +
        `(localPath: ${record.localPath}). Not falling back to base64 hydration — this video will not ` +
        `play offline until this is resolved.`,
      error,
    );
    return null;
  }
}

/** Picks the per-platform video resolution strategy — see the module doc comment above. */
function readCachedVideoUrl(record: ConfigMediaRecord): Promise<string | null> {
  return Capacitor.getPlatform() === "ios" ? readCachedVideoLocalServerUrl(record) : readCachedVideoFileUrl(record);
}

/** Shared by hydrateConfig (mediaJson string) and hydrateWorkflowMedia (media array). */
async function hydrateMediaItems(sourceId: string, media: MediaItem[]): Promise<{ items: MediaItem[]; changed: boolean }> {
  let changed = false;
  const items = await Promise.all(
    media.map(async (item) => {
      if (!item?.id || !isCacheableUrl(item.url)) return item;
      const record = await configMediaGet(`${sourceId}:${item.id}`);
      if (!record) return item;

      // Lazy legacy backfill (Phase 1C): a config_media row written before the storage
      // manifest existed has no manifest entry yet — discover and stat it here, on this
      // natural read path, never as a blocking startup scan.
      mediaStore.backfillManifestEntryIfMissing(record.id, record.localPath, "CONFIG_MEDIA", {
        configId: record.configId,
        shared: true,
      });

      const localUrl = isVideoRecord(item, record)
        ? await readCachedVideoUrl(record)
        : await readCachedDataUrl(record);

      if (!localUrl) return item;
      changed = true;
      return { ...item, url: localUrl };
    })
  );
  return { items, changed };
}

async function ensureDir(configId: string): Promise<void> {
  await ensureNativeDataDir(`${CONFIG_MEDIA_ROOT}/${configId}`);
}

function blobToBase64(blob: Blob): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({ base64: stripDataUrlPrefix(dataUrl), mime: blob.type || "application/octet-stream" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const configMediaCache = {
  /**
   * Download all remote media for a workflow config (or legacy workflow
   * template DTO — anything shaped like { id, mediaJson }) to the
   * filesystem. Safe to call repeatedly — already-cached items are skipped.
   */
  async prefetchConfig(config: MediaSource): Promise<void> {
    if (!isMobileNativePlatform()) return;
    const media = parseMedia(config);
    if (media.length === 0) return;

    for (const item of media) {
      if (!item?.id || !isCacheableUrl(item.url)) continue;
      const recordId = `${config.id}:${item.id}`;
      const existing = await configMediaGet(recordId);
      if (existing) continue; // already downloaded

      const absoluteUrl = resolveMediaUrl(item.url);
      if (!absoluteUrl) continue;

      try {
        const resp = await fetch(absoluteUrl, { mode: "cors" });
        if (!resp.ok) continue;
        const blob = await resp.blob(); // blob.size is the ACTUAL byte count — never the base64 length below
        const { base64, mime } = await blobToBase64(blob);
        await ensureDir(config.id);
        const path = `${CONFIG_MEDIA_ROOT}/${config.id}/${item.id}.${extFromMime(mime)}`;
        await Filesystem.writeFile({ path, directory: Directory.Data, data: base64, recursive: true });
        await configMediaPut({
          id: recordId,
          configId: config.id,
          mediaId: item.id,
          remoteUrl: item.url,
          localPath: path,
          mimeType: mime,
        });
        // Config reference media is shared across every project that uses this product/config
        // (see the offline-storage-management dependency graph) — never project-scoped.
        await storageManifestPut({
          id: recordId,
          category: "CONFIG_MEDIA",
          path,
          locationKind: "filesystem",
          sizeBytes: blob.size,
          mimeType: mime,
          configId: config.id,
          shared: true,
          createdAt: new Date().toISOString(),
        });
      } catch {
        // Network/quota failure — non-fatal, will retry on next bootstrap.
      }
    }
  },

  /**
   * Read a cached photo back as a data URL, or null when not cached. Kept
   * for photos only — cached videos must go through hydrateConfig /
   * hydrateWorkflowMedia so they resolve to a native seekable file URL
   * instead (see readCachedVideoFileUrl above).
   */
  async getLocalDataUrl(configId: string, mediaId: string): Promise<string | null> {
    if (!isMobileNativePlatform()) return null;
    const record = await configMediaGet(`${configId}:${mediaId}`);
    if (!record) return null;
    return readCachedDataUrl(record);
  },

  /**
   * Return a copy of the config whose media URLs are rewritten to local
   * filesystem-cache URLs for offline rendering (embedded data: URLs for
   * photos, native seekable file URLs for videos). Configs with no cached
   * media are returned unchanged.
   */
  async hydrateConfig(config: WorkflowConfig): Promise<WorkflowConfig> {
    if (!isMobileNativePlatform()) return config;
    const cachedForConfig = await configMediaGetByConfig(config.id);
    if (cachedForConfig.length === 0) return config;

    const media = parseMedia(config);
    if (media.length === 0) return config;

    const { items, changed } = await hydrateMediaItems(config.id, media);
    if (!changed) return config;
    return { ...config, mediaJson: JSON.stringify(items) };
  },

  /**
   * Same as hydrateConfig, but for a legacy Workflow template object whose
   * media is already a parsed array (not a mediaJson string). Returns the
   * workflow unchanged when nothing is cached yet.
   */
  async hydrateWorkflowMedia(workflow: Workflow): Promise<Workflow> {
    if (!isMobileNativePlatform()) return workflow;
    if (!workflow.media || workflow.media.length === 0) return workflow;
    const cachedForWorkflow = await configMediaGetByConfig(workflow.id);
    if (cachedForWorkflow.length === 0) return workflow;

    const { items, changed } = await hydrateMediaItems(workflow.id, workflow.media);
    if (!changed) return workflow;
    return { ...workflow, media: items };
  },
};

export default configMediaCache;
