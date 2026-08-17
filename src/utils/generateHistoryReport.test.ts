import { describe, expect, it } from "vitest";
import { buildHistoryReportHtml } from "./generateHistoryReport";
import { buildFaultReportHistory } from "./faultReportHistory";
import type { FaultReportRow, FaultReportUpdate } from "../services/faultReportAdminService";

const report: FaultReportRow = {
  id: "fr-1",
  referenceCode: "FR-7QK2M4",
  kind: "user-report",
  severity: "S1",
  status: "Fixed",
  title: "Photo would not attach to step 4",
  description: "Tapped Add photo, took the picture, went back with no photo attached.",
  platform: "native",
  appVersion: "1.4.2",
  routePath: "/installations/capture",
  userEmail: "installer1@StrataNgo.local",
  userRole: "Installer",
  wasOffline: true,
  occurredAtUtc: "2026-08-16T08:00:00.000Z",
  createdAtUtc: "2026-08-16T08:00:05.000Z",
};

const updates: FaultReportUpdate[] = [
  { id: "u1", action: "Reproduced on iOS 18.", status: "Investigating", authorName: "Admin", systemGenerated: false, createdAtUtc: "2026-08-16T09:00:00.000Z" },
  { id: "u2", action: "Cause found in the media queue.", status: "Investigating", authorName: "Admin", systemGenerated: false, createdAtUtc: "2026-08-16T10:00:00.000Z" },
  { id: "u3", action: "Fix released in 1.4.3.", status: "Fixed", authorName: "Admin", systemGenerated: false, createdAtUtc: "2026-08-16T11:00:00.000Z" },
];

function html(r: FaultReportRow = report, u: FaultReportUpdate[] = updates) {
  return buildHistoryReportHtml({
    view: buildFaultReportHistory(r, u),
    timeZoneId: "UTC",
    documentLabel: "Fault report",
  });
}

describe("buildHistoryReportHtml", () => {
  it("produces a standalone printable document", () => {
    const out = html();
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("@media print");
    expect(out).toContain("page-break-inside: avoid");
    expect(out).toContain("Fault report — FR-7QK2M4");
  });

  it("shows context once in the summary rather than per row", () => {
    const out = html();
    expect(out).toContain("installer1@StrataNgo.local");
    expect(out.split("installer1@StrataNgo.local").length - 1).toBe(1);
  });

  it("includes every event and its status", () => {
    const out = html();
    for (const text of [
      "Photo would not attach to step 4",
      "Reproduced on iOS 18.",
      "Cause found in the media queue.",
      "Fix released in 1.4.3.",
    ]) {
      expect(out).toContain(text);
    }
    expect(out).toContain("Investigating");
    expect(out).toContain("Fixed");
  });

  it("indents each row further than the one before it", () => {
    const indents = [...html().matchAll(/padding-left:(\d+)px/g)].map((m) => Number(m[1]));
    expect(indents).toHaveLength(4);
    for (let i = 1; i < indents.length; i += 1) {
      expect(indents[i]).toBeGreaterThan(indents[i - 1]);
    }
  });

  it("draws a connector on every row except the opening one", () => {
    expect([...html().matchAll(/class="elbow"/g)]).toHaveLength(3);
  });

  it("switches to a straight connector once indentation caps out", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `u${i}`,
      action: `Update ${i}`,
      status: "Investigating",
      authorName: "Admin",
      systemGenerated: false,
      createdAtUtc: `2026-08-16T${String(9 + i).padStart(2, "0")}:00:00.000Z`,
    }));

    const out = html(report, many);
    expect(out).toContain('class="elbow straight"');
  });

  it("explains only the statuses present", () => {
    const out = html(report, []);
    expect(out).toContain("Logged but triage has not started");
    expect(out).not.toContain("Already covered by another report");
  });

  it("escapes user text so a report cannot inject markup", () => {
    const out = html({ ...report, title: '<img src=x onerror="alert(1)">' }, []);
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img src=x");
  });
});
