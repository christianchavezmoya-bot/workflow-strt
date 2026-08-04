import api from "./api";
import { Customer } from "../types/customer";
import { isMobileNativePlatform } from "../utils/platform";
import { invalidateWebCache, webCachedGet } from "./webFreshCache";

const CUSTOMERS_CACHE_KEY = "/customers";

export const customerService = {
  async getCustomers() {
    if (isMobileNativePlatform()) {
      const response = await api.get<Customer[]>("/customers");
      return response.data;
    }
    return webCachedGet(CUSTOMERS_CACHE_KEY, async () => {
      const response = await api.get<Customer[]>("/customers");
      return response.data;
    }, { ttlMs: 60_000 });
  },
  async createCustomer(payload: Omit<Customer, "id">) {
    const response = await api.post<Customer>("/customers", payload);
    invalidateWebCache(CUSTOMERS_CACHE_KEY);
    return response.data;
  },
  async updateCustomer(id: string, payload: Partial<Customer>) {
    const response = await api.put<Customer>(`/customers/${id}`, payload);
    invalidateWebCache(CUSTOMERS_CACHE_KEY);
    return response.data;
  },
  async deleteCustomer(id: string) {
    await api.delete(`/customers/${id}`);
    invalidateWebCache(CUSTOMERS_CACHE_KEY);
    return id;
  },
};
