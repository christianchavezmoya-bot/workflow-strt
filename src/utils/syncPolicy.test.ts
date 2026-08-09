import { describe, expect, it } from "vitest";
import {
  getSyncOpTimeoutMs,
  RUN_LARGE_PAYLOAD_TIMEOUT_MS,
  RUN_MUTATION_TIMEOUT_MS,
} from "./syncPolicy";

describe("getSyncOpTimeoutMs", () => {
  it("uses extended timeout for signature uploads with PNG payloads", () => {
    expect(getSyncOpTimeoutMs("SIGNATURE_SUBMIT")).toBe(RUN_MUTATION_TIMEOUT_MS);
  });

  it("uses extended timeout for time-entry sync on slow links", () => {
    expect(getSyncOpTimeoutMs("TIME_ENTRY")).toBe(RUN_MUTATION_TIMEOUT_MS);
  });

  it("extends timeout for large run-complete payloads", () => {
    expect(getSyncOpTimeoutMs("RUN_COMPLETE", 815_564)).toBe(RUN_LARGE_PAYLOAD_TIMEOUT_MS);
  });

  it("keeps default timeout for lightweight ops", () => {
    expect(getSyncOpTimeoutMs("ASSET_UPDATE")).toBe(10_000);
  });
});
