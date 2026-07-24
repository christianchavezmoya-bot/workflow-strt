import { describe, expect, it } from "vitest";
import { sanitizeUrl } from "./syncSupportBundleService";

describe("sanitizeUrl", () => {
  it("removes token query params", () => {
    expect(sanitizeUrl("/api/sse/events?token=secret&foo=bar")).toBe("/api/sse/events?foo=bar");
  });

  it("preserves path-only URLs", () => {
    expect(sanitizeUrl("/api/project-assets/abc")).toBe("/api/project-assets/abc");
  });

  it("handles malformed URLs with regex fallback", () => {
    expect(sanitizeUrl("/api/foo?token=abc123")).not.toContain("abc123");
  });
});
