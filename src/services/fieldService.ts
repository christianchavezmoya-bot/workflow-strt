import api from "./api";

export interface FieldDefinition {
  id: string;
  name: string;
  fieldType: string;
  linkToFieldId?: string | null;
  actionType?: string | null;
  tables: string[];
  sortOrder: number;
  isActive: boolean;
}

export interface FieldValue {
  id: string;
  fieldDefinitionId: string;
  tableName: string;
  entityId: string;
  value: string;
  updatedAt: string;
}

export const fieldService = {
  async getDefinitions() {
    const response = await api.get<FieldDefinition[]>("/field-definitions");
    return response.data;
  },
  async createDefinition(payload: FieldDefinition) {
    const response = await api.post<FieldDefinition>("/field-definitions", payload);
    return response.data;
  },
  async updateDefinition(id: string, payload: FieldDefinition) {
    const response = await api.put<FieldDefinition>(`/field-definitions/${id}`, payload);
    return response.data;
  },
  async deleteDefinition(id: string) {
    await api.delete(`/field-definitions/${id}`);
  },
  async seedDefaults() {
    const response = await api.post<FieldDefinition[]>("/field-definitions/seed");
    return response.data;
  },
  async getAvailableTables() {
    const response = await api.get<string[]>("/field-definitions/tables");
    return response.data;
  },
  async migrateIds() {
    const response = await api.post<{ migrated: number; mapping?: Record<string, string>; message?: string }>("/field-definitions/actions/migrate-ids");
    return response.data;
  },
  async getValues(table: string, entityId: string) {
    const response = await api.get<FieldValue[]>("/field-values", {
      params: { table, entityId }
    });
    return response.data;
  },
  async getValuesForTable(table: string) {
    const response = await api.get<FieldValue[]>(`/field-values/table/${table}`);
    return response.data;
  },
  async upsertValues(values: FieldValue[]) {
    const response = await api.post<FieldValue[]>("/field-values/bulk", values);
    return response.data;
  }
};
