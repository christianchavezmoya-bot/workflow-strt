import api from "./api";

export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  linkedTo: string;
  uploadedAt: string;
  contentType?: string | null;
  fileSize?: number | null;
  downloadUrl?: string | null;
}

export const documentService = {
  async getDocuments() {
    const response = await api.get<DocumentRecord[]>("/documents");
    return response.data;
  },
  async createDocument(payload: DocumentRecord) {
    const response = await api.post<DocumentRecord>("/documents", payload);
    return response.data;
  },
  async uploadDocument(file: File, type: string, linkedTo: string) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    formData.append("linkedTo", linkedTo);
    const response = await api.post<DocumentRecord>("/documents/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });
    return response.data;
  },
  async updateDocument(id: string, payload: DocumentRecord) {
    const response = await api.put<DocumentRecord>(`/documents/${id}`, payload);
    return response.data;
  }
};
