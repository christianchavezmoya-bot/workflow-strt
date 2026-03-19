import api from "./api";
import type { DocumentRecord } from "./documentService";

export interface AssetDocumentLink {
  id: string;        // link record id
  assetId: string;
  documentId: string;
  attachedBy?: string;
  attachedAt: string;
  document: DocumentRecord;
}

export const assetDocumentLinkService = {
  async listByAsset(assetId: string): Promise<AssetDocumentLink[]> {
    try {
      const res = await api.get<AssetDocumentLink[]>(`/asset-document-links/by-asset/${assetId}`);
      return res.data;
    } catch {
      return [];
    }
  },

  /** Attach an existing library document to an asset (max 3). */
  async attach(assetId: string, documentId: string, attachedBy?: string): Promise<AssetDocumentLink> {
    const res = await api.post<AssetDocumentLink>("/asset-document-links", {
      assetId,
      documentId,
      attachedBy,
    });
    return res.data;
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
    const form = new FormData();
    form.append("assetId", assetId);
    form.append("file", file);
    form.append("type", type);
    if (name)             form.append("name", name);
    if (linkedTo)         form.append("linkedTo", linkedTo);
    if (notes)            form.append("notes", notes);
    if (attachedBy)       form.append("attachedBy", attachedBy);
    if (customValuesJson) form.append("customValuesJson", customValuesJson);
    const res = await api.post<AssetDocumentLink>("/asset-document-links/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  /** Detach a link. The library document is NOT deleted. */
  async detach(linkId: string): Promise<void> {
    await api.delete(`/asset-document-links/${linkId}`);
  },

  /** Returns the authenticated download URL for a library document. */
  getDownloadUrl(documentId: string): string {
    const base = (api.defaults.baseURL ?? "").replace(/\/$/, "");
    return `${base}/documents/${documentId}/download`;
  },
};
