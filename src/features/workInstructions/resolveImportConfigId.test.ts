import { describe, expect, it, vi } from "vitest";
import { resolveImportConfigId } from "./resolveImportConfigId";

describe("resolveImportConfigId", () => {
  it("uses the existing config id and never calls ensureConfigId when one is already present", async () => {
    const ensureConfigId = vi.fn().mockResolvedValue("should-not-be-used");

    const result = await resolveImportConfigId("existing-draft-id", ensureConfigId);

    expect(result).toBe("existing-draft-id");
    expect(ensureConfigId).not.toHaveBeenCalled();
  });

  it("creates a draft via ensureConfigId and returns its id when no config exists yet", async () => {
    const ensureConfigId = vi.fn().mockResolvedValue("newly-created-draft-id");

    const result = await resolveImportConfigId(null, ensureConfigId);

    expect(result).toBe("newly-created-draft-id");
    expect(ensureConfigId).toHaveBeenCalledTimes(1);
  });

  it("treats undefined the same as null (no config yet)", async () => {
    const ensureConfigId = vi.fn().mockResolvedValue("newly-created-draft-id");

    const result = await resolveImportConfigId(undefined, ensureConfigId);

    expect(result).toBe("newly-created-draft-id");
    expect(ensureConfigId).toHaveBeenCalledTimes(1);
  });

  it("propagates a null result when ensureConfigId fails, without throwing", async () => {
    const ensureConfigId = vi.fn().mockResolvedValue(null);

    const result = await resolveImportConfigId(null, ensureConfigId);

    expect(result).toBeNull();
  });
});
