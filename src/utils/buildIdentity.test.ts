import { afterEach, describe, expect, it, vi } from "vitest";
import { formatClientBuildIdentityLine, getClientBuildIdentity } from "./buildIdentity";

describe("buildIdentity", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes dev environment and build metadata", () => {
    vi.stubEnv("VITE_APP_ENV", "dev");
    vi.stubEnv("VITE_APP_VERSION", "0.2.0");
    vi.stubEnv("VITE_BUILD_SHA", "abc123456789");
    vi.stubEnv("VITE_BUILD_TIME", "2026-08-31T00:00:00.000Z");
    vi.stubEnv("VITE_API_BASE", "https://api.staging.strata-ngo.com/api");

    const id = getClientBuildIdentity();
    expect(id.environment).toBe("dev");
    expect(id.appVersion).toBe("0.2.0");
    expect(id.buildSha).toBe("abc123456789");
    expect(id.debugFeaturesEnabled).toBe(true);
    expect(id.apiHost.length).toBeGreaterThan(0);
  });

  it("marks prod builds without debug features", () => {
    vi.stubEnv("VITE_APP_ENV", "prod");
    vi.stubEnv("VITE_API_BASE", "https://api.strata-ngo.com/api");

    const id = getClientBuildIdentity();
    expect(id.environment).toBe("prod");
    expect(id.debugFeaturesEnabled).toBe(false);
  });

  it("formats a single-line support label", () => {
    vi.stubEnv("VITE_APP_ENV", "dev");
    vi.stubEnv("VITE_APP_VERSION", "0.1.0");
    vi.stubEnv("VITE_BUILD_SHA", "deadbeef1234");
    vi.stubEnv("VITE_API_BASE", "https://api.staging.strata-ngo.com/api");

    expect(formatClientBuildIdentityLine()).toContain("DEV");
    expect(formatClientBuildIdentityLine()).toContain("deadbeef");
  });
});
