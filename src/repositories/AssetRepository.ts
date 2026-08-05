import api from "../services/api";
import type { ProjectAsset, ProjectAssetStatus } from "../types/projectAsset";
import {
  entityGetAllAssets,
  entityGetAsset,
  entityGetAssetsByProduct,
  entityGetAssetsByProject,
  entityPutAsset,
  entityReplaceAssetsByProduct,
  entityReplaceAssetsByProject,
  entityReplaceIssuesForAsset,
  syncMetaSet,
} from "../services/localDB";
import syncQueue from "../services/syncQueue";
import { shouldSkipBlockingFetch } from "../services/connectivityMonitor";
import { deriveOpenIssuesFromAsset } from "../utils/issueDerivation";
import { isMobileNativePlatform } from "../utils/platform";
import { isOfflineNetworkError } from "../utils/offlineNetworkError";
import { webCachedGet, webCacheKey, invalidateWebCacheByPrefix } from "../services/webFreshCache";
import { readWebSessionCache, writeWebSessionCache } from "../utils/webSessionCache";
import type { PaginatedResult, ProjectAssetPageQuery } from "../types/paginatedList";

function normalizeStatus(raw: unknown): ProjectAssetStatus {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "inprogress" || value === "running") return "InProgress";
  if (value === "paused") return "Paused";
  if (value === "pending") return "Pending";
  if (value === "complete" || value === "completed" || value === "done") return "Complete";
  if (value === "closed") return "Closed";
  if (value === "issue" || value === "issues" || value === "missing") return "Issue";
  return "NotStarted";
}

function fromDto(dto: ProjectAsset): ProjectAsset {
  return {
    ...dto,
    status: normalizeStatus(dto.status),
  };
}

async function findLocalAsset(id: string): Promise<ProjectAsset | null> {
  const cached = await entityGetAsset(id);
  if (cached) return fromDto(cached.data as ProjectAsset);
  const all = await entityGetAllAssets();
  const found = (all as ProjectAsset[]).find((asset) => asset.id === id);
  return found ? fromDto(found) : null;
}

async function cacheAssetLocally(
  asset: ProjectAsset,
  options?: { dirty?: boolean; syncIssues?: boolean }
): Promise<void> {
  await entityPutAsset({
    id: asset.id,
    productId: asset.productId,
    projectId: asset.projectId,
    data: asset,
    dirty: options?.dirty ?? false,
  });
  if (options?.syncIssues) {
    await entityReplaceIssuesForAsset(asset.id, deriveOpenIssuesFromAsset(asset));
    window.dispatchEvent(new Event("repo:issues:updated"));
  }
}

