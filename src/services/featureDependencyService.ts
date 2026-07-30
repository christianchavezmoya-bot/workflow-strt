import api from "./api";
import type { FeatureDependency } from "../types/featureDependency";

/** In-memory cache — deps rarely change during a session; avoids N+1 storms on remount. */
const byFeatureCache = new Map<string, FeatureDependency[]>();
const byProductCache = new Map<string, FeatureDependency[]>();

function groupByFeature(deps: FeatureDependency[]): Record<string, FeatureDependency[]> {
  const map: Record<string, FeatureDependency[]> = {};
  for (const dep of deps) {
    (map[dep.featureId] ??= []).push(dep);
  }
  return map;
}

export const featureDependencyService = {
  async getByFeature(featureId: string): Promise<FeatureDependency[]> {
    const cached = byFeatureCache.get(featureId);
    if (cached) return cached;

    const res = await api.get<FeatureDependency[]>("/feature-dependencies", {
      params: { featureId },
    });
    byFeatureCache.set(featureId, res.data);
    return res.data;
  },

  /** One request for every dependency on features linked to a product. */
  async getByProduct(productId: string): Promise<FeatureDependency[]> {
    const cached = byProductCache.get(productId);
    if (cached) return cached;

    const res = await api.get<FeatureDependency[]>("/feature-dependencies", {
      params: { productId },
    });
    byProductCache.set(productId, res.data);
    const grouped = groupByFeature(res.data);
    for (const [featureId, deps] of Object.entries(grouped)) {
      byFeatureCache.set(featureId, deps);
    }
    return res.data;
  },

  /** Convenience: product batch → map keyed by featureId. */
  async mapByProduct(productId: string): Promise<Record<string, FeatureDependency[]>> {
    const deps = await this.getByProduct(productId);
    return groupByFeature(deps);
  },

  invalidateCache(productId?: string, featureId?: string) {
    if (productId) byProductCache.delete(productId);
    if (featureId) byFeatureCache.delete(featureId);
    if (!productId && !featureId) {
      byProductCache.clear();
      byFeatureCache.clear();
    }
  },

  async create(payload: Omit<FeatureDependency, "id">): Promise<FeatureDependency> {
    const res = await api.post<FeatureDependency>("/feature-dependencies", payload);
    this.invalidateCache(undefined, payload.featureId);
    return res.data;
  },

  async update(id: string, payload: Partial<Omit<FeatureDependency, "id" | "featureId">>): Promise<FeatureDependency> {
    const res = await api.put<FeatureDependency>(`/feature-dependencies/${id}`, payload);
    byFeatureCache.clear();
    byProductCache.clear();
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/feature-dependencies/${id}`);
    byFeatureCache.clear();
    byProductCache.clear();
  },
};
