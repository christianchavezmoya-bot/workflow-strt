import api from "./api";

export interface GlobalTableConfig {
  tableName: string;
  order: string[];
  hidden: string[];
  baseFieldNames: Record<string, string>;
  baseFieldMeta: Record<
    string,
    {
      fieldType?: string | null;
      required?: boolean;
      options?: string[] | null;
      linkToFieldId?: string | null;
      actionType?: string | null;
    }
  >;
}

export const tableConfigService = {
  async get(tableName: string) {
    const response = await api.get<GlobalTableConfig>(`/table-configs/${tableName}`);
    return response.data;
  },

  async update(tableName: string, config: GlobalTableConfig) {
    const response = await api.put<GlobalTableConfig>(`/table-configs/${tableName}`, config);
    return response.data;
  },

  async getAll() {
    const response = await api.get<GlobalTableConfig[]>("/table-configs");
    return response.data;
  }
};
