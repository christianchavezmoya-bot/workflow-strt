import api from "./api";
import { Customer } from "../types/customer";

export const customerService = {
  async getCustomers() {
    const response = await api.get<Customer[]>("/customers");
    return response.data;
  },
  async createCustomer(payload: Omit<Customer, "id">) {
    const response = await api.post<Customer>("/customers", payload);
    return response.data;
  },
  async updateCustomer(id: string, payload: Partial<Customer>) {
    const response = await api.put<Customer>(`/customers/${id}`, payload);
    return response.data;
  },
  async deleteCustomer(id: string) {
    await api.delete(`/customers/${id}`);
    return id;
  }
};
