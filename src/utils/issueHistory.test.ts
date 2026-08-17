import { describe, expect, it } from "vitest";
import { buildIssueHistory, MAX_HISTORY_DEPTH } from "./issueHistory";
import type { AssetIssue } from "../types/projectAsset";

function issue(overrides: Partial<AssetIssue> = {}): AssetIssue {
  return {
    id: "issue-abc123",
    description: "Pump not starting. No response when power is applied.",
    issueType: "blocking",
    isBlocking: true,
    severity: "high",
    reportedAt: "2026-05-14T08:15:00.000Z",
    resolved: false,
    ...overrides,
  };
}

describe("buildIssueHistory", () => {
  it("puts the original report first, at depth 0, as Open", () => {
    const { rows } = buildIssueHistory(issue());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      depth: 0,
      kind: "reported",
      status: "Open",
      action: "Pump not starting. No response when power is applied.",
    });
  });

  it("indents each later event one step deeper than the one before", () => {
    const { rows } = buildIssueHistory(
      issue({
        comments: [
          { id: "c1", text: "Checked power supply.", author: "Sam", createdAt: "2026-05-14T10:30:00.000Z", status: "In Progress" },
          { id: "c2", text: "Replaced start capacitor.", author: "Sam", createdAt: "2026-05-14T13:45:00.000Z", status: "In Progress" },
          { id: "c3", text: "Pump tested.", author: "Sam", createdAt: "2026-05-14T15:20:00.000Z", status: "Pending Verification" },
        ],
      })
    );

    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 3]);
  });

  it("appends the closure as the deepest row", () => {
    const { rows, currentStatus } = buildIssueHistory(
      issue({
        comments: [
          { id: "c1", text: "Replaced capacitor.", author: "Sam", createdAt: "2026-05-14T13:45:00.000Z", status: "In Progress" },
        ],
        resolved: true,
        resolvedAt: "2026-05-15T09:00:00.000Z",
        resolvedBy: "Alex",
        resolutionNote: "Pump operating normally.",
      })
    );

    const last = rows[rows.length - 1];
    expect(last).toMatchObject({
      kind: "closed",
      status: "Closed",
      action: "Pump operating normally.",
      author: "Alex",
      depth: 2,
    });
    expect(currentStatus).toBe("Closed");
  });

  it("orders updates by time even when stored out of order", () => {
    const { rows } = buildIssueHistory(
      issue({
        comments: [
          { id: "late", text: "Second", author: "Sam", createdAt: "2026-05-14T15:00:00.000Z" },
          { id: "early", text: "First", author: "Sam", createdAt: "2026-05-14T09:00:00.000Z" },
        ],
      })
    );

    expect(rows.slice(1).map((r) => r.action)).toEqual(["First", "Second"]);
  });

  it("uses the recorded status when present", () => {
    const { rows } = buildIssueHistory(
      issue({
        comments: [
          { id: "c1", text: "Awaiting sign-off.", author: "Sam", createdAt: "2026-05-14T10:00:00.000Z", status: "Pending Verification" },
        ],
      })
    );

    expect(rows[1].status).toBe("Pending Verification");
    expect(rows[1].statusInferred).toBe(false);
  });

  it("falls back for legacy updates with no status, and marks them inferred", () => {
    const { rows } = buildIssueHistory(
      issue({
        comments: [{ id: "c1", text: "Looked at it.", author: "Sam", createdAt: "2026-05-14T10:00:00.000Z" }],
      })
    );

    expect(rows[1].status).toBe("In Progress");
    expect(rows[1].statusInferred).toBe(true);
  });

  it("caps indentation so a long history cannot run off the page", () => {
    const comments = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      text: `Update ${i}`,
      author: "Sam",
      createdAt: `2026-05-14T${String(9 + i).padStart(2, "0")}:00:00.000Z`,
    }));

    const { rows } = buildIssueHistory(issue({ comments }));

    expect(rows).toHaveLength(21);
    expect(Math.max(...rows.map((r) => r.depth))).toBe(MAX_HISTORY_DEPTH);
    // Still strictly increasing until the cap.
    expect(rows.slice(0, MAX_HISTORY_DEPTH + 1).map((r) => r.depth))
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("ignores blank updates so empty comments do not create rows", () => {
    const { rows } = buildIssueHistory(
      issue({
        comments: [
          { id: "c1", text: "   ", author: "Sam", createdAt: "2026-05-14T10:00:00.000Z" },
          { id: "c2", text: "Real update", author: "Sam", createdAt: "2026-05-14T11:00:00.000Z" },
        ],
      })
    );

    expect(rows).toHaveLength(2);
    expect(rows[1].action).toBe("Real update");
  });

  it("derives a readable fault reference and carries context onto the root row", () => {
    const { context } = buildIssueHistory(issue(), {
      assetLabel: "Conveyor CV-104",
      projectLabel: "JOB-4021",
    });

    expect(context.faultId).toBe("FAULT-ABC123");
    expect(context.assetLabel).toBe("Conveyor CV-104");
    expect(context.projectLabel).toBe("JOB-4021");
    expect(context.severity).toBe("high");
  });

  it("still closes cleanly when a resolved issue has no resolution note", () => {
    const { rows } = buildIssueHistory(issue({ resolved: true, resolvedAt: "2026-05-15T09:00:00.000Z" }));
    expect(rows[rows.length - 1].action).toBe("Fault closed.");
  });
});
