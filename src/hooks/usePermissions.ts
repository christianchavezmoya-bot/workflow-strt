import { useEffect, useMemo, useState } from "react";
import { roleConfigService, RolePermissions } from "../services/roleConfigService";
import { useAuth } from "./useAuth";

const FALLBACK_PERMISSIONS: Record<string, RolePermissions> = {
  Admin: { viewOnly: false, createDeleteTables: true, createUsers: true, editFields: true, modifyData: true, editForms: true },
  "Project Manager": { viewOnly: false, createDeleteTables: true, createUsers: false, editFields: true, modifyData: true, editForms: true },
  Engineer: { viewOnly: false, createDeleteTables: false, createUsers: false, editFields: false, modifyData: true, editForms: false },
  Viewer: { viewOnly: true, createDeleteTables: false, createUsers: false, editFields: false, modifyData: false, editForms: false },
};

export const usePermissions = () => {
  const { user } = useAuth();
  const [roleConfig, setRoleConfig] = useState<Record<string, RolePermissions> | null>(null);

  useEffect(() => {
    roleConfigService.get().then((config) => {
      if (config.roles && Object.keys(config.roles).length > 0) {
        setRoleConfig(config.roles);
      }
    }).catch(() => {
      // Backend unavailable — use fallback
    });
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

    // Fall back to hardcoded map if role not found in config
    const p = perms ?? FALLBACK_PERMISSIONS[user?.role ?? ""] ?? FALLBACK_PERMISSIONS.Viewer;

    if (p.viewOnly) {
      return { viewOnly: true, modifyData: false, createUsers: false, editFields: false, editForms: false, createDeleteTables: false };
    }

    return {
      viewOnly: false,
      modifyData: p.modifyData,
      createUsers: p.createUsers,
      editFields: p.editFields,
      editForms: p.editForms,
      createDeleteTables: p.createDeleteTables,
    };
  }, [user?.role, roleConfig]);

  return can;
};
