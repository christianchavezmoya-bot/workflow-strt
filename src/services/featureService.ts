import api from "./api";
import type { Feature } from "../types/feature";

export const featureService = {
  /** All features in the global library */
  async getAll(): Promise<Feature[]> {
    const res = await api.get<Feature[]>("/features");
    return res.data;
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
    const res = await api.get<Feature[]>(`/features/by-product/${productId}`);
    return res.data;
  },

  async linkToProduct(productId: string, featureId: string): Promise<void> {
    await api.post(`/features/by-product/${productId}/link/${featureId}`);
  },

  async unlinkFromProduct(productId: string, featureId: string): Promise<void> {
    await api.delete(`/features/by-product/${productId}/unlink/${featureId}`);
  },
};
