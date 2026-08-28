import { Directory, Filesystem } from "@capacitor/filesystem";
import type { OfflineMediaRef } from "./offlineStore";
import { ensureNativeDataDir } from "../utils/ensureNativeDataDir";
import { isMobileNativePlatform } from "../utils/platform";
import { randomId } from "../utils/randomId";
import { MediaMissingError } from "./mediaErrors";

/**
 * Native media filesystem policy:
 * - Pending upload blobs (sync queue MEDIA_UPLOAD) are never evicted automatically.
 * - Config reference media: offline-config-media/ (configMediaCache).
 * - Captured field media: offline-media/ (this module).
 * - Linked document files: offlineStore document-file:* entries (documentService).
 * Automatic LRU eviction is not implemented; when added, skip pending uploads and
 * uploaded:false mediaStore refs.
 */
export const MEDIA_STORE_LIMITS = {
  bootstrapDocumentPrefetchMaxBytes: 50 * 1024 * 1024,
  bootstrapDocumentPrefetchMaxFiles: 30,
  /** Documents library + Tips & Tricks files (tips prioritized during bootstrap). */
  bootstrapLibraryDocumentPrefetchMaxBytes: 100 * 1024 * 1024,
  bootstrapLibraryDocumentPrefetchMaxFiles: 50,
} as const;

const MEDIA_ROOT = "offline-media";
const MEDIA_REF_PREFIX = "offline-media-ref:";
const JSON_MEDIA_FIELDS = new Set(["issuesJson", "stepResultsJson"]);

function extFromMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("webm")) return "webm";
  return "bin";
}

function mimeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? "application/octet-stream";
}

function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf("base64,");
  return idx >= 0 ? dataUrl.slice(idx + "base64,".length) : dataUrl;
}

function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function ensureRoot(): Promise<void> {
  await ensureNativeDataDir(MEDIA_ROOT);
}

async function writeMedia(
  kind: OfflineMediaRef["kind"],
  source: string | Blob,
  linkedToType: OfflineMediaRef["linkedToType"],
  linkedToId: string,
  fileName?: string,
): Promise<OfflineMediaRef> {
  await ensureRoot();

  const dataUrl = typeof source === "string" ? source : await blobToDataUrl(source);
  const mimeType = mimeFromDataUrl(dataUrl);
  const ext = extFromMime(mimeType);
  const mediaId = randomId();
  const safeName = fileName ?? `${kind}-${mediaId}.${ext}`;
  const path = `${MEDIA_ROOT}/${safeName}`;
  const data = stripDataUrlPrefix(dataUrl);

  await Filesystem.writeFile({
    path,
    directory: Directory.Data,
    data,
    recursive: true,
  });

  return {
    mediaId,
    kind,
    path,
    mimeType,
    fileName: safeName,
    size: data.length,
    linkedToType,
    linkedToId,
    createdAt: new Date().toISOString(),
    uploaded: false,
  };
}

function toStoredMediaValue(ref: OfflineMediaRef): string {
  return `${MEDIA_REF_PREFIX}${ref.kind}|${encodeURIComponent(ref.mimeType)}|${encodeURIComponent(ref.path)}`;
}

function parseStoredMediaValue(value: string): Pick<OfflineMediaRef, "kind" | "mimeType" | "path"> | null {
  if (!value.startsWith(MEDIA_REF_PREFIX)) return null;
  const raw = value.slice(MEDIA_REF_PREFIX.length);
  const [kind, mimeType, path] = raw.split("|");
  if (!kind || !mimeType || !path) return null;
  return {
    kind: kind as OfflineMediaRef["kind"],
    mimeType: decodeURIComponent(mimeType),
    path: decodeURIComponent(path),
  };
}

