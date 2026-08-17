import { describe, expect, it } from "vitest";
import { defaultDomains, type RolePermissions } from "../services/roleConfigService";
import {
  buildEffectivePermissions,
  createRolePermissions,
  FALLBACK_ROLE_PERMISSIONS,
  resolveRoleDomains,
} from "./rolePermissionsResolve";

describe("resolveRoleDomains", () => {
  it("fills missing bomProject/tips/analytics from defaults when saved config omits them", () => {
    const tier1 = {
      viewOnly: false,
      createDeleteTables: false,
      createUsers: false,
      editFields: true,
      modifyData: false,
      editForms: true,
    };
    const defaults = defaultDomains(tier1);
    const legacy: RolePermissions = {
      ...tier1,
      domains: {
        projects: { view: true, viewScope: "own", edit: true, editScope: "own", approve: false, delete: false },
        installationAssets: defaults.installationAssets,
        workInstructionsBuilder: defaults.workInstructionsBuilder,
        documents: defaults.documents,
        settings: defaults.settings,
        // bomProject, tips, analytics intentionally omitted at source — merged from defaults.
      } as RolePermissions["domains"],
    };

    const domains = resolveRoleDomains("Installer", legacy);
    expect(domains.bomProject.view).toBe(false);
    expect(domains.tips.view).toBe(true);
    expect(domains.analytics.view).toBe(false);
  });

  it("OR-merges settings.view when createDeleteTables grants admin settings access", () => {
    const adminLike = createRolePermissions({
      viewOnly: false,
      createDeleteTables: true,
      createUsers: true,
      editFields: true,
      modifyData: true,
      editForms: true,
    });
    adminLike.domains!.settings = { view: false, edit: false };

    const domains = resolveRoleDomains("Admin", adminLike);
    expect(domains.settings.view).toBe(true);
    expect(domains.settings.edit).toBe(true);
  });

  it("hard-locks delete and workflow authoring for viewOnly roles even if admin saved true", () => {
    const viewerWithOverrides = createRolePermissions({
      viewOnly: true,
      createDeleteTables: false,
      createUsers: false,
      editFields: false,
      modifyData: false,
      editForms: false,
    });
    viewerWithOverrides.domains!.projects.delete = true;
    viewerWithOverrides.domains!.workInstructionsBuilder.build = true;

    const domains = resolveRoleDomains("Viewer", viewerWithOverrides);
    expect(domains.projects.delete).toBe(false);
    expect(domains.workInstructionsBuilder.build).toBe(false);
    expect(domains.workInstructionsBuilder.publish).toBe(false);
  });
});

describe("buildEffectivePermissions", () => {
  it("Installer fallback can run workflows but cannot modify capture data", () => {
    const perms = buildEffectivePermissions("Installer", FALLBACK_ROLE_PERMISSIONS.Installer);
    expect(perms.modifyData).toBe(false);
    expect(perms.installationAssets.runWorkflow).toBe(true);
    expect(perms.installationAssets.editCapture).toBe(false);
    expect(perms.workInstructionsBuilder.build).toBe(false);
  });

  it("Admin fallback has full table and BOM rights", () => {
    const perms = buildEffectivePermissions("Admin", FALLBACK_ROLE_PERMISSIONS.Admin);
    expect(perms.createDeleteTables).toBe(true);
    expect(perms.createUsers).toBe(true);
    expect(perms.bomProject.commit).toBe(true);
    expect(domainsMatchScopeAll(perms.projects)).toBe(true);
  });

  it("Viewer strips BOM upload even when saved domains grant it", () => {
    const viewer = createRolePermissions({
      viewOnly: true,
      createDeleteTables: false,
      createUsers: false,
      editFields: false,
      modifyData: false,
      editForms: false,
    });
    viewer.domains!.bomProject = { view: true, upload: true, map: true, commit: true, delete: true };

    const perms = buildEffectivePermissions("Viewer", viewer);
    expect(perms.viewOnly).toBe(true);
    expect(perms.bomProject.upload).toBe(false);
    expect(perms.bomProject.commit).toBe(false);
    expect(perms.tips.create).toBe(false);
  });

  it("Supervisor can edit own scope but cannot author or publish workflows", () => {
    const perms = buildEffectivePermissions("Supervisor", FALLBACK_ROLE_PERMISSIONS.Supervisor);
    expect(perms.editFields).toBe(true);
    expect(perms.createDeleteTables).toBe(false);
    expect(perms.workInstructionsBuilder.build).toBe(false);
    expect(perms.workInstructionsBuilder.publish).toBe(false);
    expect(perms.projects.editScope).toBe("own");
  });
});

function domainsMatchScopeAll(projects: { viewScope: string; editScope: string }) {
  return projects.viewScope === "all" && projects.editScope === "all";
}
