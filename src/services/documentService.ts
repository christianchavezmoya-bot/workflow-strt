import api from "./api";
import { cacheGet, cachePut } from "./localDB";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, invalidateWebCache } from "./webFreshCache";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";
import offlineStore from "./offlineStore";
import { mediaStore, MEDIA_STORE_LIMITS } from "./mediaStore";

export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  linkedTo: string;
  uploadedAt: string;
  contentType?: string | null;
  fileSize?: number | null;
  downloadUrl?: string | null;
  createdBy?: string | null;
  notes?: string | null;
  /** JSON-encoded custom field values, stored on the backend */
  customValuesJson?: string | null;
  /** Parsed from customValuesJson — used in the UI */
  customValues?: Record<string, string>;
}

export interface DocumentConfig {
  tabsJson: string;
  fieldsJson: string;
}

interface CachedDocumentFile {
  downloadUrl: string;
  storedValue: string;
  contentType: string;
  fileSize?: number | null;
  cachedAt: string;
}

const DOCUMENTS_CACHE_KEY = "documents_v1_all";
const DOCUMENT_CONFIG_CACHE_KEY = "documents_config_v1";
const DOCUMENT_FILE_CACHE_PREFIX = "document-file:";
const DOCUMENT_PREFETCH_CONCURRENCY = 2;
/** Bootstrap prefetch cap — linked asset PDFs/images only; pending uploads are never evicted. */
export const DOCUMENT_PREFETCH_MAX_BYTES = MEDIA_STORE_LIMITS.bootstrapDocumentPrefetchMaxBytes;
export const DOCUMENT_PREFETCH_MAX_FILES = MEDIA_STORE_LIMITS.bootstrapDocumentPrefetchMaxFiles;
export const LIBRARY_DOCUMENT_PREFETCH_MAX_BYTES = MEDIA_STORE_LIMITS.bootstrapLibraryDocumentPrefetchMaxBytes;
export const LIBRARY_DOCUMENT_PREFETCH_MAX_FILES = MEDIA_STORE_LIMITS.bootstrapLibraryDocumentPrefetchMaxFiles;
const OFFLINE_DOCUMENT_MESSAGE = "Not available offline";
const queuedPrefetchKeys = new Set<string>();
const prefetchQueue: DocumentRecord[] = [];
let activePrefetches = 0;

/** Parse customValuesJson into the customValues map (in-place mutation for convenience). */
export function hydrateCustomValues(doc: DocumentRecord): DocumentRecord {
  if (doc.customValuesJson && !doc.customValues) {
    try { doc.customValues = JSON.parse(doc.customValuesJson); } catch {}
  }
  return doc;
}

