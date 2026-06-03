import api from "./api";
import { Project, ProjectStatus, ProjectType } from "../types/project";
import { ProjectRepository } from "../repositories/ProjectRepository";
import { entityDeleteProject, entityPutProject } from "./localDB";

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
    return ProjectRepository.getAll(filters);
  },
  async getProject(id: string) {
    const response = await api.get<Project>(`/projects/${id}`);
    return response.data;
  },
  async createProject(payload: Project) {
    const response = await api.post<Project>("/projects", payload);
    await entityPutProject({ id: response.data.id, data: response.data });
    return response.data;
  },
  async updateProject(id: string, payload: Partial<Project>) {
    const response = await api.put<Project>(`/projects/${id}`, payload);
    await entityPutProject({ id: response.data.id, data: response.data });
    return response.data;
  },
  async updateProjectStatus(id: string, payload: UpdateProjectStatusRequest) {
    const response = await api.patch<Project>(`/projects/${id}/status`, payload);
    await entityPutProject({ id: response.data.id, data: response.data });
    return response.data;
  },
  async deleteProject(id: string) {
    await api.delete(`/projects/${id}`);
    await entityDeleteProject(id);
    return id;
  },

  async cloneAssetsFrom(targetId: string, sourceId: string): Promise<{ assetsCloned: number; assignmentsCloned: number }> {
    const res = await api.post<{ assetsCloned: number; assignmentsCloned: number }>(
      `/projects/${targetId}/clone-assets-from/${sourceId}`
    );
    return res.data;
  },
};
