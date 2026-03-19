import api from "../../../services/api";
import type { DraftComponent } from "../types/projectDraft";

export const inventoryAdapter = {
  async getStockByPartNumber(partNumber: string): Promise<number | null> {
    try {
      const { data } = await api.get<{ stockQty: number }>(`/inventory/stock`, {
        params: { partNumber },
      });
      return data.stockQty;
    } catch {
      return null;
    }
  },

  async reserveParts(projectId: string, components: DraftComponent[]): Promise<void> {
    const allocations = components
      .filter((c) => c.inventoryTracked && c.partNumber)
      .map((c) => ({ partNumber: c.partNumber, qtyRequired: c.qtyRequired }));
    if (!allocations.length) return;
    await api.post(`/inventory/reserve`, { projectId, allocations });
  },

  async createShortageRecords(projectId: string, shortages: DraftComponent[]): Promise<void> {
    const records = shortages.map((c) => ({
      projectId,
      partNumber: c.partNumber,
      description: c.description,
      shortageQty: Math.abs(c.differenceQty ?? 0),
    }));
    if (!records.length) return;
    await api.post(`/inventory/shortages`, { records });
  },
};
