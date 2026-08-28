import { describe, expect, it } from "vitest";
import { sanitizeUrl, toReportedFaultDiagnostics } from "./syncSupportBundleService";

describe("sanitizeUrl", () => {
  it("removes token query params", () => {
    expect(sanitizeUrl("/api/sse/events?token=secret&foo=bar")).toBe("/api/sse/events?foo=bar");
  });

  it("removes ticket query params", () => {
    expect(sanitizeUrl("/api/sse/events?ticket=opaque-value&foo=bar")).toBe("/api/sse/events?foo=bar");
  });

  it("preserves path-only URLs", () => {
    expect(sanitizeUrl("/api/project-assets/abc")).toBe("/api/project-assets/abc");
  });

  it("handles malformed URLs with regex fallback", () => {
    expect(sanitizeUrl("/api/foo?token=abc123")).not.toContain("abc123");
  });
});

describe("toReportedFaultDiagnostics", () => {
  it("includes the user-reported fault summary in the diagnostics bundle", () => {
    expect(toReportedFaultDiagnostics({
      kind: "user-report",
      severity: "S1",
      title: "Photo would not attach",
      description: "Took the photo twice and the step stayed empty.",
      referenceCode: "FR-ABC123",
      occurredAt: "2026-08-16T21:51:16.788Z",
      error: {
        name: "UploadError",
        message: "Attachment timed out",
      },
    })).toEqual({
      kind: "user-report",
      severity: "S1",
      title: "Photo would not attach",
      description: "Took the photo twice and the step stayed empty.",
      referenceCode: "FR-ABC123",
      occurredAt: "2026-08-16T21:51:16.788Z",
      errorName: "UploadError",
      errorMessage: "Attachment timed out",
    });
  });
});
