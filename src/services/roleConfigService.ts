import api from "./api";

export interface RolePermissions {
  viewOnly: boolean;
  createDeleteTables: boolean;
  createUsers: boolean;
  editFields: boolean;
  modifyData: boolean;
  editForms: boolean;
}

export interface RoleConfig {
  roles: Record<string, RolePermissions>;
}

export const roleConfigService = {
  async get() {
    const response = await api.get<RoleConfig>("/role-configs");
    return response.data;
  },
  async update(config: RoleConfig) {
    const response = await api.put<RoleConfig>("/role-configs", config);
    return response.data;
  }
};
