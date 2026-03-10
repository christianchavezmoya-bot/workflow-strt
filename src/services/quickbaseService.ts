import api from "./api";
import type { GoodsMovementsResult } from "../types/goodsMovement";

export const quickbaseService = {
  async getGoodsMovements(projectId: string): Promise<GoodsMovementsResult> {
    const r = await api.get<GoodsMovementsResult>(
      `/projects/${projectId}/quickbase/goods-movements`
    );
    return r.data;
  }
};
