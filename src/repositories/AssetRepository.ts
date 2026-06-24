import api from "../services/api";
import type { AssetIssue, ProjectAsset, ProjectAssetStatus } from "../types/projectAsset";
import {
  entityGetAsset,
  entityGetAssetsByProduct,
  entityGetAssetsByProject,
  entityPutAsset,
  entityReplaceAssetsByProduct,
  entityReplaceAssetsByProject,
  entityReplaceIssuesForAsset,
  pendingAdd,
  syncMetaSet,
} from "../services/localDB";
import { shouldSkipBlockingFetch } from "../services/connectivityMonitor";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, webCacheKey, invalidateWebCacheByPrefix } from "../services/webFreshCache";

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

function deriveOpenIssuesFromAsset(asset: ProjectAsset): Array<{
  id: string; assetId: string; projectId: string; data: unknown;
}> {
  let issues: AssetIssue[] = [];
  try { issues = JSON.parse(asset.issuesJson ?? "[]"); } catch { /* empty */ }
  return issues
    .filter((issue) => !issue.resolved)
    .map((issue) => ({
      id: issue.id,
      assetId: asset.id,
      projectId: asset.projectId,
      data: {
        issueId: issue.id,
        description: issue.description,
        issueType: issue.issueType,
        severity: issue.severity,
        isBlocking: issue.isBlocking,
        reportedAt: issue.reportedAt,
        createdBy: null,
        stepTitle: issue.stepTitle ?? null,
        runId: "",
        assetId: asset.id,
        assetTag: asset.assetTag ?? "",
        assetName: asset.assetName ?? "",
        assetLocation: asset.location ?? "",
        projectId: asset.projectId,
        jobNumber: "",
        customerName: "",
        source: "asset" as const,
      },
    }));
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

    // Background network refresh — runs unconditionally to keep IndexedDB fresh
    api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`, { params: { includeDeleted: includeDeleted || undefined } })
      .then(async (res) => {
        await entityReplaceAssetsByProduct(
          productId,
          res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
        );
        await syncMetaSet("assets");
        window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { productId } }));
      })
      .catch(() => { window.dispatchEvent(new Event("repo:assets:fetch-failed")); });

    if (local.length > 0) return local;

    if (shouldSkipBlockingFetch()) return [];

    const res = await api.get<ProjectAsset[]>(`/project-assets/by-product/${productId}`, { params: { includeDeleted: includeDeleted || undefined } });
    await entityReplaceAssetsByProduct(
      productId,
      res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
    );
    return res.data.map(fromDto);
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

    // Background network refresh — runs unconditionally to keep IndexedDB fresh
    api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`, { params: { includeDeleted: includeDeleted || undefined } })
      .then(async (res) => {
        await entityReplaceAssetsByProject(
          projectId,
          res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: a }))
        );
        await syncMetaSet("assets");
        window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { projectId } }));
      })
      .catch(() => { window.dispatchEvent(new Event("repo:assets:fetch-failed")); });

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
      const cached = await entityGetAsset(id);
      if (cached) {
        const merged = fromDto({
          ...(cached.data as ProjectAsset),
          ...patch,
        } as ProjectAsset);
        await cacheAssetLocally(merged, { dirty: true, syncIssues });
        await pendingAdd({
          id: crypto.randomUUID(),
          url: `/project-assets/${id}`,
          method: "PUT",
          body: patch,
          entityType: "asset",
          entityId: id,
          optimisticPatch: patch as Record<string, unknown>,
          createdAt: new Date().toISOString(),
        });
        return merged;
      }

      // No local asset to merge into — queue for later and preserve the old behavior.
      await pendingAdd({
        id: crypto.randomUUID(),
        url: `/project-assets/${id}`,
        method: "PUT",
        body: patch,
        entityType: "asset",
        entityId: id,
        optimisticPatch: patch as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });
      return null;
    }
  },
};
