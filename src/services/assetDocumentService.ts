import api from "./api";
import type { AssetDocument } from "../types/assetDocument";

export const assetDocumentService = {
  async listByAsset(assetId: string): Promise<AssetDocument[]> {
    try {
      const res = await api.get<AssetDocument[]>(`/asset-documents/by-asset/${assetId}`);
      return res.data;
    } catch {
      return [];
    }
  },

  async upload(
    assetId: string,
    label: string,
    file: File,
    uploadedBy?: string,
  ): Promise<AssetDocument> {
    const form = new FormData();
    form.append("assetId", assetId);
    form.append("label", label);
    if (uploadedBy) form.append("uploadedBy", uploadedBy);
    form.append("file", file);
    const res = await api.post<AssetDocument>("/asset-documents", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async addRevision(
    docId: string,
    file: File,
    uploadedBy?: string,
  ): Promise<AssetDocument> {
    const form = new FormData();
    if (uploadedBy) form.append("uploadedBy", uploadedBy);
    form.append("file", file);
    const res = await api.post<AssetDocument>(`/asset-documents/${docId}/revisions`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async patchLabel(id: string, label: string): Promise<AssetDocument> {
    const res = await api.patch<AssetDocument>(`/asset-documents/${id}`, { label });
    return res.data;
  },

  getDownloadUrl(id: string): string {
    const base = (api.defaults.baseURL ?? "").replace(/\/$/, "");
    return `${base}/asset-documents/${id}/download`;
  },

  getRevisionDownloadUrl(id: string, revId: string): string {
    const base = (api.defaults.baseURL ?? "").replace(/\/$/, "");
    return `${base}/asset-documents/${id}/revisions/${revId}/download`;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/asset-documents/${id}`);
  },
};
