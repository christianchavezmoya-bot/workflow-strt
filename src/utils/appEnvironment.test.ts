import { afterEach, describe, expect, it, vi } from "vitest";
import {
  debugLog,
  getAppEnvironment,
  isDebugFeaturesEnabled,
  isDevAppBuild,
  isProdAppBuild,
} from "./appEnvironment";

describe("appEnvironment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("treats VITE_APP_ENV=dev as a dev build", () => {
    vi.stubEnv("VITE_APP_ENV", "dev");
    expect(getAppEnvironment()).toBe("dev");
    expect(isDevAppBuild()).toBe(true);
    expect(isProdAppBuild()).toBe(false);
    expect(isDebugFeaturesEnabled()).toBe(true);
  });

  it("treats VITE_APP_ENV=prod as a prod build", () => {
    vi.stubEnv("VITE_APP_ENV", "prod");
    expect(getAppEnvironment()).toBe("prod");
    expect(isDevAppBuild()).toBe(false);
    expect(isProdAppBuild()).toBe(true);
    expect(isDebugFeaturesEnabled()).toBe(false);
  });

  it("debugLog is silent on prod builds", () => {
    vi.stubEnv("VITE_APP_ENV", "prod");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    debugLog("secret");
    expect(spy).not.toHaveBeenCalled();
  });

  it("debugLog writes on dev builds", () => {
    vi.stubEnv("VITE_APP_ENV", "dev");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    debugLog("visible");
    expect(spy).toHaveBeenCalledWith("visible");
  });
});
