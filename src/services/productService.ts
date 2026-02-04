import api from "./api";
import { Product } from "../types/product";

export const productService = {
  async getProducts() {
    const response = await api.get<Product[]>("/products");
    return response.data;
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
