import api from "./api";
import { cacheGet } from "./localDB";
import {
  copyDocumentFileCache,
  seedDocumentFileCache,
  type DocumentRecord,
} from "./documentService";
import syncQueue from "./syncQueue";
import offlineStore from "./offlineStore";
import { mediaStore } from "./mediaStore";
import { isMobileNativePlatform } from "../utils/platform";
import { randomId } from "../utils/randomId";
import { getServerReachable, shouldSkipBlockingFetch, shouldSkipRunMutation } from "./connectivityMonitor";
import { isOfflineNetworkError as isOfflineNetworkErrorShape } from "../utils/offlineNetworkError";

export interface AssetDocumentLink {
  id: string;        // link record id
  assetId: string;
  documentId: string;
  attachedBy?: string;
  attachedAt: string;
  document: DocumentRecord;
}

export interface AssetDocumentLinkUploadBody {
  assetId: string;
  type: string;
  fileData: string;
  fileName: string;
  fileType: string;
  name?: string;
  linkedTo?: string;
  notes?: string;
  attachedBy?: string;
  customValuesJson?: string;
}

const LINKS_CACHE_PREFIX = "asset-document-links:";
const LINKS_INDEX_KEY = "asset-document-links-index";
const DOCUMENTS_CACHE_KEY = "documents_v1_all";
const OFFLINE_LINK_PREFIX = "offline-asset-document-link-";
const OFFLINE_DOCUMENT_PREFIX = "offline-document-";

function linksCacheKey(assetId: string): string {
  return `${LINKS_CACHE_PREFIX}${assetId}`;
}

function isOfflineNetworkError(error: unknown): boolean {
  return isOfflineNetworkErrorShape(error);
}

function shouldSkipNativeAssetDocumentFetch(): boolean {
  return shouldSkipBlockingFetch() || getServerReachable() === false;
}

async function getCachedLinks(assetId: string): Promise<AssetDocumentLink[]> {
  return (await offlineStore.getCache<AssetDocumentLink[]>(linksCacheKey(assetId))) ?? [];
}

export async function saveCachedLinks(assetId: string, links: AssetDocumentLink[]): Promise<void> {
  const index = (await offlineStore.getCache<Record<string, true>>(LINKS_INDEX_KEY)) ?? {};
  if (!index[assetId]) {
    index[assetId] = true;
    await offlineStore.saveCache(LINKS_INDEX_KEY, index);
  }
  await offlineStore.saveCache(linksCacheKey(assetId), links);
}

async function appendCachedLink(assetId: string, link: AssetDocumentLink): Promise<void> {
  const existing = await getCachedLinks(assetId);
  await saveCachedLinks(assetId, [...existing, link]);
}

export async function removeCachedLinkById(assetId: string, linkId: string): Promise<void> {
  const existing = await getCachedLinks(assetId);
  await saveCachedLinks(assetId, existing.filter((link) => link.id !== linkId));
}

export async function replaceCachedLink(assetId: string, temporaryLinkId: string, nextLink: AssetDocumentLink): Promise<void> {
  const existing = await getCachedLinks(assetId);
  const index = existing.findIndex((link) => link.id === temporaryLinkId);
  if (index === -1) {
    await saveCachedLinks(assetId, [...existing, nextLink]);
    return;
  }
  const current = existing[index];
  const next = [...existing];
  next[index] = nextLink;
  await saveCachedLinks(assetId, next);
  if (current.document.downloadUrl && nextLink.document.downloadUrl) {
    await copyDocumentFileCache(current.document.downloadUrl, nextLink.document.downloadUrl);
  }
}

async function findCachedDocument(documentId: string): Promise<DocumentRecord | null> {
  const docs = await cacheGet<DocumentRecord[]>(DOCUMENTS_CACHE_KEY);
  return docs?.find((doc) => doc.id === documentId) ?? null;
}

function buildSyntheticDocument(documentId: string, fileName: string, type: string, linkedTo?: string, notes?: string, attachedBy?: string, customValuesJson?: string, contentType?: string, fileSize?: number): DocumentRecord {
  return {
    id: documentId,
    name: fileName,
    type,
    linkedTo: linkedTo ?? "",
    uploadedAt: new Date().toISOString(),
    contentType: contentType ?? "application/octet-stream",
    fileSize: fileSize ?? null,
    downloadUrl: assetDocumentLinkService.getDownloadUrl(documentId),
    createdBy: attachedBy ?? null,
    notes: notes ?? null,
    customValuesJson: customValuesJson ?? null,
  };
}

