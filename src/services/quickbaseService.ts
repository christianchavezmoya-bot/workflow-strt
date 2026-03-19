import api from "./api";
import type { GoodsMovementsResult } from "../types/goodsMovement";

export interface QbFieldInfo {
  id: number;
  label: string;
  fieldType: string;
}

export const quickbaseService = {
  async getGoodsMovements(projectId: string): Promise<GoodsMovementsResult> {
    const r = await api.get<GoodsMovementsResult>(
      `/projects/${projectId}/quickbase/goods-movements`
    );
    return r.data;
  },

  async discoverFields(tableId: string, realmHostname: string, userToken: string): Promise<QbFieldInfo[]> {
    const r = await api.post<QbFieldInfo[]>(`/quickbase/fields`, {
      tableId,
      realmHostname,
      userToken
    });
    return r.data;
  },

  async testConnection(realmHostname: string, userToken: string, tableId?: string): Promise<{ success: boolean; message: string }> {
    const r = await api.post<{ success: boolean; message: string }>(`/quickbase/test`, {
      realmHostname,
      userToken,
      tableId: tableId || null
    });
    return r.data;
  }
};
