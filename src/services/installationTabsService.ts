import api from "./api";

export interface InstallationTab {
  id: string;
  label: string;
  type: string;
  position: number;
}

export interface InstallationTabRow {
  id: string;
  tabId: string;
  data: Record<string, string>;
  position: number;
}

export const installationTabsService = {
  async getAll() {
    const response = await api.get<InstallationTab[]>("/installation-tabs");
    return response.data;
  },
  async saveAll(tabs: InstallationTab[]) {
    const response = await api.put<InstallationTab[]>("/installation-tabs/bulk", tabs);
    return response.data;
  },
  async getRows(tabId: string) {
    const response = await api.get<InstallationTabRow[]>("/installation-tab-rows", {
      params: { tabId }
    });
    return response.data;
  },
  async saveRows(tabId: string, rows: InstallationTabRow[]) {
    const response = await api.put<InstallationTabRow[]>("/installation-tab-rows/bulk", rows);
    return response.data;
  }
};
