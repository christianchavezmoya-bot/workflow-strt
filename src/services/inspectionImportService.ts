import api from "./api";
import type { InspectionImport, InspectionImportStatus, InspectionImportSource } from "../types/project";

export interface CreateInspectionImportPayload {
  source: InspectionImportSource;
  fileName?: string;
  rawJson?: string;
  projectId?: string;
  assetId?: string;
  uploadedBy?: string;
}

export interface AssignImportPayload {
  projectId: string;
  assetId?: string;
}

export const inspectionImportService = {
  async list(params: { projectId?: string; assetId?: string; status?: InspectionImportStatus }) {
    const response = await api.get<InspectionImport[]>("/inspection-imports", { params });
    return response.data;
  },

  async getById(id: string) {
    const response = await api.get<InspectionImport>(`/inspection-imports/${id}`);
    return response.data;
  },

  async create(payload: CreateInspectionImportPayload) {
    const response = await api.post<InspectionImport>("/inspection-imports", payload);
    return response.data;
  },

  async assign(id: string, payload: AssignImportPayload) {
    const response = await api.post<InspectionImport>(`/inspection-imports/${id}/assign`, payload);
    return response.data;
  },

  async markFailed(id: string, errorText?: string) {
    const response = await api.patch<InspectionImport>(`/inspection-imports/${id}/fail`, { errorText });
    return response.data;
  },

  async remove(id: string) {
    await api.delete(`/inspection-imports/${id}`);
  },

  async uploadFile(file: File, projectId?: string, uploadedBy?: string) {
    return new Promise<InspectionImport>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const rawJson = reader.result as string;
          const result = await inspectionImportService.create({
            source: "LOCAL",
            fileName: file.name,
            rawJson,
            projectId,
            uploadedBy,
          });
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  },
};
