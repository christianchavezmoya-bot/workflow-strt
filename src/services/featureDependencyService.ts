import api from "./api";
import type { FeatureDependency } from "../types/featureDependency";

export const featureDependencyService = {
  async getByFeature(featureId: string): Promise<FeatureDependency[]> {
    const res = await api.get<FeatureDependency[]>("/feature-dependencies", {
      params: { featureId },
    });
    return res.data;
  },

  async create(payload: Omit<FeatureDependency, "id">): Promise<FeatureDependency> {
    const res = await api.post<FeatureDependency>("/feature-dependencies", payload);
    return res.data;
  },

  async update(id: string, payload: Partial<Omit<FeatureDependency, "id" | "featureId">>): Promise<FeatureDependency> {
    const res = await api.put<FeatureDependency>(`/feature-dependencies/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/feature-dependencies/${id}`);
  },
};
