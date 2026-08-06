import { describe, expect, it } from "vitest";
import { isSignatureAlreadyAppliedError, isSignatureOrderingError } from "./signatureSyncHelpers";

describe("signatureSyncHelpers", () => {
  it("detects customer-before-installer ordering errors", () => {
    expect(isSignatureOrderingError("Installer must sign before customer.")).toBe(true);
  });

  it("detects already-applied signature rejections", () => {
    expect(isSignatureAlreadyAppliedError("Run is not awaiting installer signature.")).toBe(true);
  });
});
