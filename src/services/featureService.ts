import api from "./api";
import type { Feature } from "../types/feature";
import { isMobileNativePlatform } from "../utils/platform";
import {
  entityGetFeaturesByProduct,
  entityReplaceFeaturesByProduct,
  referenceDataGet,
  referenceDataSet,
  syncMetaSet,
} from "./localDB";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";
import { webCachedGet, webCacheKey, invalidateWebCacheByPrefix } from "./webFreshCache";

const ALL_FEATURES_KEY = "features_all";

export const featureService = {
  /** All features in the global library */
  async getAll(): Promise<Feature[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<Feature[]>("/features");
      return res.data;
    }

    // Network-first with offline fallback — the global feature library is
    // edited in admin, so a live response must win when online; the cache only
    // backs up offline reads.
    const cached = await referenceDataGet<Feature[]>(ALL_FEATURES_KEY);
    if (shouldSkipBlockingFetch()) return cached ?? [];

    try {
      const res = await api.get<Feature[]>("/features");
      await referenceDataSet(ALL_FEATURES_KEY, res.data);
      await syncMetaSet("features");
      return res.data;
    } catch {
      return cached ?? [];
    }
  },

  async getById(id: string): Promise<Feature> {
    const res = await api.get<Feature>(`/features/${id}`);
    return res.data;
  },

  async create(payload: Omit<Feature, "id">): Promise<Feature> {
    const res = await api.post<Feature>("/features", payload);
    invalidateWebCacheByPrefix("/features/by-product/");
    return res.data;
  },

  async update(id: string, payload: Partial<Omit<Feature, "id">>): Promise<Feature> {
    const res = await api.put<Feature>(`/features/${id}`, payload);
    invalidateWebCacheByPrefix("/features/by-product/");
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/features/${id}`);
    invalidateWebCacheByPrefix("/features/by-product/");
  },

  /** Features linked to a specific product (ordered by SortOrder) */
  async getByProduct(productId: string): Promise<Feature[]> {
    if (!isMobileNativePlatform()) {
      // PERF (web): product features barely change within a session but the
      // asset/capture screens re-request them on every visit. Previously this was
      // a bare live api.get with no browser cache, so it was cold every time.
      // Wrap it in the same short-TTL stale-while-revalidate cache the asset repos
      // use: a repeat visit paints from cache instantly and revalidates in the
      // background. (webCachedGet is in-memory only, so it never persists stale
      // data across a reload.)
      return webCachedGet(
        webCacheKey(`/features/by-product/${productId}`),
        async () => {
          const res = await api.get<Feature[]>(`/features/by-product/${productId}`);
          return res.data;
        },
      );
    }

    const local = await entityGetFeaturesByProduct(productId) as Feature[];

    api.get<Feature[]>(`/features/by-product/${productId}`)
      .then(async (res) => {
        await entityReplaceFeaturesByProduct(
          productId,
          // Composite record id: a feature may be linked to multiple products,
          // so keying by feature id alone would collide across products.
          res.data.map((f) => ({ id: `${productId}:${f.id}`, productId, data: f }))
        );
        await syncMetaSet("features");
      })
      .catch(() => { /* offline — cache is source of truth */ });

    if (local.length > 0) return local;
    if (shouldSkipBlockingFetch()) return [];

    try {
      const res = await api.get<Feature[]>(`/features/by-product/${productId}`);
      await entityReplaceFeaturesByProduct(
        productId,
        res.data.map((f) => ({ id: `${productId}:${f.id}`, productId, data: f }))
      );
      return res.data;
    } catch {
      return [];
    }
  },

  /** Persist product features into the offline cache (used by bootstrap). */
  async cacheByProduct(productId: string, features: Feature[]): Promise<void> {
    if (!isMobileNativePlatform()) return;
    await entityReplaceFeaturesByProduct(
      productId,
      features.map((f) => ({ id: `${productId}:${f.id}`, productId, data: f }))
    );
  },

  async linkToProduct(productId: string, featureId: string): Promise<void> {
    await api.post(`/features/by-product/${productId}/link/${featureId}`);
    invalidateWebCacheByPrefix(`/features/by-product/${productId}`);
  },

  async unlinkFromProduct(productId: string, featureId: string): Promise<void> {
    await api.delete(`/features/by-product/${productId}/unlink/${featureId}`);
    invalidateWebCacheByPrefix(`/features/by-product/${productId}`);
  },
};
