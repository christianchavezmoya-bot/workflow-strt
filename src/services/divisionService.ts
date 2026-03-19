import api from "./api";
import type { Division } from "../types/division";

export const divisionService = {
  async getAll(): Promise<Division[]> {
    const res = await api.get<Division[]>("/divisions");
    return res.data;
  },

  async create(payload: { name: string; description?: string; sortOrder?: number }): Promise<Division> {
    const res = await api.post<Division>("/divisions", payload);
    return res.data;
  },

  async update(id: string, payload: { name?: string; description?: string; sortOrder?: number; isActive?: boolean }): Promise<Division> {
    const res = await api.put<Division>(`/divisions/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/divisions/${id}`);
  },
};
