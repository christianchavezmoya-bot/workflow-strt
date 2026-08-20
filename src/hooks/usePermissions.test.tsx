import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoleConfig, RolePermissions } from "../services/roleConfigService";
import { roleConfigService } from "../services/roleConfigService";
import type { User } from "../types/user";
import { useAuth } from "./useAuth";
import { usePermissions } from "./usePermissions";

vi.mock("./useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../services/roleConfigService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/roleConfigService")>();
  return {
    ...actual,
    roleConfigService: {
      get: vi.fn(),
      clearCache: vi.fn(),
      update: vi.fn(),
    },
  };
});

const adminUser: User = {
  id: "user-admin",
  email: "admin@test.local",
  fullName: "Test Admin",
  role: "Admin",
  office: "Test Office",
  isActive: true,
  isFirstLogin: false,
};

const savedConfig: RoleConfig = {
  roles: {
    Admin: {
      viewOnly: false,
      createDeleteTables: true,
      createUsers: true,
      editFields: true,
      modifyData: true,
      editForms: true,
      domains: {
        settings: { view: false, edit: false },
      } as RolePermissions["domains"],
    },
  },
};

describe("usePermissions", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: adminUser,
      isAuthenticated: true,
      authReady: true,
    });
    vi.mocked(roleConfigService.get).mockReset();
    vi.mocked(roleConfigService.clearCache).mockReset();
  });

  it("permissionsReady stays false until role config settles", async () => {
    let resolveGet!: (value: RoleConfig) => void;
    vi.mocked(roleConfigService.get).mockReturnValue(
      new Promise<RoleConfig>((resolve) => {
        resolveGet = resolve;
      }),
    );

    const { result } = renderHook(() => usePermissions());
    expect(result.current.permissionsReady).toBe(false);

    resolveGet(savedConfig);
    await waitFor(() => expect(result.current.permissionsReady).toBe(true));
  });

  it("permissionsReady stays false while user id is empty", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...adminUser, id: "" },
      isAuthenticated: false,
      authReady: true,
    });
    vi.mocked(roleConfigService.get).mockResolvedValue(savedConfig);

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(roleConfigService.get).toHaveBeenCalled());
    expect(result.current.permissionsReady).toBe(false);
  });

  it("OR-merges settings access from saved config and admin fallback", async () => {
    vi.mocked(roleConfigService.get).mockResolvedValue(savedConfig);

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.permissionsReady).toBe(true));

    // Saved config had settings.view/edit false, but createUsers OR-merge keeps access.
    expect(result.current.settings.view).toBe(true);
    expect(result.current.settings.edit).toBe(true);
  });

  it("clears role config cache when user id changes", async () => {
    vi.mocked(roleConfigService.get).mockResolvedValue(savedConfig);

    const { rerender } = renderHook(() => usePermissions());
    await waitFor(() => expect(roleConfigService.get).toHaveBeenCalledTimes(1));

    vi.mocked(useAuth).mockReturnValue({
      user: { ...adminUser, id: "user-other" },
      isAuthenticated: true,
      authReady: true,
    });
    rerender();

    await waitFor(() => expect(roleConfigService.clearCache).toHaveBeenCalled());
    await waitFor(() => expect(roleConfigService.get).toHaveBeenCalledTimes(2));
  });
});
