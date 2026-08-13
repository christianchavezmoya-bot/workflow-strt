import { describe, expect, it } from "vitest";
import type { PublicRunSummary } from "../types/signature";
import { buildPublicSignReportContext } from "./buildPublicSignReportContext";

function sampleSummary(overrides: Partial<PublicRunSummary> = {}): PublicRunSummary {
  return {
    runId: "run-1",
    assetName: "LV (Light Vehicle)",
    assetSerial: "SN-123",
    workflowName: "Chambers Config 4",
    projectJobNumber: "JO003424",
    customerName: "BHP",
    completedByName: "Juan Perez",
    completedAt: "2026-08-09T09:20:00.000Z",
    signatureStatus: "PendingCustomer",
    signerRole: "Customer",
    recipientName: "Customer",
    recipientEmail: "customer@example.com",
    tokenValid: true,
    workflowSnapshotJson: "{}",
    stepResultsJson: "[]",
    issuesJson: "[]",
    assetTag: "AAM0003",
    assetLocation: "123 Business Ave",
    installerSignerName: "Juan Perez",
    timeZoneId: "Australia/Sydney",
    startedAt: "2026-08-09T01:23:00.000Z",
    timeTrackingJson: "[{\"category\":\"productive\"}]",
    productiveSeconds: 28620,
    downtimeSeconds: 0,
    downtimeEvents: 0,
    runNumber: 1,
    assetModel: "Land Cruiser 70 Series",
    manufacturer: "Land Cruiser",
    siteName: "Broadmeadow",
    assignedTechnicianName: "Juan Perez",
    ...overrides,
  };
}

describe("buildPublicSignReportContext", () => {
  it("maps full run and asset metadata for report parity", async () => {
    const ctx = await buildPublicSignReportContext(sampleSummary());

    expect(ctx.run.startedAt).toBe("2026-08-09T01:23:00.000Z");
    expect(ctx.run.completedAt).toBe("2026-08-09T09:20:00.000Z");
    expect(ctx.run.productiveSeconds).toBe(28620);
    expect(ctx.run.timeTrackingJson).toContain("productive");
    expect(ctx.asset.assetModel).toBe("Land Cruiser 70 Series");
    expect(ctx.asset.manufacturer).toBe("Land Cruiser");
    expect(ctx.siteName).toBe("Broadmeadow");
    expect(ctx.assignedTechnician).toBe("Juan Perez");
    expect(ctx.signatureEvents).toHaveLength(1);
  });

  it("does not collapse startedAt to completedAt when startedAt is provided", async () => {
    const ctx = await buildPublicSignReportContext(sampleSummary({
      startedAt: "2026-08-09T01:23:00.000Z",
      completedAt: "2026-08-09T09:20:00.000Z",
    }));

    expect(ctx.run.startedAt).not.toBe(ctx.run.completedAt);
  });
});
