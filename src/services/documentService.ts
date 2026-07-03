import api from "./api";
import { cacheGet, cachePut } from "./localDB";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, invalidateWebCache } from "./webFreshCache";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";

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

export const documentService = {
  async getDocuments() {
    if (!isMobileNativePlatform()) {
      return webCachedGet("/documents", async () => {
        const response = await api.get<DocumentRecord[]>("/documents");
        return response.data.map(hydrateCustomValues);
      });
    }

    const cacheKey = "documents_v1_all";
    const cached = await cacheGet<DocumentRecord[]>(cacheKey);

    // Background refresh — skip when offline to avoid doomed requests
    if (!shouldSkipBlockingFetch()) {
      api.get<DocumentRecord[]>("/documents")
        .then((res) => {
          cachePut(cacheKey, res.data).catch(() => {});
        })
        .catch(() => {});
    }

    if (cached !== null) {
      return cached.map(hydrateCustomValues);
    }

    // No cache yet — if offline, return empty instead of hanging
    if (shouldSkipBlockingFetch()) return [];

    const response = await api.get<DocumentRecord[]>("/documents");
    await cachePut(cacheKey, response.data);
    return response.data.map(hydrateCustomValues);
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
    const response = await api.get<Blob>(downloadUrl, { responseType: "blob" });
    return URL.createObjectURL(response.data);
  },

  /** Fetch a document file with the auth token and return the raw ArrayBuffer (for client-side parsing). */
  async openDocumentAsBuffer(downloadUrl: string): Promise<ArrayBuffer> {
    const response = await api.get<ArrayBuffer>(downloadUrl, { responseType: "arraybuffer" });
    return response.data;
  },

  /** Download a document while preserving auth for backend-hosted files. */
  async downloadDocument(downloadUrl: string, fileName?: string): Promise<void> {
    if (!isBackendDocumentUrl(downloadUrl)) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const response = await api.get<Blob>(downloadUrl, { responseType: "blob" });
    const objectUrl = URL.createObjectURL(response.data);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    if (fileName) anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  },
};
