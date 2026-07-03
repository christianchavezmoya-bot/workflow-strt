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

const ALL_FEATURES_KEY = "features_all";

export const featureService = {
  /** All features in the global library */
  async getAll(): Promise<Feature[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<Feature[]>("/features");
      return res.data;
    }

    const cached = await referenceDataGet<Feature[]>(ALL_FEATURES_KEY);

    api.get<Feature[]>("/features")
      .then(async (res) => {
        await referenceDataSet(ALL_FEATURES_KEY, res.data);
        await syncMetaSet("features");
      })
      .catch(() => { /* offline — cache is source of truth */ });

    if (cached && cached.length > 0) return cached;
    if (shouldSkipBlockingFetch()) return cached ?? [];

    try {
      const res = await api.get<Feature[]>("/features");
      await referenceDataSet(ALL_FEATURES_KEY, res.data);
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
    return res.data;
  },

  async update(id: string, payload: Partial<Omit<Feature, "id">>): Promise<Feature> {
    const res = await api.put<Feature>(`/features/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/features/${id}`);
  },

  /** Features linked to a specific product (ordered by SortOrder) */
  async getByProduct(productId: string): Promise<Feature[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<Feature[]>(`/features/by-product/${productId}`);
      return res.data;
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
  },

  async unlinkFromProduct(productId: string, featureId: string): Promise<void> {
    await api.delete(`/features/by-product/${productId}/unlink/${featureId}`);
  },
};
