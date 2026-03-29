import { useEffect, useMemo, useState } from "react";
import { defaultDomains, roleConfigService, RolePermissions } from "../services/roleConfigService";
import { useAuth } from "./useAuth";

const FALLBACK_PERMISSIONS: Record<string, RolePermissions> = {
  Admin:             { viewOnly: false, createDeleteTables: true,  createUsers: true,  editFields: true,  modifyData: true,  editForms: true  },
  "Project Manager": { viewOnly: false, createDeleteTables: true,  createUsers: false, editFields: true,  modifyData: true,  editForms: true  },
  Supervisor:        { viewOnly: false, createDeleteTables: false, createUsers: false, editFields: true,  modifyData: true,  editForms: true  },
  Engineer:          { viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true,  editForms: false },
  "QA Inspector":    { viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true,  editForms: true  },
  Installer:         { viewOnly: false, createDeleteTables: false, createUsers: false, editFields: true,  modifyData: false, editForms: true  },
  Technician:        { viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true,  editForms: true  },
  Client:            { viewOnly: true,  createDeleteTables: false, createUsers: false, editFields: false, modifyData: false, editForms: false },
  Viewer:            { viewOnly: true,  createDeleteTables: false, createUsers: false, editFields: false, modifyData: false, editForms: false },
};

export const usePermissions = () => {
  const { user } = useAuth();
  const [roleConfig, setRoleConfig] = useState<Record<string, RolePermissions> | null>(null);

  useEffect(() => {
    roleConfigService.get().then((config) => {
      if (config.roles && Object.keys(config.roles).length > 0) {
        setRoleConfig(config.roles);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const reload = () => {
      roleConfigService.get().then((config) => {
        if (config.roles && Object.keys(config.roles).length > 0) {
          setRoleConfig(config.roles);
        }
      }).catch(() => {});
    };
    window.addEventListener("roles-config-changed", reload);
    return () => window.removeEventListener("roles-config-changed", reload);
  }, []);

  const can = useMemo(() => {
    const config = roleConfig ?? FALLBACK_PERMISSIONS;
    const perms: RolePermissions | undefined = user?.role ? config[user.role] : undefined;
    const p = perms ?? FALLBACK_PERMISSIONS[user?.role ?? ""] ?? FALLBACK_PERMISSIONS.Viewer;

    // Tier 2: use saved domains or derive from Tier 1 flags
    const domains = p.domains ?? defaultDomains(p);

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

  return can;
};
