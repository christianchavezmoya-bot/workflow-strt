import { describe, expect, it } from "vitest";
import { buildFaultReportHistory } from "./faultReportHistory";
import { MAX_HISTORY_DEPTH, statusesPresent } from "./historyStaircase";
import type { FaultReportRow, FaultReportUpdate } from "../services/faultReportAdminService";

function report(overrides: Partial<FaultReportRow> = {}): FaultReportRow {
  return {
    id: "fr-1",
    referenceCode: "FR-7QK2M4",
    kind: "user-report",
    severity: "S1",
    status: "New",
    title: "Photo would not attach to step 4",
    description: "Tapped Add photo, took the picture, went back with no photo attached.",
    platform: "native",
    appVersion: "1.4.2",
    userAgent: "iPhone",
    routePath: "/installations/capture",
    userEmail: "installer1@StrataNgo.local",
    userRole: "Installer",
    wasOffline: true,
    occurredAtUtc: "2026-08-16T08:00:00.000Z",
    createdAtUtc: "2026-08-16T08:00:05.000Z",
    ...overrides,
  };
}

function update(overrides: Partial<FaultReportUpdate> = {}): FaultReportUpdate {
  return {
    id: `u-${Math.random().toString(36).slice(2, 8)}`,
    action: "Looked into it.",
    status: "Investigating",
    authorName: "admin@StrataNgo.local",
    systemGenerated: false,
    createdAtUtc: "2026-08-16T09:00:00.000Z",
    ...overrides,
  };
}

describe("buildFaultReportHistory", () => {
  it("uses the report as the opening row, at depth 0, as New", () => {
    const { rows } = buildFaultReportHistory(report());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ depth: 0, kind: "root", status: "New" });
    expect(rows[0].action).toContain("Photo would not attach to step 4");
    expect(rows[0].action).toContain("Tapped Add photo");
  });

  it("indents each update one step deeper than the one before", () => {
    const { rows } = buildFaultReportHistory(report(), [
      update({ id: "u1", action: "Reproduced on iOS 18.", createdAtUtc: "2026-08-16T09:00:00.000Z" }),
      update({ id: "u2", action: "Found the cause in the media queue.", createdAtUtc: "2026-08-16T10:00:00.000Z" }),
      update({ id: "u3", action: "Fix released in 1.4.3.", status: "Fixed", createdAtUtc: "2026-08-16T11:00:00.000Z" }),
    ]);

    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 3]);
    expect(rows[rows.length - 1]).toMatchObject({ kind: "closing", status: "Fixed" });
  });

  it("orders updates by time even when returned out of order", () => {
    const { rows } = buildFaultReportHistory(report(), [
      update({ id: "late", action: "Second", createdAtUtc: "2026-08-16T12:00:00.000Z" }),
      update({ id: "early", action: "First", createdAtUtc: "2026-08-16T09:00:00.000Z" }),
    ]);

    expect(rows.slice(1).map((r) => r.action)).toEqual(["First", "Second"]);
  });

  it("labels automatic status changes differently from typed actions", () => {
    const { rows } = buildFaultReportHistory(report(), [
      update({ id: "auto", action: "Status changed from New to Investigating.", systemGenerated: true }),
      update({ id: "typed", action: "Checked the upload queue.", createdAtUtc: "2026-08-16T10:00:00.000Z" }),
    ]);

    expect(rows[1].label).toBe("Status change");
    expect(rows[2].label).toBe("Corrective action");
  });

  it("reports the deepest row's status as current", () => {
    const { currentStatus } = buildFaultReportHistory(report(), [
      update({ action: "Cannot reproduce.", status: "WontFix" }),
    ]);
    expect(currentStatus).toBe("WontFix");
  });

  it("carries context once, for the header rather than per row", () => {
    const { context } = buildFaultReportHistory(report());
    const meta = Object.fromEntries(context.meta.map((m) => [m.label, m.value]));

    expect(context.reference).toBe("FR-7QK2M4");
    expect(meta.Platform).toBe("native");
    expect(meta["App version"]).toBe("1.4.2");
    expect(meta.Screen).toBe("/installations/capture");
    expect(meta["Offline at the time"]).toBe("Yes");
    expect(meta["Reported by"]).toBe("installer1@StrataNgo.local");
  });

  it("describes an automatically captured crash as such", () => {
    const { context } = buildFaultReportHistory(report({ kind: "crash" }));
    const meta = Object.fromEntries(context.meta.map((m) => [m.label, m.value]));
    expect(meta.Kind).toBe("Automatic (crash)");
  });

  it("shows legacy triage notes as an event when there is no update history", () => {
    const { rows } = buildFaultReportHistory(report({ notes: "Older triage note.", status: "Investigating" }));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ action: "Older triage note.", statusInferred: true, label: "Triage notes" });
  });

  it("prefers real updates over the notes field when both exist", () => {
    const { rows } = buildFaultReportHistory(
      report({ notes: "Older triage note." }),
      [update({ action: "Real update" })]
    );

    expect(rows).toHaveLength(2);
    expect(rows[1].action).toBe("Real update");
  });

  it("caps indentation so a long history cannot run off the page", () => {
    const updates = Array.from({ length: 15 }, (_, i) =>
      update({ id: `u${i}`, action: `Update ${i}`, createdAtUtc: `2026-08-16T${String(9 + i).padStart(2, "0")}:00:00.000Z` })
    );

    const { rows } = buildFaultReportHistory(report(), updates);
    expect(rows).toHaveLength(16);
    expect(Math.max(...rows.map((r) => r.depth))).toBe(MAX_HISTORY_DEPTH);
  });

  it("only lists statuses that actually occur", () => {
    const view = buildFaultReportHistory(report(), [update({ status: "Investigating" })]);
    expect(statusesPresent(view)).toEqual(["New", "Investigating"]);
  });
});
