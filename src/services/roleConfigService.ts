import api from "./api";

// ── Tier 2: per-domain action flags ─────────────────────────────────────────
export interface DomainPermissions {
  projects:  { view: boolean; edit: boolean; approve: boolean; delete: boolean };
  assets:    { view: boolean; edit: boolean; runWorkflow: boolean; delete: boolean };
  workflows: { view: boolean; build: boolean; publish: boolean; archive: boolean };
  documents: { view: boolean; upload: boolean; delete: boolean };
  settings:  { view: boolean; edit: boolean };
}

// ── Tier 1: global flags (kept for backward compat + coarse-grain checks) ───
export interface RolePermissions {
  viewOnly: boolean;
  createDeleteTables: boolean;
  createUsers: boolean;
  editFields: boolean;
  modifyData: boolean;
  editForms: boolean;
  domains?: DomainPermissions;
}

export interface RoleConfig {
  roles: Record<string, RolePermissions>;
}

// Derives sensible Tier 2 defaults from Tier 1 flags when domains not set.
// Used as fallback so old saved configs still work correctly.
export function defaultDomains(p: Omit<RolePermissions, "domains">): DomainPermissions {
  if (p.viewOnly) {
    return {
      projects:  { view: true,  edit: false, approve: false,       delete: false },
      assets:    { view: true,  edit: false, runWorkflow: false,   delete: false },
      workflows: { view: true,  build: false, publish: false,      archive: false },
      documents: { view: true,  upload: false, delete: false },
      settings:  { view: false, edit: false },
    };
  }
  const canEdit   = p.editFields || p.modifyData;
  const canDelete = p.modifyData;
  const canBuild  = p.editForms;
  return {
    projects:  { view: true, edit: canEdit,   approve: p.modifyData,  delete: canDelete },
    assets:    { view: true, edit: canEdit,   runWorkflow: p.editForms, delete: canDelete },
    workflows: { view: true, build: canBuild, publish: p.modifyData,   archive: p.modifyData },
    documents: { view: true, upload: canEdit, delete: canDelete },
    settings:  { view: p.createDeleteTables,  edit: p.createDeleteTables },
  };
}

export const roleConfigService = {
  async get() {
    const response = await api.get<RoleConfig>("/role-configs");
    return response.data;
  },
  async update(config: RoleConfig) {
    const response = await api.put<RoleConfig>("/role-configs", config);
    return response.data;
  },
};
