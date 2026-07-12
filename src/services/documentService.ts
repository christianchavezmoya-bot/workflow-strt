import api from "./api";
import { cacheGet, cachePut } from "./localDB";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, invalidateWebCache } from "./webFreshCache";
import { getServerReachable, shouldSkipBlockingFetch } from "./connectivityMonitor";
import offlineStore from "./offlineStore";
import { mediaStore } from "./mediaStore";

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
const DOCUMENT_FILE_CACHE_PREFIX = "document-file:";
const DOCUMENT_PREFETCH_CONCURRENCY = 2;
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
  return /\/api\/documents\/[^/]+\/download(?:\?|$)/.test(downloadUrl);
}

function documentFileCacheKey(downloadUrl: string): string {
  return `${DOCUMENT_FILE_CACHE_PREFIX}${encodeURIComponent(downloadUrl)}`;
}

function shouldSkipNativeDocumentFetch(): boolean {
  return shouldSkipBlockingFetch() || getServerReachable() === false;
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
  const response = await api.get<DocumentRecord[]>("/documents");
  await cachePut(DOCUMENTS_CACHE_KEY, response.data);
  return hydrateDocumentRecords(response.data, options);
}

async function blobFromStoredValue(storedValue: string, mimeType: string): Promise<Blob> {
  const dataUrl = await mediaStore.resolveMediaValue(storedValue);
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (blob.type || !mimeType) return blob;
  return new Blob([await blob.arrayBuffer()], { type: mimeType });
}

async function getCachedDocumentBlob(downloadUrl: string): Promise<Blob | null> {
  const cached = await offlineStore.getCache<CachedDocumentFile>(documentFileCacheKey(downloadUrl));
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
  const cached = await offlineStore.getCache<CachedDocumentFile>(documentFileCacheKey(fromDownloadUrl));
  if (!cached?.storedValue) return;
  await offlineStore.saveCache(documentFileCacheKey(toDownloadUrl), {
    ...cached,
    downloadUrl: toDownloadUrl,
    cachedAt: new Date().toISOString(),
  } satisfies CachedDocumentFile);
}

async function fetchAndCacheDocumentBlob(downloadUrl: string, record?: Pick<DocumentRecord, "contentType" | "fileSize">): Promise<Blob> {
  const response = await api.get<Blob>(downloadUrl, { responseType: "blob" });
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
  const cached = await offlineStore.getCache<CachedDocumentFile>(documentFileCacheKey(downloadUrl));
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

    // Background refresh — skip when the native app is offline from the API.
    if (!shouldSkipNativeDocumentFetch()) {
      api.get<DocumentRecord[]>("/documents")
        .then((res) => {
          const hydrated = hydrateDocumentRecords(res.data);
          cachePut(DOCUMENTS_CACHE_KEY, res.data).catch(() => {});
          return hydrated;
        })
        .catch(() => {});
    }

    if (cachedRecords !== null) {
      return hydrateDocumentRecords(cachedRecords);
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
    const response = await api.get<DocumentConfig>("/documents/config");
    return response.data;
  },

  async saveDocumentConfig(config: DocumentConfig): Promise<void> {
    await api.put("/documents/config", config);
  },

  // ── Authenticated file download ────────────────────────────────────────────

  /** Fetch a document file with the auth token and return a Blob object URL. */
  async openDocument(downloadUrl: string): Promise<string> {
    if (!isMobileNativePlatform() || !isBackendDocumentUrl(downloadUrl)) {
      const response = await api.get<Blob>(downloadUrl, { responseType: "blob" });
      return URL.createObjectURL(response.data);
    }

    const blob = await loadDocumentBlob(downloadUrl);
    return URL.createObjectURL(blob);
  },

  /** Fetch a document file with the auth token and return the raw ArrayBuffer (for client-side parsing). */
  async openDocumentAsBuffer(downloadUrl: string): Promise<ArrayBuffer> {
    if (!isMobileNativePlatform() || !isBackendDocumentUrl(downloadUrl)) {
      const response = await api.get<ArrayBuffer>(downloadUrl, { responseType: "arraybuffer" });
      return response.data;
    }

    const blob = await loadDocumentBlob(downloadUrl);
    return await blob.arrayBuffer();
  },

  /** Download a document while preserving auth for backend-hosted files. */
  async downloadDocument(downloadUrl: string, fileName?: string): Promise<void> {
    if (!isBackendDocumentUrl(downloadUrl)) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const blob = isMobileNativePlatform()
      ? await loadDocumentBlob(downloadUrl)
      : (await api.get<Blob>(downloadUrl, { responseType: "blob" })).data;
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
