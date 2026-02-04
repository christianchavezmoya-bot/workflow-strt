import api from "./api";
import { Installation } from "../types/installation";

export const installationService = {
  async getInstallations(projectId?: string) {
    const response = await api.get<Installation[]>("/installations", {
      params: projectId ? { projectId } : undefined
    });
    return response.data;
  },
  async createInstallation(payload: Installation) {
    const response = await api.post<Installation>("/installations", payload);
    return response.data;
  },
  async updateInstallation(id: string, payload: Installation) {
    const response = await api.put<Installation>(`/installations/${id}`, payload);
    return response.data;
  },
  async deleteInstallation(id: string) {
    await api.delete(`/installations/${id}`);
    return id;
  }
};
