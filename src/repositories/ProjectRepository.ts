import api from "../services/api";
import type { Project } from "../types/project";
import { entityGetAllProjects, entityPutProject, entityPutProjects, reconcileProjects, syncMetaSet } from "../services/localDB";
import type { ProjectFilters, ProjectListResponse } from "../services/projectService";
import { shouldSkipBlockingFetch } from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "../utils/platform";
import { isOfflineNetworkError } from "../utils/offlineNetworkError";
import { webCachedGet, webCacheKey } from "../services/webFreshCache";

export type ProjectRepositoryUpdateDetail = {
  items: Project[];
  total: number;
  requestKey: string;
};

export function buildProjectRequestKey(filters?: ProjectFilters): string {
  return JSON.stringify({
    office: filters?.office ?? null,
    country: filters?.country ?? null,
    status: filters?.status ?? null,
    type: filters?.type ?? null,
    search: filters?.search ?? null,
    sortBy: filters?.sortBy ?? null,
    sortDir: filters?.sortDir ?? null,
    page: filters?.page ?? null,
    pageSize: filters?.pageSize ?? null,
    includeDeleted: filters?.includeDeleted ?? false,
    scope: filters?.scope ?? null,
    ownershipScope: filters?.ownershipScope ?? null,
    projectNumber: filters?.projectNumber ?? null,
  });
}

function canReconcileProjects(filters?: ProjectFilters): boolean {
  if (!filters) return true;
  return !filters.office
    && !filters.country
    && (!filters.status || filters.status === "All")
    && (!filters.type || filters.type === "All")
    && !filters.search
    && !filters.projectNumber
    && !filters.page
    && !filters.pageSize
    && !filters.scope
    && !filters.ownershipScope
    && !filters.includeDeleted;
}

export const ProjectRepository = {
  async getById(id: string): Promise<Project | null> {
    const all = await entityGetAllProjects();
    const found = (all as Project[]).find((p) => p.id === id);
    return found ?? null;
  },

  async getAll(filters?: ProjectFilters): Promise<ProjectListResponse> {
    const params = filters && Object.keys(filters).length ? filters : undefined;
    if (!isMobileNativePlatform()) {
      // Browser path: always confirms with the server, but a short-lived
      // in-memory cache (cleared on page reload, never persisted) avoids
      // making the user wait on a full round trip every single time they
      // revisit a screen they were just on. See webFreshCache.ts.
      return webCachedGet(
        webCacheKey("/projects", params as Record<string, unknown> | undefined),
        async () => {
          const res = await api.get<Project[] | ProjectListResponse>("/projects", { params });
          return Array.isArray(res.data)
            ? { items: res.data, total: res.data.length }
            : res.data;
        }
      );
    }

    const local = await entityGetAllProjects();
    const requestKey = buildProjectRequestKey(filters);

    // Background refresh keeps IndexedDB current, but only unfiltered full-sync fetches
    // are allowed to reconcile/remove rows from the cache. Skip when offline.
    if (!shouldSkipBlockingFetch()) {
      api.get<Project[] | ProjectListResponse>("/projects", { params })
        .then(async (res) => {
          const items = Array.isArray(res.data) ? res.data : res.data.items;
          const total = Array.isArray(res.data) ? res.data.length : res.data.total;
          await entityPutProjects(items.map((p) => ({ id: p.id, data: p })));
          if (canReconcileProjects(filters)) {
            await reconcileProjects(items.map((p) => p.id));
          }
          await syncMetaSet("projects");
          window.dispatchEvent(new CustomEvent<ProjectRepositoryUpdateDetail>("repo:projects:updated", {
            detail: { items, total, requestKey }
          }));
        })
        .catch((err) => {
          if (isOfflineNetworkError(err)) {
            window.dispatchEvent(new Event("repo:projects:fetch-failed"));
          }
        });
    }

    if (local.length > 0) {
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
      if (filters?.projectNumber) {
        const q = filters.projectNumber.toLowerCase();
        items = items.filter((p) => p.jobNumber?.toLowerCase().includes(q));
      }
      if (filters?.status && filters.status !== "All") {
        items = items.filter((p) => p.status === filters.status);
      }
      // Country filter is intentionally omitted from the IndexedDB path: Project
      // objects have no `country` field (they carry `office` city name + `officeId`).
      // The server handles country filtering; ProjectList applies office/country display
      // filtering once offices have loaded.
      return { items, total: items.length };
    }

    if (shouldSkipBlockingFetch()) return { items: [], total: 0 };

    const res = await api.get<Project[] | ProjectListResponse>("/projects", { params });
    const items = Array.isArray(res.data) ? res.data : res.data.items;
    await entityPutProjects(items.map((p) => ({ id: p.id, data: p })));
    return Array.isArray(res.data)
      ? { items: res.data, total: res.data.length }
      : res.data;
  },
};