export const AssetRepository = {
  async getLocalByProduct(productId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    const local = await entityGetAssetsByProduct(productId);
    return (local as ProjectAsset[])
      .filter((asset) => includeDeleted || !asset.isDeleted)
      .map(fromDto);
  },

  async getLocalByProject(projectId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    const local = await entityGetAssetsByProject(projectId);
    return (local as ProjectAsset[])
      .filter((asset) => includeDeleted || !asset.isDeleted)
      .map(fromDto);
  },

  async getByProduct(productId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(
        webCacheKey(`/project-assets/by-product/${productId}`, { includeDeleted: includeDeleted || undefined }),
        async () => {
          const res = await api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`, { params: { includeDeleted: includeDeleted || undefined } });
          return res.data.map(fromDto);
        }
      );
    }

    const local = await this.getLocalByProduct(productId, includeDeleted);

    // Background network refresh — skip when offline to avoid doomed requests & noise
    if (!shouldSkipBlockingFetch()) {
      api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`, { params: { includeDeleted: includeDeleted || undefined } })
        .then(async (res) => {
          // A background refresh returning empty must not wipe a non-empty
          // cache — that's indistinguishable from a bad/partial server response.
          if (res.data.length === 0 && local.length > 0) return;
          await entityReplaceAssetsByProduct(
            productId,
            res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
          );
          await syncMetaSet("assets");
          window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { productId } }));
        })
        .catch((err) => {
          if (isOfflineNetworkError(err)) {
            window.dispatchEvent(new Event("repo:assets:fetch-failed"));
          }
        });
    }

    if (local.length > 0) return local;

    if (shouldSkipBlockingFetch()) return [];

    const res = await api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`, { params: { includeDeleted: includeDeleted || undefined } });
    await entityReplaceAssetsByProduct(
      productId,
      res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
    );
    return res.data.map(fromDto);
  },

  async getByProjectPage(
    projectId: string,
    query: ProjectAssetPageQuery = {},
  ): Promise<PaginatedResult<ProjectAsset>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const params = {
      page,
      pageSize,
      sort: query.sort ?? "assetTag",
      includeDeleted: query.includeDeleted || undefined,
      search: query.search?.trim() || undefined,
    };

    if (!isMobileNativePlatform()) {
      const cacheKey = webCacheKey(`/project-assets/by-project/${projectId}`, params);
      const sessionSnapshot = readWebSessionCache<PaginatedResult<ProjectAsset>>(cacheKey);
      const fetchPage = async (): Promise<PaginatedResult<ProjectAsset>> => {
        const res = await api.get<PaginatedResult<ProjectAsset>>(
          `/project-assets/by-project/${projectId}`,
          { params },
        );
        const result = {
          ...res.data,
          items: res.data.items.map(fromDto),
        };
        writeWebSessionCache(cacheKey, result);
        return result;
      };

      if (sessionSnapshot) {
        void webCachedGet(cacheKey, fetchPage, {
          ttlMs: 5_000,
          onFresh: (fresh) => writeWebSessionCache(cacheKey, fresh),
        }).catch(() => { /* background refresh failed — keep session snapshot */ });
        return sessionSnapshot;
      }

      return webCachedGet(cacheKey, fetchPage, { ttlMs: 5_000 });
    }

    const all = await this.getByProject(projectId, query.includeDeleted);
    const term = query.search?.trim().toLowerCase();
    const filtered = term
      ? all.filter((a) =>
          [a.assetTag, a.assetName, a.serialNumber, a.location]
            .some((v) => (v ?? "").toLowerCase().includes(term)))
      : all;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return {
      items,
      total: filtered.length,
      page,
      pageSize,
      hasMore: start + items.length < filtered.length,
    };
  },

  async getByProject(projectId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(
        webCacheKey(`/project-assets/by-project/${projectId}`, { includeDeleted: includeDeleted || undefined }),
        async () => {
          const res = await api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`, { params: { includeDeleted: includeDeleted || undefined } });
          return res.data.map(fromDto);
        }
      );
    }

    const local = await this.getLocalByProject(projectId, includeDeleted);

    // Background network refresh — skip when offline to avoid doomed requests & noise
    if (!shouldSkipBlockingFetch()) {
      api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`, { params: { includeDeleted: includeDeleted || undefined } })
        .then(async (res) => {
          // A background refresh returning empty must not wipe a non-empty
          // cache — that's indistinguishable from a bad/partial server response.
          if (res.data.length === 0 && local.length > 0) return;
          await entityReplaceAssetsByProject(
            projectId,
            res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
          );
          await syncMetaSet("assets");
          window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { projectId } }));
        })
        .catch((err) => {
          if (isOfflineNetworkError(err)) {
            window.dispatchEvent(new Event("repo:assets:fetch-failed"));
          }
        });
    }

    if (local.length > 0) return local;

    if (shouldSkipBlockingFetch()) return [];

    const res = await api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`, { params: { includeDeleted: includeDeleted || undefined } });
    await entityReplaceAssetsByProject(
      projectId,
      res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
    );
    return res.data.map(fromDto);
  },

  async update(
    id: string,
    patch: Partial<ProjectAsset> & Record<string, unknown>
  ): Promise<ProjectAsset | null> {
    const syncIssues = Object.prototype.hasOwnProperty.call(patch, "issuesJson");

    if (!isMobileNativePlatform()) {
      const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
      // A write just happened — make sure the next list read for this asset's
      // product/project is live, not a stale pre-edit snapshot from cache.
      invalidateWebCacheByPrefix("/project-assets/by-product/");
      invalidateWebCacheByPrefix("/project-assets/by-project/");
      return fromDto(res.data);
    }

    try {
      const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
      const asset = fromDto(res.data);
      await cacheAssetLocally(asset, { dirty: false, syncIssues });
      return asset;
    } catch {
      const base = await findLocalAsset(id);
      await syncQueue.enqueue({
        opType: "ASSET_UPDATE",
        url: `/project-assets/${id}`,
        method: "PUT",
        body: patch,
        entityType: "asset",
        entityId: id,
        optimisticPatch: patch as Record<string, unknown>,
        snapshotUpdatedAt: typeof (patch as { updatedAt?: string }).updatedAt === "string"
          ? (patch as { updatedAt?: string }).updatedAt
          : base?.updatedAt,
      });

      if (!base) {
        // Asset not in IndexedDB yet — change is queued; caller gets null.
        return null;
      }

      const merged = fromDto({ ...base, ...patch } as ProjectAsset);
      await cacheAssetLocally(merged, { dirty: true, syncIssues });
      return merged;
    }
  },
};
