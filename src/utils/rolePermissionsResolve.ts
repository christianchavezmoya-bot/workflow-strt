import { defaultDomains, type DomainPermissions, type RolePermissions } from "../services/roleConfigService";

/** Builds a full RolePermissions with Tier 2 domains from Tier 1 flags. */
export function createRolePermissions(
  base: Omit<RolePermissions, "domains">,
  documentOverrides?: Partial<DomainPermissions["documents"]>,
): RolePermissions {
  const domains = defaultDomains(base);
  return {
    ...base,
    domains: {
      ...domains,
      documents: {
        ...domains.documents,
        ...(documentOverrides ?? {}),
      },
    },
  };
}

/** Hardcoded fallbacks when the role-config API is unavailable or a role is missing. */
export const FALLBACK_ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  Admin:             createRolePermissions({ viewOnly: false, createDeleteTables: true,  createUsers: true,  editFields: true,  modifyData: true,  editForms: true }, { upload: true, delete: true }),
  "Project Manager": createRolePermissions({ viewOnly: false, createDeleteTables: true,  createUsers: false, editFields: true,  modifyData: true,  editForms: true }, { upload: true, delete: true }),
  Supervisor:        createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: true,  modifyData: true,  editForms: true }, { upload: false, delete: false }),
  Engineer:          createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true,  editForms: false }, { upload: false, delete: false }),
  "QA Inspector":    createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true,  editForms: true }, { upload: false, delete: false }),
  Installer:         createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: true,  modifyData: false, editForms: true }, { upload: false, delete: false }),
  Technician:        createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true,  editForms: true }, { upload: false, delete: false }),
  Client:            createRolePermissions({ viewOnly: true,  createDeleteTables: false, createUsers: false, editFields: false, modifyData: false, editForms: false }, { upload: false, delete: false }),
  Viewer:            createRolePermissions({ viewOnly: true,  createDeleteTables: false, createUsers: false, editFields: false, modifyData: false, editForms: false }, { upload: false, delete: false }),
};

/**
 * Resolves Tier 2 domain permissions from saved role config + Tier 1 flags.
 * Pure — extracted for S3 characterisation tests and usePermissions.
 */
export function resolveRoleDomains(
  roleName: string | undefined,
  permissions: RolePermissions,
  fallbacks: Record<string, RolePermissions> = FALLBACK_ROLE_PERMISSIONS,
): DomainPermissions {
  let domains: DomainPermissions;
  if (permissions.domains) {
    const defaults = defaultDomains(permissions);
    const saved = permissions.domains;
    domains = {
      projects:                { ...defaults.projects,                ...saved.projects },
      installationAssets:      { ...defaults.installationAssets,      ...saved.installationAssets },
      workInstructionsBuilder: { ...defaults.workInstructionsBuilder, ...saved.workInstructionsBuilder },
      documents:               { ...defaults.documents,               ...saved.documents },
      settings: {
        view: defaults.settings.view || (saved.settings?.view ?? false),
        edit: defaults.settings.edit || (saved.settings?.edit ?? false),
      },
      bomProject: { ...defaults.bomProject, ...(saved.bomProject ?? {}) },
      tips:       { ...defaults.tips,       ...(saved.tips ?? {}) },
      analytics:  { ...defaults.analytics,  ...(saved.analytics ?? {}) },
    };
  } else {
    const fallback = roleName ? fallbacks[roleName] : undefined;
    domains = fallback?.domains ?? defaultDomains(permissions);
  }

  if (permissions.viewOnly) {
    return {
      ...domains,
      projects:           { ...domains.projects,           delete: false },
      installationAssets: { ...domains.installationAssets, delete: false },
      documents:          { ...domains.documents,          delete: false },
      workInstructionsBuilder: {
        ...domains.workInstructionsBuilder,
        build: false, publish: false, archive: false, delete: false,
      },
    };
  }

  return domains;
}

/** Effective permission object returned by usePermissions (without permissionsReady). */
export type EffectivePermissions = {
  viewOnly: boolean;
  modifyData: boolean;
  createUsers: boolean;
  editFields: boolean;
  editForms: boolean;
  createDeleteTables: boolean;
  projects: DomainPermissions["projects"];
  installationAssets: DomainPermissions["installationAssets"];
  workInstructionsBuilder: DomainPermissions["workInstructionsBuilder"];
  documents: DomainPermissions["documents"];
  settings: DomainPermissions["settings"];
  bomProject: DomainPermissions["bomProject"];
  tips: DomainPermissions["tips"];
  analytics: DomainPermissions["analytics"];
};

export function buildEffectivePermissions(
  roleName: string | undefined,
  permissions: RolePermissions,
  fallbacks: Record<string, RolePermissions> = FALLBACK_ROLE_PERMISSIONS,
): EffectivePermissions {
  const domains = resolveRoleDomains(roleName, permissions, fallbacks);

  if (permissions.viewOnly) {
    return {
      viewOnly: true, modifyData: false, createUsers: false,
      editFields: false, editForms: false, createDeleteTables: false,
      projects:  domains.projects,
      installationAssets:      domains.installationAssets,
      workInstructionsBuilder: domains.workInstructionsBuilder,
      documents: domains.documents,
      settings:  domains.settings,
      bomProject: { ...domains.bomProject, upload: false, map: false, commit: false, delete: false },
      tips:       { ...domains.tips,       create: false, edit: false, delete: false },
      analytics:  domains.analytics,
    };
  }

  return {
    viewOnly: false,
    modifyData: permissions.modifyData,
    createUsers: permissions.createUsers,
    editFields: permissions.editFields,
    editForms: permissions.editForms,
    createDeleteTables: permissions.createDeleteTables,
    projects:  domains.projects,
    installationAssets:      domains.installationAssets,
    workInstructionsBuilder: domains.workInstructionsBuilder,
    documents: domains.documents,
    settings:  domains.settings,
    bomProject: domains.bomProject,
    tips:       domains.tips,
    analytics:  domains.analytics,
  };
}
