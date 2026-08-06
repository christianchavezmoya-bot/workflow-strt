import { describe, expect, it } from "vitest";
import { getSyncOpTimeoutMs, RUN_MUTATION_TIMEOUT_MS } from "./syncPolicy";

describe("getSyncOpTimeoutMs", () => {
  it("uses extended timeout for signature uploads with PNG payloads", () => {
    expect(getSyncOpTimeoutMs("SIGNATURE_SUBMIT")).toBe(RUN_MUTATION_TIMEOUT_MS);
  });

  it("keeps default timeout for lightweight ops", () => {
    expect(getSyncOpTimeoutMs("ASSET_UPDATE")).toBe(10_000);
  });
});
