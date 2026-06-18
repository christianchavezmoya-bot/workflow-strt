import api from "./api";
import axios from "axios";
import { Project, ProjectStatus, ProjectType } from "../types/project";
import { ProjectRepository } from "../repositories/ProjectRepository";
import { entityDeleteProject, entityPutProject } from "./localDB";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, invalidateWebCache } from "./webFreshCache";

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
  includeDeleted?: boolean;
  scope?: "browse" | "assigned";
  ownershipScope?: "all" | "mine";
  projectNumber?: string;
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
    if (!isMobileNativePlatform()) {
      return webCachedGet(`/projects/${id}`, async () => {
        const response = await api.get<Project>(`/projects/${id}`);
        return response.data;
      });
    }
    const response = await api.get<Project>(`/projects/${id}`);
    return response.data;
  },
  async createProject(payload: Project) {
    const response = await api.post<Project>("/projects", payload);
    if (isMobileNativePlatform()) {
      await entityPutProject({ id: response.data.id, data: response.data });
    }
    return response.data;
  },
  async updateProject(id: string, payload: Partial<Project>) {
    const response = await api.put<Project>(`/projects/${id}`, payload);
    if (isMobileNativePlatform()) {
      await entityPutProject({ id: response.data.id, data: response.data });
    } else {
      invalidateWebCache(`/projects/${id}`);
    }
    return response.data;
  },
  async updateProjectStatus(id: string, payload: UpdateProjectStatusRequest) {
    try {
      const response = await api.patch<Project>(`/projects/${id}/status`, payload);
      if (isMobileNativePlatform()) {
        await entityPutProject({ id: response.data.id, data: response.data });
      } else {
        invalidateWebCache(`/projects/${id}`);
      }
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = typeof error.response?.data?.message === "string"
          ? error.response.data.message
          : error.message;
        throw new Error(message);
      }
      throw error;
    }
  },
  async deleteProject(id: string) {
    await api.delete(`/projects/${id}`);
    if (isMobileNativePlatform()) {
      await entityDeleteProject(id);
    } else {
      invalidateWebCache(`/projects/${id}`);
    }
    return id;
  },

  async restoreProject(id: string) {
    const res = await api.post<Project>(`/projects/${id}/restore`);
    return res.data;
  },

  async purgeProject(id: string) {
    await api.delete(`/projects/${id}/purge`);
    if (isMobileNativePlatform()) {
      await entityDeleteProject(id);
    }
    return id;
  },

  async cloneAssetsFrom(targetId: string, sourceId: string): Promise<{ assetsCloned: number; assignmentsCloned: number }> {
    const res = await api.post<{ assetsCloned: number; assignmentsCloned: number }>(
      `/projects/${targetId}/clone-assets-from/${sourceId}`
    );
    return res.data;
  },
};
