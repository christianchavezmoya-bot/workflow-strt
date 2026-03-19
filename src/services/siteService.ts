import api from "./api";
import { Site } from "../types/site";

export const siteService = {
  async getSites(customerId?: string) {
    const response = await api.get<Site[]>("/sites", {
      params: customerId ? { customerId } : undefined
    });
    return response.data;
  }
};

