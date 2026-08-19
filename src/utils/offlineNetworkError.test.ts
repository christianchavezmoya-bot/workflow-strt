import axios from "axios";
import { describe, expect, it } from "vitest";
import { isOfflineNetworkError } from "./offlineNetworkError";

describe("isOfflineNetworkError", () => {
  it("treats api.ts offline-skip synthetic error as offline (axios.isAxiosError is false)", () => {
    const err = new Error("offline-skip") as Error & { code?: string; isOfflineSkip?: boolean };
    err.code = "ERR_NETWORK";
    err.isOfflineSkip = true;
    expect(axios.isAxiosError(err)).toBe(false);
    expect(isOfflineNetworkError(err)).toBe(true);
  });

  it("returns false for HTTP error responses", () => {
    const err = { response: { status: 422 }, message: "Unprocessable" };
    expect(isOfflineNetworkError(err)).toBe(false);
  });

  it("returns true for axios network errors without response", () => {
    const err = new axios.AxiosError("Network Error", "ERR_NETWORK");
    expect(isOfflineNetworkError(err)).toBe(true);
  });

  it("returns true for service-layer skip-network-offline fast bail", () => {
    expect(isOfflineNetworkError(new Error("skip-network-offline"))).toBe(true);
  });
});