async function cancelPendingOfflineLinkCreate(linkId: string): Promise<boolean> {
  const queued = await syncQueue.listAll();
  const pendingCreate = queued.find((op) =>
    op.entityId === linkId &&
    (op.opType === "ASSET_DOCUMENT_LINK_ATTACH" || op.opType === "ASSET_DOCUMENT_LINK_UPLOAD"),
  );
  if (!pendingCreate) return false;
  await syncQueue.markDone(pendingCreate.id);
  return true;
}

async function findOwnerAssetIdByLinkId(linkId: string): Promise<string | null> {
  const index = (await offlineStore.getCache<Record<string, true>>(LINKS_INDEX_KEY)) ?? {};
  for (const assetId of Object.keys(index)) {
    const links = await getCachedLinks(assetId);
    if (links.some((link) => link.id === linkId)) return assetId;
  }
  return null;
}

export const assetDocumentLinkService = {
  async listByAsset(assetId: string): Promise<AssetDocumentLink[]> {
    if (!isMobileNativePlatform()) {
      try {
        const res = await api.get<AssetDocumentLink[]>(`/asset-document-links/by-asset/${assetId}`);
        return res.data;
      } catch {
        return [];
      }
    }

    try {
      const cached = await getCachedLinks(assetId);

      if (!shouldSkipNativeAssetDocumentFetch()) {
        api.get<AssetDocumentLink[]>(`/asset-document-links/by-asset/${assetId}`)
          .then(async (res) => {
            await saveCachedLinks(assetId, res.data);
          })
          .catch(() => {});
      }

      if (cached.length > 0) return cached;
      if (shouldSkipNativeAssetDocumentFetch()) return [];

      const res = await api.get<AssetDocumentLink[]>(`/asset-document-links/by-asset/${assetId}`);
      await saveCachedLinks(assetId, res.data);
      return res.data;
    } catch {
      return await getCachedLinks(assetId);
    }
  },

  /**
   * Batch document counts for a project or product — one request instead of N listByAsset calls.
   * Returns { [assetId]: count }. Assets with zero docs are omitted.
   */
  async countsByScope(scope: { projectId?: string; productId?: string }): Promise<Record<string, number>> {
    if (!scope.projectId && !scope.productId) return {};
    try {
      const res = await api.get<Record<string, number>>("/asset-document-links/counts", {
        params: scope.projectId ? { projectId: scope.projectId } : { productId: scope.productId },
      });
      return res.data ?? {};
    } catch {
      return {};
    }
  },

  /** Attach an existing library document to an asset (max 3). */
  async attach(assetId: string, documentId: string, attachedBy?: string): Promise<AssetDocumentLink> {
    if (!isMobileNativePlatform()) {
      const res = await api.post<AssetDocumentLink>("/asset-document-links", {
        assetId,
        documentId,
        attachedBy,
      });
      return res.data;
    }
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const res = await api.post<AssetDocumentLink>("/asset-document-links", {
        assetId,
        documentId,
        attachedBy,
      });
      try {
        await appendCachedLink(assetId, res.data);
        return res.data;
      } catch {
        return res.data;
      }
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedLinks = await getCachedLinks(assetId);
      if (cachedLinks.length >= 3) {
        throw Object.assign(new Error("Maximum 3 documents per asset."), {
          response: { status: 400, data: "Maximum 3 documents per asset." },
        });
      }
      if (cachedLinks.some((link) => link.documentId === documentId)) {
        throw Object.assign(new Error("This document is already attached to this asset."), {
          response: { status: 409, data: "This document is already attached to this asset." },
        });
      }

      const cachedDoc = await findCachedDocument(documentId);
      const offlineLink: AssetDocumentLink = {
        id: `${OFFLINE_LINK_PREFIX}${randomId()}`,
        assetId,
        documentId,
        attachedBy,
        attachedAt: new Date().toISOString(),
        document: cachedDoc ?? buildSyntheticDocument(documentId, "Document", "", undefined, undefined, attachedBy),
      };

      if (!offlineLink.document.downloadUrl) {
        offlineLink.document.downloadUrl = assetDocumentLinkService.getDownloadUrl(documentId);
      }

      await appendCachedLink(assetId, offlineLink);
      await syncQueue.enqueue({
        opType: "ASSET_DOCUMENT_LINK_ATTACH",
        url: "/asset-document-links",
        method: "POST",
        entityType: "asset-document-link",
        entityId: offlineLink.id,
        body: { assetId, documentId, attachedBy },
        optimisticPatch: { assetId, documentId },
      });
      return offlineLink;
    }
  },

  /** Upload a new file → creates library doc + link in one step (max 3). */
  async uploadAndLink(
    assetId: string,
    file: File,
    type: string,
    name?: string,
    linkedTo?: string,
    notes?: string,
    attachedBy?: string,
    customValuesJson?: string,
  ): Promise<AssetDocumentLink> {
    if (!isMobileNativePlatform()) {
      const form = new FormData();
      form.append("assetId", assetId);
      form.append("file", file);
      form.append("type", type);
      if (name)             form.append("name", name);
      if (linkedTo)         form.append("linkedTo", linkedTo);
      if (notes)            form.append("notes", notes);
      if (attachedBy)       form.append("attachedBy", attachedBy);
      if (customValuesJson) form.append("customValuesJson", customValuesJson);
      const res = await api.post<AssetDocumentLink>("/asset-document-links/upload", form);
      return res.data;
    }

    const form = new FormData();
    form.append("assetId", assetId);
    form.append("file", file);
    form.append("type", type);
    if (name)             form.append("name", name);
    if (linkedTo)         form.append("linkedTo", linkedTo);
    if (notes)            form.append("notes", notes);
    if (attachedBy)       form.append("attachedBy", attachedBy);
    if (customValuesJson) form.append("customValuesJson", customValuesJson);
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const res = await api.post<AssetDocumentLink>("/asset-document-links/upload", form);
      await appendCachedLink(assetId, res.data);
      return res.data;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedLinks = await getCachedLinks(assetId);
      if (cachedLinks.length >= 3) {
        throw Object.assign(new Error("Maximum 3 documents per asset."), {
          response: { status: 400, data: "Maximum 3 documents per asset." },
        });
      }

      const temporaryDocumentId = `${OFFLINE_DOCUMENT_PREFIX}${randomId()}`;
      const temporaryLinkId = `${OFFLINE_LINK_PREFIX}${randomId()}`;
      const fileData = await mediaStore.persistMediaValue(file, "document", "document", temporaryDocumentId, file.name);
      const syntheticDocument = buildSyntheticDocument(
        temporaryDocumentId,
        name ?? file.name,
        type,
        linkedTo,
        notes,
        attachedBy,
        customValuesJson,
        file.type,
        file.size,
      );
      if (syntheticDocument.downloadUrl) {
        await seedDocumentFileCache(syntheticDocument.downloadUrl, file, {
          contentType: file.type || "application/octet-stream",
          fileSize: file.size,
        });
      }

      const offlineLink: AssetDocumentLink = {
        id: temporaryLinkId,
        assetId,
        documentId: temporaryDocumentId,
        attachedBy,
        attachedAt: new Date().toISOString(),
        document: syntheticDocument,
      };

      await appendCachedLink(assetId, offlineLink);
      await syncQueue.enqueue({
        opType: "ASSET_DOCUMENT_LINK_UPLOAD",
        url: "/asset-document-links/upload",
        method: "POST",
        entityType: "asset-document-link",
        entityId: temporaryLinkId,
        body: {
          assetId,
          type,
          fileData,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          name,
          linkedTo,
          notes,
          attachedBy,
          customValuesJson,
        } satisfies AssetDocumentLinkUploadBody,
        optimisticPatch: {
          assetId,
          documentId: temporaryDocumentId,
        },
      });
      return offlineLink;
    }
  },

  /** Detach a link. The library document is NOT deleted. */
  async detach(linkId: string): Promise<void> {
    if (!isMobileNativePlatform()) {
      await api.delete(`/asset-document-links/${linkId}`);
      return;
    }
    const assetId = await findOwnerAssetIdByLinkId(linkId);
    const queuedCreateCancelled = await cancelPendingOfflineLinkCreate(linkId);
    if (!assetId) {
      if (!queuedCreateCancelled) {
        await api.delete(`/asset-document-links/${linkId}`);
      }
      return;
    }

    await removeCachedLinkById(assetId, linkId);
    if (queuedCreateCancelled) return;

    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      await api.delete(`/asset-document-links/${linkId}`);
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;
      await syncQueue.enqueue({
        opType: "ASSET_DOCUMENT_LINK_DETACH",
        url: `/asset-document-links/${linkId}`,
        method: "DELETE",
        entityType: "asset-document-link",
        entityId: linkId,
        body: { assetId },
        optimisticPatch: { assetId, detached: true },
      });
    }
  },

  /** Returns the authenticated download URL for a library document. */
  getDownloadUrl(documentId: string): string {
    const base = (api.defaults.baseURL ?? "").replace(/\/$/, "");
    return `${base}/documents/${documentId}/download`;
  },
};
