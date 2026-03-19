import api from "./api";
import { Project, ProjectStatus, ProjectType } from "../types/project";

export interface ProjectFilters {
  office?: string;
  country?: string;
  status?: ProjectStatus | "All";
  type?: ProjectType | "All";
  search?: string;
  sortBy?: "jobNumber" | "customerName" | "startDate" | "status";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface UpdateProjectStatusRequest {
  status: ProjectStatus;
  approvalDecision?: string;
}

export interface ProjectListResponse {
  items: Project[];
  total: number;
}

export const projectService = {
  async getProjects(filters?: ProjectFilters) {
    const response = await api.get<Project[] | ProjectListResponse>("/projects", {
      params: filters && Object.keys(filters).length ? filters : undefined
    });
    if (Array.isArray(response.data)) {
      return { items: response.data, total: response.data.length };
    }
    return response.data;
  },
  async getProject(id: string) {
    const response = await api.get<Project>(`/projects/${id}`);
    return response.data;
  },
  async createProject(payload: Project) {
    const response = await api.post<Project>("/projects", payload);
    return response.data;
  },
  async updateProject(id: string, payload: Partial<Project>) {
    const response = await api.put<Project>(`/projects/${id}`, payload);
    return response.data;
  },
  async updateProjectStatus(id: string, payload: UpdateProjectStatusRequest) {
    const response = await api.patch<Project>(`/projects/${id}/status`, payload);
    return response.data;
  },
  async deleteProject(id: string) {
    await api.delete(`/projects/${id}`);
    return id;
  },

  async cloneAssetsFrom(targetId: string, sourceId: string): Promise<{ assetsCloned: number; assignmentsCloned: number }> {
    const res = await api.post<{ assetsCloned: number; assignmentsCloned: number }>(
      `/projects/${targetId}/clone-assets-from/${sourceId}`
    );
    return res.data;
  },
};