async function resolveUploadValue(
  value: unknown,
  key?: string,
  missingMedia?: Array<{ path: string; fieldKey?: string; error: string }>,
): Promise<unknown> {
  if (typeof value === "string") {
    const looksLikeJsonContainer = value.startsWith("[") || value.startsWith("{");
    if (JSON_MEDIA_FIELDS.has(key ?? "") || looksLikeJsonContainer) {
      try {
        const parsed = JSON.parse(value);
        const resolved = await resolveUploadValue(parsed, key, missingMedia);
        return JSON.stringify(resolved);
      } catch {
        return value;
      }
    }
    const ref = parseStoredMediaValue(value);
    if (ref) {
      try {
        return await mediaStore.readMedia(ref.path, ref.mimeType);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        missingMedia?.push({ path: ref.path, fieldKey: key, error: message });
        return "";
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return await Promise.all(value.map((item) => resolveUploadValue(item, key, missingMedia)));
  }

  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(async ([entryKey, entryValue]) => {
        return [entryKey, await resolveUploadValue(entryValue, entryKey, missingMedia)] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  return value;
}

export interface ResolveUploadPayloadResult<T> {
  payload: T;
  missingMedia: Array<{ path: string; fieldKey?: string; error: string }>;
}

export const mediaStore = {
  async savePhoto(source: string | Blob, linkedToType: OfflineMediaRef["linkedToType"], linkedToId: string, fileName?: string) {
    return await writeMedia("photo", source, linkedToType, linkedToId, fileName);
  },

  async saveVideo(source: string | Blob, linkedToType: OfflineMediaRef["linkedToType"], linkedToId: string, fileName?: string) {
    return await writeMedia("video", source, linkedToType, linkedToId, fileName);
  },

  async saveSignature(source: string | Blob, linkedToId: string, fileName?: string) {
    return await writeMedia("signature", source, "signature", linkedToId, fileName);
  },

  async readMedia(path: string, mimeType = "application/octet-stream"): Promise<string> {
    try {
      const result = await Filesystem.readFile({
        path,
        directory: Directory.Data,
      });
      const base64 = typeof result.data === "string" ? result.data : "";
      return toDataUrl(base64, mimeType);
    } catch (error) {
      throw new MediaMissingError(path, { cause: error });
    }
  },

  async deleteMedia(path: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.Data,
      });
    } catch {
      // Missing file is non-fatal.
    }
  },

  isStoredMediaValue(value: string): boolean {
    return value.startsWith(MEDIA_REF_PREFIX);
  },

  getMediaKind(value: string): "photo" | "video" | "signature" | "document" {
    const ref = parseStoredMediaValue(value);
    if (ref) return ref.kind;
    return value.startsWith("data:video") ? "video" : "photo";
  },

  async resolveMediaValue(value: string): Promise<string> {
    const ref = parseStoredMediaValue(value);
    if (!ref) return value;
    return await this.readMedia(ref.path, ref.mimeType);
  },

  async persistMediaValue(
    source: string | Blob,
    kind: "photo" | "video" | "signature" | "document",
    linkedToType: OfflineMediaRef["linkedToType"],
    linkedToId: string,
    fileName?: string,
  ): Promise<string> {
    if (typeof source === "string" && this.isStoredMediaValue(source)) {
      return source;
    }
    if (!this.isNativeFilesystemAvailable()) {
      return typeof source === "string" ? source : await blobToDataUrl(source);
    }
    const ref = kind === "photo"
      ? await this.savePhoto(source, linkedToType, linkedToId, fileName)
      : kind === "video"
        ? await this.saveVideo(source, linkedToType, linkedToId, fileName)
        : kind === "signature"
          ? await this.saveSignature(source, linkedToId, fileName)
          : await writeMedia("document", source, linkedToType, linkedToId, fileName);
    return toStoredMediaValue(ref);
  },

  async resolveUploadPayloadWithDiagnostics<T>(payload: T): Promise<ResolveUploadPayloadResult<T>> {
    const missingMedia: Array<{ path: string; fieldKey?: string; error: string }> = [];
    const resolved = await resolveUploadValue(payload, undefined, missingMedia);
    return { payload: resolved as T, missingMedia };
  },

  async resolveUploadPayload<T>(payload: T): Promise<T> {
    const { payload: resolved } = await this.resolveUploadPayloadWithDiagnostics(payload);
    return resolved;
  },

  /**
   * Persist resolution photo blobs in issuesJson to the filesystem before
   * queuing offline. Returns the original string when nothing changed.
   */
  async persistIssueMediaInJson(issuesJson: string, scopeId: string): Promise<string> {
    if (!this.isNativeFilesystemAvailable()) return issuesJson;
    let issues: Array<{ id?: string; resolutionMedia?: string[] }>;
    try {
      const parsed = JSON.parse(issuesJson);
      if (!Array.isArray(parsed)) return issuesJson;
      issues = parsed;
    } catch {
      return issuesJson;
    }

    let changed = false;
    const next = await Promise.all(
      issues.map(async (issue, index) => {
        const media = issue?.resolutionMedia;
        if (!media?.length) return issue;
        const issueKey = issue.id ?? String(index);
        const persisted = await Promise.all(
          media.map(async (value, mediaIndex) => {
            if (typeof value !== "string") return value;
            if (this.isStoredMediaValue(value)) return value;
            if (!value.startsWith("data:") && !value.startsWith("blob:")) return value;
            changed = true;
            return this.persistMediaValue(
              value,
              "photo",
              "issue-resolution",
              `${scopeId}:${issueKey}:${mediaIndex}`,
            );
          }),
        );
        return { ...issue, resolutionMedia: persisted };
      }),
    );

    return changed ? JSON.stringify(next) : issuesJson;
  },

  /**
   * Persist capture photo/video blobs in stepResultsJson before queuing offline.
   */
  async persistStepMediaInJson(stepResultsJson: string, scopeId: string): Promise<string> {
    if (!this.isNativeFilesystemAvailable()) return stepResultsJson;
    let steps: Array<{ stepId?: string; values?: Record<string, string> }>;
    try {
      const parsed = JSON.parse(stepResultsJson);
      if (!Array.isArray(parsed)) return stepResultsJson;
      steps = parsed;
    } catch {
      return stepResultsJson;
    }

    let changed = false;
    const next = await Promise.all(
      steps.map(async (step, stepIndex) => {
        if (!step?.values) return step;
        const stepKey = step.stepId ?? String(stepIndex);
        const valueEntries = await Promise.all(
          Object.entries(step.values).map(async ([inputId, raw]) => {
            const persisted = await this.persistCaptureValueMedia(raw, scopeId, stepKey, inputId);
            if (persisted !== raw) changed = true;
            return [inputId, persisted] as const;
          }),
        );
        return { ...step, values: Object.fromEntries(valueEntries) };
      }),
    );

    return changed ? JSON.stringify(next) : stepResultsJson;
  },

  async persistCaptureValueMedia(
    value: string,
    scopeId: string,
    stepKey: string,
    inputId: string,
  ): Promise<string> {
    if (this.isStoredMediaValue(value)) return value;
    if (value.startsWith("data:") || value.startsWith("blob:")) {
      const kind = value.startsWith("data:video") ? "video" : "photo";
      return this.persistMediaValue(value, kind, "run-step", `${scopeId}:${stepKey}:${inputId}`);
    }
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return value;
      let arrayChanged = false;
      const next = await Promise.all(
        parsed.map(async (item, index) => {
          if (typeof item !== "string") return item;
          if (this.isStoredMediaValue(item)) return item;
          if (!item.startsWith("data:") && !item.startsWith("blob:")) return item;
          arrayChanged = true;
          const kind = item.startsWith("data:video") ? "video" : "photo";
          return this.persistMediaValue(
            item,
            kind,
            "run-step",
            `${scopeId}:${stepKey}:${inputId}:${index}`,
          );
        }),
      );
      return arrayChanged ? JSON.stringify(next) : value;
    } catch {
      return value;
    }
  },

  isNativeFilesystemAvailable(): boolean {
    return isMobileNativePlatform();
  },
};

export default mediaStore;
