import api from "./api";
import { Product } from "../types/product";
import { referenceDataGet, referenceDataSet, syncMetaSet } from "./localDB";
import { isMobileNativePlatform } from "../utils/platform";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";

const PRODUCTS_REF_KEY = "products";

export const productService = {
  async getProducts() {
    if (!isMobileNativePlatform()) {
      const response = await api.get<Product[]>("/products");
      return response.data;
    }

    const cached = await referenceDataGet<Product[]>(PRODUCTS_REF_KEY);

    if (cached && cached.length > 0) {
      if (!shouldSkipBlockingFetch()) {
        void api.get<Product[]>("/products")
          .then(async (response) => {
            await referenceDataSet(PRODUCTS_REF_KEY, response.data);
            await syncMetaSet("products");
            if (JSON.stringify(response.data) !== JSON.stringify(cached)) {
              window.dispatchEvent(new Event("repo:products:updated"));
            }
          })
          .catch(() => {});
      }
      return cached;
    }

    if (shouldSkipBlockingFetch()) return cached ?? [];

    try {
      const response = await api.get<Product[]>("/products");
      await referenceDataSet(PRODUCTS_REF_KEY, response.data);
      await syncMetaSet("products");
      return response.data;
    } catch {
      return cached ?? [];
    }
  },
  async createProduct(payload: Omit<Product, "id">) {
    const response = await api.post<Product>("/products", payload);
    return response.data;
  },
  async updateProduct(id: string, payload: Partial<Product>) {
    const response = await api.put<Product>(`/products/${id}`, payload);
    return response.data;
  },
  async deleteProduct(id: string) {
    await api.delete(`/products/${id}`);
    return id;
  }
};
