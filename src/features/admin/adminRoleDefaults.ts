import { defaultDomains, RolePermissions, DomainPermissions } from "../../services/roleConfigService";

export const KNOWN_ROLE_ORDER = [
  "Admin",
  "Project Manager",
  "Engineer",
  "Viewer",
  "Installer",
  "Supervisor",
  "Technician",
  "QA Inspector",
  "Client",
] as const;

const createRolePermissions = (
  base: Omit<RolePermissions, "domains">,
  documentOverrides?: Partial<DomainPermissions["documents"]>,
): RolePermissions => ({
  ...base,
  domains: {
    ...defaultDomains(base),
    documents: {
      ...defaultDomains(base).documents,
      ...(documentOverrides ?? {}),
    },
  },
});

export const KNOWN_ROLE_DEFAULTS: Record<string, RolePermissions> = {
  Admin: createRolePermissions({
    viewOnly: false,
    createDeleteTables: true,
    createUsers: true,
    editFields: true,
    modifyData: true,
    editForms: true,
  }, { upload: true, delete: true }),
  "Project Manager": createRolePermissions({
    viewOnly: false,
    createDeleteTables: true,
    createUsers: false,
    editFields: true,
    modifyData: true,
    editForms: true,
  }, { upload: true, delete: true }),
  Engineer: createRolePermissions({
    viewOnly: false,
    createDeleteTables: false,
    createUsers: false,
    editFields: false,
    modifyData: true,
    editForms: false,
  }, { upload: false, delete: false }),
  Viewer: createRolePermissions({
    viewOnly: true,
    createDeleteTables: false,
    createUsers: false,
    editFields: false,
    modifyData: false,
    editForms: false,
  }, { upload: false, delete: false }),
  Installer: createRolePermissions({
    viewOnly: false,
    createDeleteTables: false,
    createUsers: false,
    editFields: true,
    modifyData: false,
    editForms: true,
  }, { upload: false, delete: false }),
  Supervisor: createRolePermissions({
    viewOnly: false,
    createDeleteTables: false,
    createUsers: false,
    editFields: true,
    modifyData: true,
    editForms: true,
  }, { upload: false, delete: false }),
  Technician: createRolePermissions({
    viewOnly: false,
    createDeleteTables: false,
    createUsers: false,
    editFields: false,
    modifyData: true,
    editForms: true,
  }, { upload: false, delete: false }),
  "QA Inspector": createRolePermissions({
    viewOnly: false,
    createDeleteTables: false,
    createUsers: false,
    editFields: false,
    modifyData: true,
    editForms: true,
  }, { upload: false, delete: false }),
  Client: createRolePermissions({
    viewOnly: true,
    createDeleteTables: false,
    createUsers: false,
    editFields: false,
    modifyData: false,
    editForms: false,
  }, { upload: false, delete: false }),
};

export const getRoleTemplate = (roleName: string): RolePermissions =>
  KNOWN_ROLE_DEFAULTS[roleName] ?? KNOWN_ROLE_DEFAULTS.Viewer;

export const normalizeRolePermissions = (roleName: string, permissions: RolePermissions): RolePermissions => ({
  viewOnly: permissions.viewOnly,
  createDeleteTables: permissions.createDeleteTables,
  createUsers: permissions.createUsers,
  editFields: permissions.editFields,
  modifyData: permissions.modifyData,
  editForms: permissions.editForms,
  domains: permissions.domains ?? getRoleTemplate(roleName).domains ?? defaultDomains({
    viewOnly: permissions.viewOnly,
    createDeleteTables: permissions.createDeleteTables,
    createUsers: permissions.createUsers,
    editFields: permissions.editFields,
    modifyData: permissions.modifyData,
    editForms: permissions.editForms,
  }),
});

export const buildNormalizedRolesConfig = (
  current: Record<string, RolePermissions>,
  extraRoleNames: string[] = [],
) => {
  const merged: Record<string, RolePermissions> = {};
  const requestedNames = Array.from(new Set([...KNOWN_ROLE_ORDER, ...extraRoleNames]));

  requestedNames.forEach((roleName) => {
    merged[roleName] = normalizeRolePermissions(roleName, current[roleName] ?? getRoleTemplate(roleName));
  });

  Object.entries(current).forEach(([roleName, permissions]) => {
    if (!merged[roleName]) {
      merged[roleName] = normalizeRolePermissions(roleName, permissions);
    }
  });

  return merged;
};

export const resolveRoleName = (roleName: string, availableRoles: string[]) => {
  const trimmed = roleName.trim();
  if (!trimmed) return "";
  const exact = availableRoles.find((role) => role === trimmed);
  if (exact) return exact;
  const caseInsensitive = availableRoles.find(
    (role) => role.toLowerCase() === trimmed.toLowerCase(),
  );
  return caseInsensitive ?? trimmed;
};
