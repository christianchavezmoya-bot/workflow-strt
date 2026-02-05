import api from "./api";

export interface Asset {
  id: string;
  seq: number;
  machineType: string;
  machineId: string;
  serialNumber: string;
  pmCount: string;
  comments: string;
}

export const assetService = {
  async getAssets() {
    const response = await api.get<Asset[]>("/assets");
    return response.data;
  },
  async createAsset(payload: Omit<Asset, "id" | "seq">) {
    const response = await api.post<Asset>("/assets", payload);
    return response.data;
  },
  async updateAsset(id: string, payload: Partial<Omit<Asset, "id" | "seq">>) {
    const response = await api.put<Asset>(`/assets/${id}`, payload);
    return response.data;
  },
  async deleteAsset(id: string) {
    await api.delete(`/assets/${id}`);
    return id;
  }
};
