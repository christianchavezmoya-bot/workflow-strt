import api from "./api";
import { Installation } from "../types/installation";

export const installationService = {
  async getInstallations(projectId?: string, includeDeleted = false) {
    const response = await api.get<Installation[]>("/installations", {
      params: projectId || includeDeleted
        ? {
            ...(projectId ? { projectId } : {}),
            ...(includeDeleted ? { includeDeleted: true } : {}),
          }
        : undefined
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
  },
  async restoreInstallation(id: string) {
    const response = await api.post<Installation>(`/installations/${id}/restore`);
    return response.data;
  },
  async purgeInstallation(id: string) {
    await api.delete(`/installations/${id}/purge`);
    return id;
  }
};
