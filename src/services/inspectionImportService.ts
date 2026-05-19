import api from "./api";
import type { InspectionImport, CreateInspectionImportInput, InspectionImportStatus } from "../types/inspectionImport";

export const inspectionImportService = {
  async create(input: CreateInspectionImportInput): Promise<InspectionImport> {
    const res = await api.post<InspectionImport>("/inspection-imports", input);
    return res.data;
  },

  async listByProject(projectId: string, params?: { status?: InspectionImportStatus; assetId?: string }): Promise<InspectionImport[]> {
    const res = await api.get<InspectionImport[]>(`/projects/${projectId}/inspection-imports`, {
      params: {
        status: params?.status,
        assetId: params?.assetId,
      },
    });
    return res.data;
  },

  async assign(id: string, payload: { projectId: string; projectAssetId: string }): Promise<InspectionImport> {
    const res = await api.post<InspectionImport>(`/inspection-imports/${id}/assign`, payload);
    return res.data;
  },
};

