import { describe, expect, it, vi } from "vitest";

const getApiBaseUrl = vi.fn();
vi.mock("../services/apiBase", () => ({
  getApiBaseUrl: () => getApiBaseUrl(),
}));

import { resolveMediaUrl } from "./mediaUrl";

describe("resolveMediaUrl", () => {
  it("resolves a relative media path against the API origin, not window.location.origin (TEST 1)", () => {
    // jsdom's default test origin is http://localhost:3000 — deliberately different
    // from the mocked API origin below, so this test only passes if the function
    // truly uses getApiBaseUrl() and never falls back to window.location.
    expect(window.location.origin).not.toBe("https://api.staging.strata-ngo.com");
    getApiBaseUrl.mockReturnValue("https://api.staging.strata-ngo.com/api");

    const resolved = resolveMediaUrl("/api/workflow-configs/123/media/abc/file");

    expect(resolved).toBe("https://api.staging.strata-ngo.com/api/workflow-configs/123/media/abc/file");
  });

  it("does not double up /api/api when the media path already includes /api", () => {
    getApiBaseUrl.mockReturnValue("https://api.staging.strata-ngo.com/api");

    const resolved = resolveMediaUrl("/api/workflow-configs/123/media/abc/file");

    expect(resolved).not.toContain("/api/api");
  });

  it("resolves correctly for local development (frontend :5173, API :4000)", () => {
    getApiBaseUrl.mockReturnValue("http://localhost:4000/api");

    expect(resolveMediaUrl("/api/workflow-configs/1/media/2/file")).toBe(
      "http://localhost:4000/api/workflow-configs/1/media/2/file",
    );
  });

  it("resolves correctly for LAN/mobile development (rehosted device IP)", () => {
    getApiBaseUrl.mockReturnValue("http://192.168.1.50:4000/api");

    expect(resolveMediaUrl("/api/workflow-configs/1/media/2/file")).toBe(
      "http://192.168.1.50:4000/api/workflow-configs/1/media/2/file",
    );
  });

  it("resolves correctly for production-style separate origins", () => {
    getApiBaseUrl.mockReturnValue("https://api.strata-ngo.com/api");

    expect(resolveMediaUrl("/api/workflow-configs/1/media/2/file")).toBe(
      "https://api.strata-ngo.com/api/workflow-configs/1/media/2/file",
    );
  });

  it("leaves an already-absolute https URL unchanged (TEST 2)", () => {
    getApiBaseUrl.mockReturnValue("https://api.staging.strata-ngo.com/api");
    const absolute = "https://some-other-host.example.com/file.jpg";

    expect(resolveMediaUrl(absolute)).toBe(absolute);
  });

  it("leaves an already-absolute http URL unchanged", () => {
    getApiBaseUrl.mockReturnValue("https://api.staging.strata-ngo.com/api");
    expect(resolveMediaUrl("http://example.com/x.jpg")).toBe("http://example.com/x.jpg");
  });

  it("leaves native-cached data:, blob:, capacitor:, and file: URLs unchanged (TEST 3)", () => {
    getApiBaseUrl.mockReturnValue("https://api.staging.strata-ngo.com/api");

    const dataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";
    const blobUrl = "blob:https://staging.strata-ngo.com/abcd-1234";
    const capacitorUrl = "capacitor://localhost/_capacitor_file_/var/mobile/photo.jpg";
    const fileUrl = "file:///var/mobile/Containers/photo.jpg";

    expect(resolveMediaUrl(dataUrl)).toBe(dataUrl);
    expect(resolveMediaUrl(blobUrl)).toBe(blobUrl);
    expect(resolveMediaUrl(capacitorUrl)).toBe(capacitorUrl);
    expect(resolveMediaUrl(fileUrl)).toBe(fileUrl);
  });

  it("returns an empty string for empty/undefined/null input", () => {
    expect(resolveMediaUrl("")).toBe("");
    expect(resolveMediaUrl(undefined)).toBe("");
    expect(resolveMediaUrl(null)).toBe("");
  });
});
