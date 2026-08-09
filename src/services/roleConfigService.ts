import api from "./api";

export type ViewScope = "own" | "all";
export type EditScope = "own" | "all" | "none";

// ── Tier 2: per-domain action flags ─────────────────────────────────────────
export interface DomainPermissions {
  projects:             { view: boolean; viewScope: ViewScope; edit: boolean; editScope: EditScope; approve: boolean; delete: boolean };
  installationAssets:   {
    view: boolean;
    viewScope: ViewScope;
    edit: boolean;
    editScope: EditScope;
    runWorkflow: boolean;
    delete: boolean;
    viewCapture?: boolean;
    editCapture?: boolean;
    editCaptureScope?: EditScope;
  };
  workInstructionsBuilder: { view: boolean; viewScope: ViewScope; build: boolean; publish: boolean; archive: boolean; delete?: boolean };
  documents:            { view: boolean; viewScope: ViewScope; upload: boolean; delete: boolean };
  settings:             { view: boolean; edit: boolean };
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

const EMPTY_ROLE_CONFIG: RoleConfig = { roles: {} };
let roleConfigCache: RoleConfig | null = null;
let roleConfigPromise: Promise<RoleConfig> | null = null;

// Derives sensible Tier 2 defaults from Tier 1 flags when domains not set.
// Used as fallback so old saved configs still work correctly.
export function defaultDomains(p: Omit<RolePermissions, "domains">): DomainPermissions {
  if (p.viewOnly) {
    return {
      projects:                { view: true,  viewScope: "all", edit: false, editScope: "none", approve: false,      delete: false },
      installationAssets:      { view: true,  viewScope: "all", edit: false, editScope: "none", runWorkflow: false,  delete: false, viewCapture: true, editCapture: false, editCaptureScope: "none" },
      workInstructionsBuilder: { view: true,  viewScope: "all", build: false, publish: false,   archive: false, delete: false },
      documents:               { view: true,  viewScope: "all", upload: false, delete: false },
      settings:                { view: false, edit: false },
    };
  }
  const canEdit   = p.editFields || p.modifyData;
  const canDelete = p.createDeleteTables;
  // Authoring a workflow config (build/publish/archive/delete) is Admin + Project Manager
  // on the server — every mutating endpoint on WorkflowConfigsController carries
  // [Authorize(Roles = "Admin,Project Manager")]. createDeleteTables is the flag those two
  // roles have and the others don't, so it is the honest default here. Deriving these from
  // editForms (as before) handed Supervisor/QA/Installer/Technician buttons the API
  // rejected with a silent 403.
  const canAuthorWorkflow = p.createDeleteTables;
  // createDeleteTables is the clearest proxy for "full admin access" — those roles see and edit all records.
  // Roles without it (Installer, Engineer, Technician, Supervisor) default to viewing/editing only their own.
  const viewAll: ViewScope  = p.createDeleteTables ? "all" : "own";
  const editAll: EditScope  = p.createDeleteTables ? "all" : (canEdit ? "own" : "none");
  return {
    projects:                { view: true, viewScope: viewAll, edit: canEdit,   editScope: editAll, approve: p.modifyData,    delete: canDelete },
    installationAssets:      {
      view: true,
      viewScope: viewAll,
      edit: canEdit,
      editScope: editAll,
      runWorkflow: p.editForms,
      delete: canDelete,
      viewCapture: true,
      editCapture: p.modifyData || p.createDeleteTables,
      editCaptureScope: p.createDeleteTables ? "all" : (canEdit ? "own" : "none"),
    },
    workInstructionsBuilder: {
      view: true,
      viewScope: viewAll,
      build: canAuthorWorkflow,
      publish: canAuthorWorkflow,
      archive: canAuthorWorkflow,
      delete: canAuthorWorkflow,
    },
    documents:               { view: true, viewScope: viewAll, upload: canEdit, delete: canDelete },
    settings:                { view: p.createDeleteTables, edit: p.createDeleteTables },
  };
}

export const roleConfigService = {
  async get() {
    if (roleConfigCache) {
      return roleConfigCache;
    }

    if (!roleConfigPromise) {
      roleConfigPromise = api.get<RoleConfig>("/role-configs")
        .then((response) => {
          roleConfigCache = response.data ?? EMPTY_ROLE_CONFIG;
          return roleConfigCache;
        })
        .catch((error) => {
          roleConfigPromise = null;
          throw error;
        });
    }

    return roleConfigPromise;
  },
  async update(config: RoleConfig) {
    const response = await api.put<RoleConfig>("/role-configs", config);
    roleConfigCache = response.data ?? EMPTY_ROLE_CONFIG;
    roleConfigPromise = Promise.resolve(roleConfigCache);
    return roleConfigCache;
  },
  clearCache() {
    roleConfigCache = null;
    roleConfigPromise = null;
  },
};
