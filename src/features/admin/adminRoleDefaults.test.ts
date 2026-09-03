import { describe, expect, it } from "vitest";
import { normalizeRolePermissions, buildNormalizedRolesConfig, KNOWN_ROLE_DEFAULTS } from "./adminRoleDefaults";
import { RolePermissions, DomainPermissions } from "../../services/roleConfigService";

const adminTier1: Omit<RolePermissions, "domains"> = {
  viewOnly: false,
  createDeleteTables: true,
  createUsers: true,
  editFields: true,
  modifyData: true,
  editForms: true,
};

describe("normalizeRolePermissions", () => {
  it("fills a missing field within an otherwise-present domain from the role template, instead of leaving it falsy forever", () => {
    // Simulates a persisted RoleConfigs row saved before the `upload` checkbox existed:
    // `documents` is present (so the old top-level `??` never fires) but `upload` is absent.
    // This exact shape caused Admin document uploads to 403 in staging: the DTO default
    // for a missing bool is false, and every settings-page save re-persisted the gap.
    const saved: RolePermissions = {
      ...adminTier1,
      domains: {
        ...KNOWN_ROLE_DEFAULTS.Admin.domains!,
        documents: { view: true, viewScope: "all", delete: true } as DomainPermissions["documents"],
      },
    };

    const result = normalizeRolePermissions("Admin", saved);

    expect(result.domains!.documents.upload).toBe(true);
    expect(result.domains!.documents.view).toBe(true);
    expect(result.domains!.documents.delete).toBe(true);
  });

  it("preserves an explicit false, rather than overwriting it with the template default", () => {
    const saved: RolePermissions = {
      ...adminTier1,
      domains: {
        ...KNOWN_ROLE_DEFAULTS.Admin.domains!,
        documents: { view: true, viewScope: "all", upload: false, delete: true },
      },
    };

    const result = normalizeRolePermissions("Admin", saved);

    expect(result.domains!.documents.upload).toBe(false);
  });

  it("falls back to the full role template when domains is entirely absent (pre-Tier-2 saved config)", () => {
    const saved: RolePermissions = { ...adminTier1 };

    const result = normalizeRolePermissions("Admin", saved);

    expect(result.domains).toEqual(KNOWN_ROLE_DEFAULTS.Admin.domains);
  });

  it("fills gaps independently per domain — a gap in one domain does not affect another", () => {
    const saved: RolePermissions = {
      ...adminTier1,
      domains: {
        ...KNOWN_ROLE_DEFAULTS.Admin.domains!,
        bomProject: { view: true } as DomainPermissions["bomProject"],
      },
    };

    const result = normalizeRolePermissions("Admin", saved);

    expect(result.domains!.bomProject.upload).toBe(true); // filled from Admin template
    expect(result.domains!.documents).toEqual(KNOWN_ROLE_DEFAULTS.Admin.domains!.documents); // untouched
  });

  it("self-heals through a full normalize/save round trip (buildNormalizedRolesConfig)", () => {
    // Mirrors UserManagement.tsx's actual mutation path: load → normalize → mutate one
    // unrelated field → re-save. A gap elsewhere in `documents` must not persist forever.
    const currentWithGap: Record<string, RolePermissions> = {
      Admin: {
        ...adminTier1,
        domains: {
          ...KNOWN_ROLE_DEFAULTS.Admin.domains!,
          documents: { view: true, viewScope: "all", delete: true } as DomainPermissions["documents"],
        },
      },
    };

    const rebuilt = buildNormalizedRolesConfig(currentWithGap);

    expect(rebuilt.Admin.domains!.documents.upload).toBe(true);
  });
});