export function isBackendDocumentUrl(downloadUrl: string): boolean {
  return /\/documents\/[^/?#]+\/download(?:\?|$)/i.test(downloadUrl);
}

/** Rewrite stored download URLs to a path relative to axios baseURL (`…/api`). */
export function normalizeDocumentDownloadUrl(downloadUrl: string): string {
  const match = downloadUrl.match(/\/documents\/([^/?#]+)\/download(?:\?[^\s#]*)?/i);
  if (match) return `/documents/${match[1]}/download`;
  return downloadUrl;
}

/** Extract document UUID from any backend download URL shape. */
export function extractDocumentIdFromDownloadUrl(downloadUrl: string): string | null {
  const match = downloadUrl.match(/\/documents\/([^/?#]+)\/download/i);
  return match?.[1] ?? null;
}

/** Stable cache key by document id so host/path changes do not break offline blobs. */
export function documentFileCacheKey(downloadUrl: string): string {
  const id = extractDocumentIdFromDownloadUrl(downloadUrl);
  if (id) return `${DOCUMENT_FILE_CACHE_PREFIX}id:${id}`;
  return `${DOCUMENT_FILE_CACHE_PREFIX}${encodeURIComponent(downloadUrl)}`;
}

function legacyDocumentFileCacheKey(downloadUrl: string): string {
  return `${DOCUMENT_FILE_CACHE_PREFIX}${encodeURIComponent(downloadUrl)}`;
}

/** Lookup keys: canonical id key first, then legacy URL-encoded keys for migration. */
function documentFileCacheKeysToTry(downloadUrl: string): string[] {
  const keys: string[] = [documentFileCacheKey(downloadUrl)];
  const seen = new Set(keys);

  const addKey = (key: string) => {
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  };

  addKey(legacyDocumentFileCacheKey(downloadUrl));

  const id = extractDocumentIdFromDownloadUrl(downloadUrl);
  if (id) {
    for (const variant of [
      `/api/documents/${id}/download`,
      `/documents/${id}/download`,
      `http://localhost:4000/api/documents/${id}/download`,
    ]) {
      addKey(legacyDocumentFileCacheKey(variant));
    }
  }

  return keys;
}

async function readCachedDocumentFile(downloadUrl: string): Promise<CachedDocumentFile | null> {
  const canonicalKey = documentFileCacheKey(downloadUrl);

  for (const key of documentFileCacheKeysToTry(downloadUrl)) {
    const cached = await offlineStore.getCache<CachedDocumentFile>(key);
    if (!cached?.storedValue) continue;

    if (key !== canonicalKey) {
      await offlineStore.saveCache(canonicalKey, {
        ...cached,
        downloadUrl,
        cachedAt: new Date().toISOString(),
      } satisfies CachedDocumentFile);
    }

    return cached;
  }

  return null;
}

/** True when a backend-hosted file blob is stored locally (native offline preview). */
export async function isDocumentFileCached(downloadUrl: string): Promise<boolean> {
  if (!downloadUrl || !isBackendDocumentUrl(downloadUrl)) return true;
  const cached = await readCachedDocumentFile(downloadUrl);
  return !!cached?.storedValue;
}

function shouldSkipNativeDocumentFetch(): boolean {
  // Document preview/download is a read — fail open when the radio is up even if
  // the /health ping is stale (same policy as api.ts GET reads).
  return shouldSkipBlockingFetch();
}

export function documentSyncFingerprint(
  record: Pick<DocumentRecord, "id" | "uploadedAt" | "fileSize" | "downloadUrl">,
): string {
  return `${record.id}|${record.uploadedAt}|${record.fileSize ?? 0}|${record.downloadUrl ?? ""}`;
}

/** Records whose metadata changed or are new — only these need blob prefetch. */
export function listDocumentsNeedingPrefetch(
  cached: DocumentRecord[],
  fresh: DocumentRecord[],
): DocumentRecord[] {
  const cachedById = new Map(cached.map((record) => [record.id, documentSyncFingerprint(record)]));
  return fresh.filter((record) => {
    if (!record.downloadUrl || !isBackendDocumentUrl(record.downloadUrl)) return false;
    const previous = cachedById.get(record.id);
    if (!previous) return true;
    return previous !== documentSyncFingerprint(record);
  });
}

function hydrateDocumentRecords(
  records: DocumentRecord[],
  options?: { prefetchFiles?: boolean },
): DocumentRecord[] {
  const hydrated = records.map(hydrateCustomValues);
  if (options?.prefetchFiles !== false) {
    queueDocumentPrefetch(hydrated);
  }
  return hydrated;
}

async function refreshDocumentIndex(
  options?: { prefetchFiles?: boolean },
): Promise<DocumentRecord[]> {
  const previous = await cacheGet<DocumentRecord[] | unknown>(DOCUMENTS_CACHE_KEY);
  const previousRecords = Array.isArray(previous) ? previous : [];
  const response = await api.get<DocumentRecord[]>("/documents");
  const changed = listDocumentsNeedingPrefetch(previousRecords, response.data);
  await cachePut(DOCUMENTS_CACHE_KEY, response.data);
  const hydrated = hydrateDocumentRecords(response.data, { prefetchFiles: false });
  if (options?.prefetchFiles !== false && changed.length > 0) {
    queueDocumentPrefetch(changed);
  }
  return hydrated;
}

async function blobFromStoredValue(storedValue: string, mimeType: string): Promise<Blob> {
  const dataUrl = await mediaStore.resolveMediaValue(storedValue);
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (blob.type || !mimeType) return blob;
  return new Blob([await blob.arrayBuffer()], { type: mimeType });
}

async function getCachedDocumentBlob(downloadUrl: string): Promise<Blob | null> {
  const cached = await readCachedDocumentFile(downloadUrl);
  if (!cached?.storedValue) return null;
  try {
    return await blobFromStoredValue(cached.storedValue, cached.contentType);
  } catch {
    return null;
  }
}

async function cacheDocumentBlob(downloadUrl: string, blob: Blob, record?: Pick<DocumentRecord, "contentType" | "fileSize">): Promise<Blob> {
  const contentType = blob.type || record?.contentType || "application/octet-stream";
  const storedValue = await mediaStore.persistMediaValue(
    new Blob([await blob.arrayBuffer()], { type: contentType }),
    "document",
    "document",
    downloadUrl,
  );
  await offlineStore.saveCache(documentFileCacheKey(downloadUrl), {
    downloadUrl,
    storedValue,
    contentType,
    fileSize: record?.fileSize ?? blob.size,
    cachedAt: new Date().toISOString(),
  } satisfies CachedDocumentFile);
  return blob;
}

export async function seedDocumentFileCache(
  downloadUrl: string,
  blob: Blob,
  record?: Pick<DocumentRecord, "contentType" | "fileSize">,
): Promise<void> {
  await cacheDocumentBlob(downloadUrl, blob, record);
}

export async function copyDocumentFileCache(fromDownloadUrl: string, toDownloadUrl: string): Promise<void> {
  const cached = await readCachedDocumentFile(fromDownloadUrl);
  if (!cached?.storedValue) return;
  await offlineStore.saveCache(documentFileCacheKey(toDownloadUrl), {
    ...cached,
    downloadUrl: toDownloadUrl,
    cachedAt: new Date().toISOString(),
  } satisfies CachedDocumentFile);
}

async function fetchDocumentBinaryBuffer(downloadUrl: string): Promise<ArrayBuffer> {
  const response = await api.get<Blob>(normalizeDocumentDownloadUrl(downloadUrl), {
    responseType: "blob",
    // Field manuals / large docx can exceed the default 10s axios ceiling.
    timeout: 0,
  });
  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data as BlobPart]);
  const buffer = await blob.arrayBuffer();
  return buffer.slice(0);
}

async function fetchAndCacheDocumentBlob(downloadUrl: string, record?: Pick<DocumentRecord, "contentType" | "fileSize">): Promise<Blob> {
  const response = await api.get<Blob>(normalizeDocumentDownloadUrl(downloadUrl), {
    responseType: "blob",
    timeout: 0,
  });
  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: record?.contentType ?? "application/octet-stream" });
  return await cacheDocumentBlob(downloadUrl, blob, record);
}

async function loadDocumentBlob(downloadUrl: string, record?: Pick<DocumentRecord, "contentType" | "fileSize">): Promise<Blob> {
  const cached = await getCachedDocumentBlob(downloadUrl);
  if (cached) return cached;
  if (shouldSkipNativeDocumentFetch()) {
    throw new Error(OFFLINE_DOCUMENT_MESSAGE);
  }
  return await fetchAndCacheDocumentBlob(downloadUrl, record);
}

async function prefetchDocumentRecord(record: DocumentRecord): Promise<void> {
  const downloadUrl = record.downloadUrl;
  if (!downloadUrl || !isBackendDocumentUrl(downloadUrl)) return;
  if (shouldSkipNativeDocumentFetch()) return;
  const cached = await readCachedDocumentFile(downloadUrl);
  if (cached?.storedValue) return;
  await fetchAndCacheDocumentBlob(downloadUrl, record);
}

function drainDocumentPrefetchQueue(): void {
  while (activePrefetches < DOCUMENT_PREFETCH_CONCURRENCY && prefetchQueue.length > 0) {
    const next = prefetchQueue.shift();
    if (!next?.downloadUrl) continue;
    const cacheKey = documentFileCacheKey(next.downloadUrl);
    activePrefetches += 1;
    window.setTimeout(() => {
      void prefetchDocumentRecord(next)
        .catch(() => {})
        .finally(() => {
          activePrefetches -= 1;
          queuedPrefetchKeys.delete(cacheKey);
          drainDocumentPrefetchQueue();
        });
    }, 0);
  }
}

function queueDocumentPrefetch(records: DocumentRecord[]): void {
  if (!isMobileNativePlatform()) return;
  if (shouldSkipNativeDocumentFetch()) return;
  for (const record of records) {
    const downloadUrl = record.downloadUrl;
    if (!downloadUrl || !isBackendDocumentUrl(downloadUrl)) continue;
    const cacheKey = documentFileCacheKey(downloadUrl);
    if (queuedPrefetchKeys.has(cacheKey)) continue;
    queuedPrefetchKeys.add(cacheKey);
    prefetchQueue.push(record);
  }
  drainDocumentPrefetchQueue();
}

export type AssetDocumentPrefetchLink = {
  document: Pick<DocumentRecord, "downloadUrl" | "contentType" | "fileSize">;
};

export type DocumentPrefetchRecord = Pick<DocumentRecord, "downloadUrl" | "contentType" | "fileSize" | "type">;

/** Tips first, then smaller files so bootstrap caps cover more library items. */
export function sortDocumentsForLibraryPrefetch(records: DocumentPrefetchRecord[]): DocumentPrefetchRecord[] {
  return [...records].sort((a, b) => {
    const aTips = a.type === "tips" ? 0 : 1;
    const bTips = b.type === "tips" ? 0 : 1;
    if (aTips !== bTips) return aTips - bTips;
    const aSize = a.fileSize ?? Number.MAX_SAFE_INTEGER;
    const bSize = b.fileSize ?? Number.MAX_SAFE_INTEGER;
    return aSize - bSize;
  });
}

async function prefetchDocumentBlobs(
  records: Array<Pick<DocumentRecord, "downloadUrl" | "contentType" | "fileSize">>,
  options?: { maxTotalBytes?: number; maxFiles?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ prefetched: number; skipped: number; bytesUsed: number }> {
  const maxBytes = options?.maxTotalBytes ?? DOCUMENT_PREFETCH_MAX_BYTES;
  const maxFiles = options?.maxFiles ?? DOCUMENT_PREFETCH_MAX_FILES;
  let bytesUsed = 0;
  let prefetched = 0;
  let skipped = 0;
  const seen = new Set<string>();
  const eligible = records.filter((record) => {
    const downloadUrl = record.downloadUrl;
    return downloadUrl && isBackendDocumentUrl(downloadUrl);
  });
  const total = eligible.length;
  let processed = 0;
  options?.onProgress?.(0, total);

  for (const record of records) {
    const downloadUrl = record.downloadUrl;
    if (!downloadUrl || !isBackendDocumentUrl(downloadUrl)) {
      skipped += 1;
      continue;
    }
    if (seen.has(downloadUrl)) continue;
    seen.add(downloadUrl);

    const cached = await readCachedDocumentFile(downloadUrl);
    if (cached?.storedValue) {
      prefetched += 1;
      processed += 1;
      options?.onProgress?.(processed, total);
      continue;
    }

    if (prefetched >= maxFiles) {
      skipped += 1;
      processed += 1;
      options?.onProgress?.(processed, total);
      continue;
    }

    const estimatedSize = record.fileSize ?? 0;
    if (estimatedSize > 0 && bytesUsed + estimatedSize > maxBytes) {
      skipped += 1;
      processed += 1;
      options?.onProgress?.(processed, total);
      continue;
    }

    try {
      const blob = await fetchAndCacheDocumentBlob(downloadUrl, record);
      bytesUsed += blob.size;
      prefetched += 1;
    } catch {
      skipped += 1;
    }
    processed += 1;
    options?.onProgress?.(processed, total);
  }

  return { prefetched, skipped, bytesUsed };
}

/** Bounded prefetch for documents linked to assigned assets (bootstrap pass). */
export async function prefetchAssetLinkedDocuments(
  links: AssetDocumentPrefetchLink[],
  options?: { maxTotalBytes?: number; maxFiles?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ prefetched: number; skipped: number; bytesUsed: number }> {
  if (!isMobileNativePlatform()) {
    return { prefetched: 0, skipped: links.length, bytesUsed: 0 };
  }
  if (shouldSkipNativeDocumentFetch()) {
    return { prefetched: 0, skipped: links.length, bytesUsed: 0 };
  }

  const records = links.map((link) => link.document).filter(Boolean);
  return prefetchDocumentBlobs(records, options);
}

/** Bounded prefetch for Documents library + Tips & Tricks (bootstrap pass). */
export async function prefetchLibraryDocuments(
  records: DocumentRecord[],
  options?: { maxTotalBytes?: number; maxFiles?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ prefetched: number; skipped: number; bytesUsed: number }> {
  if (!isMobileNativePlatform()) {
    return { prefetched: 0, skipped: records.length, bytesUsed: 0 };
  }
  if (shouldSkipNativeDocumentFetch()) {
    return { prefetched: 0, skipped: records.length, bytesUsed: 0 };
  }

  const backendRecords = records.filter(
    (record) => record.downloadUrl && isBackendDocumentUrl(record.downloadUrl),
  );
  return prefetchDocumentBlobs(sortDocumentsForLibraryPrefetch(backendRecords), options);
}

export const documentService = {
  async getDocuments() {
    if (!isMobileNativePlatform()) {
      return webCachedGet("/documents", async () => {
        const response = await api.get<DocumentRecord[]>("/documents");
        return hydrateDocumentRecords(response.data);
      });
    }

    const cached = await cacheGet<DocumentRecord[] | unknown>(DOCUMENTS_CACHE_KEY);
    const cachedRecords = Array.isArray(cached) ? cached : null;

    // Background refresh — metadata only; prefetch blobs for new/changed records.
    if (!shouldSkipNativeDocumentFetch()) {
      api.get<DocumentRecord[]>("/documents")
        .then(async (res) => {
          const previous = Array.isArray(cachedRecords) ? cachedRecords : [];
          const changed = listDocumentsNeedingPrefetch(previous, res.data);
          await cachePut(DOCUMENTS_CACHE_KEY, res.data).catch(() => {});
          if (changed.length > 0) {
            queueDocumentPrefetch(changed);
          }
          return hydrateDocumentRecords(res.data, { prefetchFiles: false });
        })
        .catch(() => {});
    }

    if (cachedRecords !== null) {
      return hydrateDocumentRecords(cachedRecords, { prefetchFiles: false });
    }

    // No cache yet — if offline from the API, return empty instead of hanging.
    if (shouldSkipNativeDocumentFetch()) return [];

    try {
      return await refreshDocumentIndex();
    } catch {
      return [];
    }
  },

  async refreshDocumentsCache(options?: { prefetchFiles?: boolean }) {
    if (!isMobileNativePlatform()) {
      return await this.getDocuments();
    }

    const cached = await cacheGet<DocumentRecord[] | unknown>(DOCUMENTS_CACHE_KEY);
    const cachedRecords = Array.isArray(cached) ? cached : null;

    if (shouldSkipNativeDocumentFetch()) {
      return cachedRecords ? hydrateDocumentRecords(cachedRecords, options) : [];
    }

    try {
      return await refreshDocumentIndex(options);
    } catch {
      return cachedRecords ? hydrateDocumentRecords(cachedRecords, options) : [];
    }
  },

  async createDocument(payload: DocumentRecord) {
    const body = { ...payload, customValuesJson: payload.customValues ? JSON.stringify(payload.customValues) : payload.customValuesJson };
    const response = await api.post<DocumentRecord>("/documents", body);
    invalidateWebCache("/documents");
    return hydrateCustomValues(response.data);
  },

  async uploadDocument(file: File, type: string, linkedTo: string, createdBy?: string, notes?: string, customValues?: Record<string, string>) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    formData.append("linkedTo", linkedTo);
    if (createdBy) formData.append("createdBy", createdBy);
    if (notes)     formData.append("notes", notes);
    if (customValues && Object.keys(customValues).length > 0)
      formData.append("customValuesJson", JSON.stringify(customValues));
    const response = await api.post<DocumentRecord>("/documents/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return hydrateCustomValues(response.data);
  },

  async updateDocument(id: string, payload: DocumentRecord) {
    const body = { ...payload, customValuesJson: payload.customValues ? JSON.stringify(payload.customValues) : payload.customValuesJson };
    const response = await api.put<DocumentRecord>(`/documents/${id}`, body);
    invalidateWebCache("/documents");
    return hydrateCustomValues(response.data);
  },

  async deleteDocument(id: string): Promise<void> {
    await api.delete(`/documents/${id}`);
    invalidateWebCache("/documents");
  },

  // ── Document UI config (tabs + custom fields) ─────────────────────────────

  async getDocumentConfig(): Promise<DocumentConfig> {
    if (!isMobileNativePlatform()) {
      const response = await api.get<DocumentConfig>("/documents/config");
      return response.data;
    }

    const cached = await cacheGet<DocumentConfig>(DOCUMENT_CONFIG_CACHE_KEY);

    if (!shouldSkipBlockingFetch()) {
      try {
        const response = await api.get<DocumentConfig>("/documents/config");
        await cachePut(DOCUMENT_CONFIG_CACHE_KEY, response.data);
        return response.data;
      } catch {
        if (cached) return cached;
      }
    }

    return cached ?? { tabsJson: "[]", fieldsJson: "[]" };
  },

  async saveDocumentConfig(config: DocumentConfig): Promise<void> {
    await api.put("/documents/config", config);
  },

  // ── Authenticated file download ────────────────────────────────────────────

  /** Fetch a document file with the auth token and return a Blob object URL. */
  async openDocument(downloadUrl: string): Promise<string> {
    if (!isMobileNativePlatform() || !isBackendDocumentUrl(downloadUrl)) {
      const response = await api.get<Blob>(normalizeDocumentDownloadUrl(downloadUrl), {
        responseType: "blob",
        timeout: 0,
      });
      return URL.createObjectURL(response.data);
    }

    const blob = await loadDocumentBlob(downloadUrl);
    return URL.createObjectURL(blob);
  },

  /** Fetch a document file with the auth token and return the raw ArrayBuffer (for client-side parsing). */
  async openDocumentAsBuffer(downloadUrl: string): Promise<ArrayBuffer> {
    if (!isMobileNativePlatform() || !isBackendDocumentUrl(downloadUrl)) {
      return fetchDocumentBinaryBuffer(downloadUrl);
    }

    const blob = await loadDocumentBlob(downloadUrl);
    return (await blob.arrayBuffer()).slice(0);
  },

  /** Download a document while preserving auth for backend-hosted files. */
  async downloadDocument(downloadUrl: string, fileName?: string): Promise<void> {
    if (!isBackendDocumentUrl(downloadUrl)) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const blob = isMobileNativePlatform()
      ? await loadDocumentBlob(downloadUrl)
      : (await api.get<Blob>(normalizeDocumentDownloadUrl(downloadUrl), { responseType: "blob", timeout: 0 })).data;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    if (fileName) anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  },
};
