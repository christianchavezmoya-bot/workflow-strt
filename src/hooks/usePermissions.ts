import { useEffect, useMemo, useState } from "react";
import { defaultDomains, roleConfigService, RolePermissions, DomainPermissions } from "../services/roleConfigService";
import { useAuth } from "./useAuth";

const createRolePermissions = (
  base: Omit<RolePermissions, "domains">,
  documentOverrides?: Partial<DomainPermissions["documents"]>
): RolePermissions => {
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
};

const FALLBACK_PERMISSIONS: Record<string, RolePermissions> = {
  Admin:             createRolePermissions({ viewOnly: false, createDeleteTables: true,  createUsers: true,  editFields: true,  modifyData: true,  editForms: true }, { upload: true, delete: true }),
  "Project Manager": createRolePermissions({ viewOnly: false, createDeleteTables: true,  createUsers: false, editFields: true,  modifyData: true,  editForms: true }, { upload: true, delete: true }),
  Supervisor:        createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: true,  modifyData: true,  editForms: true }, { upload: false, delete: false }),
  Engineer:          createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true,  editForms: false }, { upload: false, delete: false }),
  "QA Inspector":    createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true,  editForms: true }, { upload: false, delete: false }),
  Installer:         createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: true,  modifyData: true,  editForms: true }, { upload: false, delete: false }),
  Technician:        createRolePermissions({ viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true,  editForms: true }, { upload: false, delete: false }),
  Client:            createRolePermissions({ viewOnly: true,  createDeleteTables: false, createUsers: false, editFields: false, modifyData: false, editForms: false }, { upload: false, delete: false }),
  Viewer:            createRolePermissions({ viewOnly: true,  createDeleteTables: false, createUsers: false, editFields: false, modifyData: false, editForms: false }, { upload: false, delete: false }),
};

const resolveDomains = (roleName: string | undefined, permissions: RolePermissions): DomainPermissions => {
  let domains: DomainPermissions;
  if (permissions.domains) {
    // Merge computed defaults underneath the saved values so that fields added
    // after a config was saved (e.g. viewScope, editScope) are filled in correctly
    // rather than falling back to the hardcoded "own" missing-field default.
    const defaults = defaultDomains(permissions);
    const saved = permissions.domains;
    domains = {
      projects:                { ...defaults.projects,                ...saved.projects },
      installationAssets:      { ...defaults.installationAssets,      ...saved.installationAssets },
      workInstructionsBuilder: { ...defaults.workInstructionsBuilder, ...saved.workInstructionsBuilder },
      documents:               { ...defaults.documents,               ...saved.documents },
      // OR merge: Tier 1 createDeleteTables always guarantees settings access;
      // saved false cannot revoke access the role's Tier 1 flags already grant.
      settings: {
        view: defaults.settings.view || (saved.settings?.view ?? false),
        edit: defaults.settings.edit || (saved.settings?.edit ?? false),
      },
    };
  } else {
    const fallback = roleName ? FALLBACK_PERMISSIONS[roleName] : undefined;
    domains = fallback?.domains ?? defaultDomains(permissions);
  }

  // Hard-lock: viewOnly roles (Viewer, Client) can never delete, archive, restore, or purge,
  // regardless of what an admin may have saved in the role config.
  if (permissions.viewOnly) {
    return {
      ...domains,
      projects:           { ...domains.projects,           delete: false },
      installationAssets: { ...domains.installationAssets, delete: false },
      documents:          { ...domains.documents,          delete: false },
    };
  }

  return domains;
};

export const usePermissions = () => {
  const { user } = useAuth();
  const [roleConfig, setRoleConfig] = useState<Record<string, RolePermissions> | null>(null);
  // Tracks whether the role-config API call has settled (success or failure).
  const [configReady, setConfigReady] = useState(false);

  const loadRoleConfig = () => {
    roleConfigService.get().then((config) => {
      if (config.roles && Object.keys(config.roles).length > 0) {
        setRoleConfig(config.roles);
      }
    }).catch(() => {}).finally(() => setConfigReady(true));
  };

  useEffect(() => {
    loadRoleConfig();
  }, []);

  // When the authenticated user identity changes (login or logout), clear the
  // module-level role-config cache and re-fetch. Without this, a role config
  // loaded before the admin saved updated permissions would stay stale for the
  // entire browser session even after logging out and back in.
  useEffect(() => {
    roleConfigService.clearCache();
    setConfigReady(false);
    loadRoleConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    const reload = () => {
      roleConfigService.clearCache();
      loadRoleConfig();
    };
    window.addEventListener("roles-config-changed", reload);
    return () => window.removeEventListener("roles-config-changed", reload);
  }, []);

  const can = useMemo(() => {
    const config = roleConfig ?? FALLBACK_PERMISSIONS;
    const perms: RolePermissions | undefined = user?.role ? config[user.role] : undefined;
    const p = perms ?? FALLBACK_PERMISSIONS[user?.role ?? ""] ?? FALLBACK_PERMISSIONS.Viewer;

    // Tier 2: use saved domains or derive from Tier 1 flags
    const domains = resolveDomains(user?.role, p);

    if (p.viewOnly) {
      return {
        // Tier 1
        viewOnly: true, modifyData: false, createUsers: false,
        editFields: false, editForms: false, createDeleteTables: false,
        // Tier 2
        projects:  domains.projects,
        installationAssets:      domains.installationAssets,
        workInstructionsBuilder: domains.workInstructionsBuilder,
        documents: domains.documents,
        settings:  domains.settings,
      };
    }

    return {
      // Tier 1
      viewOnly: false,
      modifyData: p.modifyData,
      createUsers: p.createUsers,
      editFields: p.editFields,
      editForms: p.editForms,
      createDeleteTables: p.createDeleteTables,
      // Tier 2
      projects:  domains.projects,
      installationAssets:      domains.installationAssets,
      workInstructionsBuilder: domains.workInstructionsBuilder,
      documents: domains.documents,
      settings:  domains.settings,
    };
  }, [user?.role, roleConfig]);

  // True only after both the real user identity and the role-config API call have
  // settled. Guards like SettingsRoute must wait for this before deciding to redirect,
  // otherwise the initial Viewer placeholder fires a false-negative redirect.
  const permissionsReady = configReady && user.id !== "";

  return { ...can, permissionsReady };
};
