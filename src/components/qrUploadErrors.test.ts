import { describe, expect, it } from "vitest";
import { describeUploadTokenError } from "./qrUploadErrors";

describe("describeUploadTokenError", () => {
  it("tells the user to sign in again on 401", () => {
    expect(describeUploadTokenError({ status: 401 })).toContain("session expired");
  });

  it("names a permission problem on 403", () => {
    expect(describeUploadTokenError({ status: 403 })).toContain("role cannot upload");
  });

  it("flags a stale API build on 404", () => {
    expect(describeUploadTokenError({ status: 404 })).toContain("older build");
  });

  it("surfaces the server message on 500", () => {
    expect(
      describeUploadTokenError({ status: 500, data: { message: "relation does not exist" } }),
    ).toContain("relation does not exist");
  });

  it("includes the status code when the server sends no message", () => {
    expect(describeUploadTokenError({ status: 503 })).toContain("503");
  });

  it("uses the server message for other 4xx responses", () => {
    expect(describeUploadTokenError({ status: 400, data: { error: "Bad type" } })).toBe("Bad type");
  });

  it("reports a timeout distinctly", () => {
    expect(describeUploadTokenError({ code: "ECONNABORTED" })).toContain("did not respond in time");
  });

  it("falls back to a connectivity message when there is no response", () => {
    expect(describeUploadTokenError({})).toContain("server is running");
  });
});
