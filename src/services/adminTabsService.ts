import api from "./api";

export interface TableConfig {
  order: string[];
  hidden: string[];
}

export interface AdminTab {
  id: string;
  label: string;
  type: string;
  position: number;
  columns: string[];
  fieldIds: string[];
  config: TableConfig;
  primaryActionLabel?: string | null;
}

export interface AdminTabRow {
  id: string;
  tabId: string;
  data: Record<string, string>;
  position: number;
}

export const adminTabsService = {
  async getAll() {
    const response = await api.get<AdminTab[]>("/admin-tabs");
    return response.data;
  },
  async saveAll(tabs: AdminTab[]) {
    const response = await api.put<AdminTab[]>("/admin-tabs/bulk", tabs);
    return response.data;
  },
  async getRows(tabId: string) {
    const response = await api.get<AdminTabRow[]>("/admin-tab-rows", {
      params: { tabId }
    });
    return response.data;
  },
  async saveRows(tabId: string, rows: AdminTabRow[]) {
    const response = await api.put<AdminTabRow[]>("/admin-tab-rows/bulk", rows);
    return response.data;
  }
};
