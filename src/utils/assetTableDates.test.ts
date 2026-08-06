import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../types/projectAsset";
import { formatAssetTableDate, resolveAssetClosedAt } from "./assetTableDates";
import { formatCompactWallClock } from "./datetime";

describe("formatCompactWallClock", () => {
  it("formats as DD/MM/YY HH:MM without a timezone suffix", () => {
    const text = formatCompactWallClock("2026-08-06T04:30:00Z", "UTC");
    expect(text).toMatch(/^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(text).not.toMatch(/GMT|UTC|AEST/i);
  });
});

describe("resolveAssetClosedAt", () => {
  const base = {
    id: "a1",
    projectId: "p1",
    productId: "prod1",
    assetTag: "CAD-0001",
    status: "InProgress",
    featureValuesJson: "[]",
    issuesJson: "[]",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  } as ProjectAsset;

  it("prefers installedAt", () => {
    expect(resolveAssetClosedAt({ ...base, installedAt: "2026-03-01T00:00:00Z" })).toBe(
      "2026-03-01T00:00:00Z",
    );
  });

  it("uses run completedAt when installedAt is missing", () => {
    expect(
      resolveAssetClosedAt(base, [{
        id: "r1",
        assetId: "a1",
        workflowConfigId: "wc1",
        workflowVersion: 1,
        status: "Complete",
        isLocked: true,
        startedAt: "2026-01-01",
        completedAt: "2026-04-01T00:00:00Z",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        stepResultsJson: "[]",
        workflowSnapshotJson: "{}",
        issuesJson: "[]",
        timeTrackingJson: "[]",
        productiveSeconds: 0,
        downtimeSeconds: 0,
        downtimeEvents: 0,
        runNumber: 1,
        signatureStatus: "Signed",
      }]),
    ).toBe("2026-04-01T00:00:00Z");
  });

  it("falls back to updatedAt for terminal statuses", () => {
    expect(resolveAssetClosedAt({ ...base, status: "Closed" })).toBe("2026-02-01T00:00:00Z");
  });
});

describe("formatAssetTableDate", () => {
  it("returns dash for empty values", () => {
    expect(formatAssetTableDate(undefined, "UTC")).toBe("-");
  });
});
