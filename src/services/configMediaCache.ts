import { Directory, Filesystem } from "@capacitor/filesystem";
import type { WorkflowConfig } from "../types/workflowConfig";
import type { MediaItem, Workflow } from "../types/workflow";
import { configMediaGet, configMediaGetByConfig, configMediaPut } from "./localDB";
import { ensureNativeDataDir } from "../utils/ensureNativeDataDir";
import { isMobileNativePlatform } from "../utils/platform";
import { getApiBaseUrl } from "./apiBase";

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

/**
 * Resolve a possibly server-relative media URL (e.g.
 * "/api/workflow-configs/{id}/media/{mediaId}/file") to an absolute URL that
 * fetch() can reach. Absolute http(s) URLs pass through unchanged. Returns null
 * when the URL can't be resolved.
 */
function toAbsoluteUrl(url: string): string | null {
  if (/^https?:\/\//i.test(url)) return url;
  try {
    const origin = new URL(getApiBaseUrl()).origin;
    return url.startsWith("/") ? `${origin}${url}` : `${origin}/${url}`;
  } catch {
    return null;
  }
}

function parseMedia(source: MediaSource): MediaItem[] {
  try {
    const parsed = JSON.parse(source.mediaJson || "[]");
    return Array.isArray(parsed) ? (parsed as MediaItem[]) : [];
  } catch {
    return [];
  }
}

/** Shared by hydrateConfig (mediaJson string) and hydrateWorkflowMedia (media array). */
async function hydrateMediaItems(sourceId: string, media: MediaItem[]): Promise<{ items: MediaItem[]; changed: boolean }> {
  let changed = false;
  const items = await Promise.all(
    media.map(async (item) => {
      if (!item?.id || !isCacheableUrl(item.url)) return item;
      const dataUrl = await configMediaCache.getLocalDataUrl(sourceId, item.id);
      if (dataUrl) {
        changed = true;
        return { ...item, url: dataUrl };
      }
      return item;
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

      const absoluteUrl = toAbsoluteUrl(item.url);
      if (!absoluteUrl) continue;

      try {
        const resp = await fetch(absoluteUrl, { mode: "cors" });
        if (!resp.ok) continue;
        const blob = await resp.blob();
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
      } catch {
        // Network/quota failure — non-fatal, will retry on next bootstrap.
      }
    }
  },

  /** Read a cached media item back as a data URL, or null when not cached. */
  async getLocalDataUrl(configId: string, mediaId: string): Promise<string | null> {
    if (!isMobileNativePlatform()) return null;
    const record = await configMediaGet(`${configId}:${mediaId}`);
    if (!record) return null;
    try {
      const result = await Filesystem.readFile({ path: record.localPath, directory: Directory.Data });
      const base64 = typeof result.data === "string" ? result.data : "";
      return `data:${record.mimeType ?? "application/octet-stream"};base64,${base64}`;
    } catch {
      return null;
    }
  },

  /**
   * Return a copy of the config whose media URLs are rewritten to embedded
   * data URLs from the filesystem cache (for offline rendering). Configs with
   * no cached media are returned unchanged.
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
