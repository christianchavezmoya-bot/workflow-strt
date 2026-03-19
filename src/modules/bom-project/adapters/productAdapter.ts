/**
 * productAdapter.ts — wraps existing product service
 * The BOM module must not import product internals directly.
 */
import api from "../../../services/api";

export interface ProductLookup {
  id: string;
  name: string;
  code?: string;
}

export const productAdapter = {
  async findByName(name: string): Promise<ProductLookup | null> {
    try {
      const { data } = await api.get<ProductLookup[]>("/products", { params: { search: name } });
      const match = data.find(
        (p) => p.name.toLowerCase() === name.toLowerCase()
      );
      return match ?? null;
    } catch {
      return null;
    }
  },

  async findByCode(code: string): Promise<ProductLookup | null> {
    try {
      const { data } = await api.get<ProductLookup[]>("/products", { params: { code } });
      return data[0] ?? null;
    } catch {
      return null;
    }
  },

  async linkImportToProduct(importRunId: string, productId: string): Promise<void> {
    await api.post(`/bom-import-runs/${importRunId}/link-product`, { productId });
  },
};
