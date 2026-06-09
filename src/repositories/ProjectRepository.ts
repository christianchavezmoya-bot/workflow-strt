import api from "../services/api";
import type { Project } from "../types/project";
import { entityGetAllProjects, entityPutProjects, reconcileProjects } from "../services/localDB";
import type { ProjectFilters, ProjectListResponse } from "../services/projectService";

export const ProjectRepository = {
  async getAll(filters?: ProjectFilters): Promise<ProjectListResponse> {
    const local = await entityGetAllProjects();

    // Background refresh — runs unconditionally to keep IndexedDB fresh
    const params = filters && Object.keys(filters).length ? filters : undefined;
    api.get<Project[] | ProjectListResponse>("/projects", { params })
      .then(async (res) => {
        const items = Array.isArray(res.data) ? res.data : res.data.items;
        await entityPutProjects(items.map((p) => ({ id: p.id, data: p })));
        await reconcileProjects(items.map((p) => p.id));
        window.dispatchEvent(new CustomEvent<{ items: Project[] }>("repo:projects:updated", { detail: { items } }));
      })
      .catch(() => {});

    if (local.length > 0) {
      // Apply filters client-side on local data
      let items = local as Project[];
      if (!filters?.includeDeleted) {
        items = items.filter((p) => !p.isDeleted);
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        items = items.filter(
          (p) =>
            p.jobNumber?.toLowerCase().includes(q) ||
            p.customerName?.toLowerCase().includes(q)
        );
      }
      if (filters?.status && filters.status !== "All") {
        items = items.filter((p) => p.status === filters.status);
      }
      if (filters?.country && filters.country !== "All") {
        items = items.filter(
          (p: Project & { country?: string }) => p.country === filters.country
        );
      }
      return { items, total: items.length };
    }

    // No local data — wait for network
    const res = await api.get<Project[] | ProjectListResponse>("/projects", { params });
    const items = Array.isArray(res.data) ? res.data : res.data.items;
    await entityPutProjects(items.map((p) => ({ id: p.id, data: p })));
    return Array.isArray(res.data)
      ? { items: res.data, total: res.data.length }
      : res.data;
  },
};
