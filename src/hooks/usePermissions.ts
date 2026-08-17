import { useEffect, useMemo, useRef, useState } from "react";
import { roleConfigService, type RolePermissions } from "../services/roleConfigService";
import {
  buildEffectivePermissions,
  FALLBACK_ROLE_PERMISSIONS,
  resolveRoleDomains,
} from "../utils/rolePermissionsResolve";
import { useAuth } from "./useAuth";

export const usePermissions = () => {
  const { user } = useAuth();
  const [roleConfig, setRoleConfig] = useState<Record<string, RolePermissions> | null>(null);
  // Tracks whether the role-config API call has settled (success or failure).
  const [configReady, setConfigReady] = useState(false);
  const lastLoadedUserIdRef = useRef<string | null>(null);

  const loadRoleConfig = () => {
    roleConfigService.get().then((config) => {
      if (config.roles && Object.keys(config.roles).length > 0) {
        setRoleConfig(config.roles);
      }
    }).catch(() => {}).finally(() => setConfigReady(true));
  };

  // When the authenticated user identity changes (login or logout), clear the
  // module-level role-config cache and re-fetch. Without this, a role config
  // loaded before the admin saved updated permissions would stay stale for the
  // entire browser session even after logging out and back in.
  useEffect(() => {
    const previousUserId = lastLoadedUserIdRef.current;
    if (previousUserId !== null && previousUserId !== user.id) {
      roleConfigService.clearCache();
    }
    lastLoadedUserIdRef.current = user.id;
    setConfigReady(false);
    loadRoleConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    const reload = () => {
      roleConfigService.clearCache();
      // Deliberately does NOT clear configReady. This is a refresh of an already-settled
      // config, not an initial load, and permissionsReady gates route guards: dropping it
      // to false unmounts whatever page the user is on. On /admin that was self-feeding —
      // saving roles dispatches this event, the guard unmounted UserManagement, it
      // remounted and saved again, ~8 remounts and 4 DB writes per 5s, forever.
      // The permissions themselves still update when loadRoleConfig() resolves.
      loadRoleConfig();
    };
    window.addEventListener("roles-config-changed", reload);
    return () => window.removeEventListener("roles-config-changed", reload);
  }, []);

  const can = useMemo(() => {
    const config = roleConfig ?? FALLBACK_ROLE_PERMISSIONS;
    const perms: RolePermissions | undefined = user?.role ? config[user.role] : undefined;
    const p = perms ?? FALLBACK_ROLE_PERMISSIONS[user?.role ?? ""] ?? FALLBACK_ROLE_PERMISSIONS.Viewer;
    return buildEffectivePermissions(user?.role, p, config);
  }, [user?.role, roleConfig]);

  // True only after both the real user identity and the role-config API call have
  // settled. Guards like SettingsRoute must wait for this before deciding to redirect,
  // otherwise the initial Viewer placeholder fires a false-negative redirect.
  const permissionsReady = configReady && user.id !== "";

  return { ...can, permissionsReady };
};

// Re-export for callers that only need domain resolution in tests or utilities.
export { resolveRoleDomains, buildEffectivePermissions, FALLBACK_ROLE_PERMISSIONS };
