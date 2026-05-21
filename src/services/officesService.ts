import { Office } from "../components/GlobalOfficeMap";
import api from "./api";

let officesCache: Office[] | null = null;

export const officesService = {
  async getAll(): Promise<Office[]> {
    const response = await api.get<Office[]>("/offices");
    officesCache = response.data;
    return response.data;
  },

  async create(office: Omit<Office, "id">): Promise<Office> {
    const response = await api.post<Office>("/offices", office);
    const newOffice = response.data;
    if (officesCache) {
      officesCache = [...officesCache, newOffice];
    }
    return newOffice;
  },

  async update(id: string, office: Omit<Office, "id">): Promise<Office> {
    const response = await api.put<Office>(`/offices/${id}`, office);
    const updatedOffice = response.data;
    if (officesCache) {
      officesCache = officesCache.map((o) => (o.id === id ? updatedOffice : o));
    }
    return updatedOffice;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/offices/${id}`);
    if (officesCache) {
      officesCache = officesCache.filter((o) => o.id !== id);
    }
  }
};
