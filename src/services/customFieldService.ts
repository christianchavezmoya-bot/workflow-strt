import api from "./api";

export interface CustomFieldDefinition {
  id: string;
  name: string;
  fieldType: string;
  scope: string;
  product?: string | null;
  sortOrder: number;
  options: string[];
  isActive: boolean;
}

export const customFieldService = {
  async getFields(scope: string, product?: string) {
    const response = await api.get<CustomFieldDefinition[]>("/custom-fields", {
      params: { scope, product }
    });
    return response.data;
  },
  async createField(payload: CustomFieldDefinition) {
    const response = await api.post<CustomFieldDefinition>("/custom-fields", payload);
    return response.data;
  },
  async updateField(id: string, payload: CustomFieldDefinition) {
    const response = await api.put<CustomFieldDefinition>(`/custom-fields/${id}`, payload);
    return response.data;
  },
  async deleteField(id: string) {
    await api.delete(`/custom-fields/${id}`);
  }
};
