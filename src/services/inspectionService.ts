import api from "./api";

export interface Inspection {
  id: string;
  installationId: string;
  name: string;
  inspector: string;
  status: string;
  photoCount: number;
  scheduledDate?: string;
}

export interface InspectionPhoto {
  id: string;
  inspectionId: string;
  fileName: string;
  uploadedAt: string;
  contentType?: string | null;
  fileSize?: number | null;
  downloadUrl?: string | null;
}

export const inspectionService = {
  async getInspections() {
    const response = await api.get<Inspection[]>("/inspections");
    return response.data;
  },
  async createInspection(payload: Inspection) {
    const response = await api.post<Inspection>("/inspections", payload);
    return response.data;
  },
  async updateInspection(id: string, payload: Inspection) {
    const response = await api.put<Inspection>(`/inspections/${id}`, payload);
    return response.data;
  },
  async uploadPhoto(inspectionId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<InspectionPhoto>(`/inspections/${inspectionId}/photos`, formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });
    return response.data;
  }
};
