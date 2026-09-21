import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deterministicId, sha256Utf8 } from "./deterministicId";

/**
 * Reference vectors produced by the REAL .NET runtime running the backend's exact algorithm
 * (WorkflowConfigsController.DeterministicId). The same table is asserted server-side in
 * WorkflowContextIdContractTests, so the two implementations cannot drift apart silently.
 */
export const DOTNET_VECTORS: [seed: string, id: string][] = [
  ["step:feature:feat-1:unit:1:installation", "7efc169e-cde5-1271-4404-e49d6e411d73"],
  ["step:feature:feat-1:unit:2:data-collection", "2b3f2c12-3356-462b-84bb-574ff3f678c3"],
  ["field:feat-1:unit:1:dep:dep-a:key:serialNo", "318cdfd3-43c8-e922-a956-b14058f77a6d"],
  ["field:feat-1:unit:3:dep:dep-a:key:firmware", "4c1bd9c3-3cdb-0e19-f862-38e27e9d03b5"],
  ["field:feat-1:unit:1:dep:dep-b:key:qty", "4e5245f5-8ae2-9c9f-c3aa-584cd6f0b8b0"],
  ["field:feat-1:unit:1:partNumber", "9348b70c-cac9-7675-ac61-c43821262058"],
  [
    "field:0f8fad5b-d9cb-469f-a165-70867728950e:unit:1:dep:7c9e6679-7425-40de-944b-e07fc1f90ae7:key:macAddress",
    "754a0ade-3753-f4c7-2326-0a1de1491cdc",
  ],
  [
    "step:feature:0f8fad5b-d9cb-469f-a165-70867728950e:unit:12:installation",
    "cb3cae96-6deb-017d-7b0e-c19a8b4e3af2",
  ],
];

describe("deterministicId (twin of WorkflowConfigsController.DeterministicId)", () => {
  it.each(DOTNET_VECTORS)("matches the .NET runtime for %s", (seed, expected) => {
    expect(deterministicId(seed)).toBe(expected);
  });

  it("sha256 matches Node's implementation across padding boundaries and non-ASCII input", () => {
    for (const text of ["", "a", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(63), "x".repeat(64), "x".repeat(200), "Preparación — 検査"]) {
      expect(Buffer.from(sha256Utf8(text)).toString("hex"), JSON.stringify(text.slice(0, 12))).toBe(
        createHash("sha256").update(text, "utf8").digest("hex"),
      );
    }
  });

  it("is stable and unit-sensitive (different units never collide)", () => {
    const a = deterministicId("field:f:unit:1:dep:d:key:serialNo");
    const b = deterministicId("field:f:unit:2:dep:d:key:serialNo");
    expect(a).toBe(deterministicId("field:f:unit:1:dep:d:key:serialNo"));
    expect(a).not.toBe(b);
  });
});
