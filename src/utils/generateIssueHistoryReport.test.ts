import { describe, expect, it } from "vitest";
import { buildIssueHistoryReportHtml } from "./generateIssueHistoryReport";
import { buildIssueHistory } from "./issueHistory";
import type { AssetIssue } from "../types/projectAsset";

const issue: AssetIssue = {
  id: "issue-abc123",
  description: "Pump not starting. No response when power is applied.",
  issueType: "blocking",
  isBlocking: true,
  severity: "high",
  reportedAt: "2026-05-14T08:15:00.000Z",
  resolved: true,
  resolvedAt: "2026-05-15T09:00:00.000Z",
  resolvedBy: "Alex Reed",
  resolutionNote: "Pump operating normally.",
  comments: [
    { id: "c1", text: "Checked power supply and connections.", author: "Sam Doyle", createdAt: "2026-05-14T10:30:00.000Z", status: "In Progress" },
    { id: "c2", text: "Replaced start capacitor.", author: "Sam Doyle", createdAt: "2026-05-14T13:45:00.000Z", status: "In Progress" },
    { id: "c3", text: "Pump tested.", author: "Sam Doyle", createdAt: "2026-05-14T15:20:00.000Z", status: "Pending Verification" },
  ],
};

function html(overrides: Partial<AssetIssue> = {}) {
  const history = buildIssueHistory({ ...issue, ...overrides }, {
    assetLabel: "PMP-002 · Transfer Pump",
    location: "Level 3 Pump Room",
  });
  return buildIssueHistoryReportHtml({ history, timeZoneId: "UTC" });
}

describe("buildIssueHistoryReportHtml", () => {
  it("produces a standalone printable document", () => {
    const out = html();
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("<title>");
    expect(out).toContain("@media print");
  });

  it("shows the fault context once, in the summary", () => {
    const out = html();
    expect(out).toContain("PMP-002 · Transfer Pump");
    expect(out).toContain("Level 3 Pump Room");
    // Asset appears in the summary block only, not repeated per row.
    expect(out.split("PMP-002").length - 1).toBe(1);
  });

  it("includes every event with its action and status", () => {
    const out = html();
    for (const text of [
      "Pump not starting. No response when power is applied.",
      "Checked power supply and connections.",
      "Replaced start capacitor.",
      "Pump tested.",
      "Pump operating normally.",
    ]) {
      expect(out).toContain(text);
    }
    expect(out).toContain("Pending Verification");
    expect(out).toContain("Closed");
  });

  it("indents each row further than the one before it", () => {
    const out = html();
    const indents = [...out.matchAll(/padding-left:(\d+)px/g)].map((m) => Number(m[1]));
    expect(indents.length).toBe(5);
    // Strictly increasing — this is the staircase.
    for (let i = 1; i < indents.length; i += 1) {
      expect(indents[i]).toBeGreaterThan(indents[i - 1]);
    }
  });

  it("draws a connector on every row except the original report", () => {
    const out = html();
    expect([...out.matchAll(/class="elbow"/g)]).toHaveLength(4);
  });

  it("explains only the statuses actually present", () => {
    const out = html({ resolved: false, resolvedAt: undefined, resolutionNote: undefined, comments: [] });
    expect(out).toContain("Logged but no action taken yet");
    expect(out).not.toContain("Resolved and signed off");
  });

  it("escapes user text so a report cannot inject markup", () => {
    const out = html({ description: '<img src=x onerror="alert(1)">' });
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img src=x");
  });

  it("flags inferred statuses in the legend area", () => {
    const out = html({
      comments: [{ id: "legacy", text: "Old update", author: "Sam", createdAt: "2026-05-14T10:00:00.000Z" }],
    });
    expect(out).toContain("In Progress *");
    expect(out).toContain("Status inferred");
  });
});
