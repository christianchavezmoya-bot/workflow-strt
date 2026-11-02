// @vitest-environment node
// The audit must flag exactly what the API (RunIssueMerge, #392) refuses — same cases as
// server/Commtrac.Api.Tests/RunIssueMergeTests.A_malformed_client_list_is_rejected... and
// An_unreadable_recorded_list_fails_closed...
import { describe, expect, it } from "vitest";
import { classifyStoredIssues } from "./run-issue-classifier.mjs";
import { summarize } from "./run-issue-audit.mjs";

describe("classifyStoredIssues mirrors the API contract", () => {
  it.each([null, "", "  ", "[]", '[{"id":"a","isBlocking":true,"resolved":false},{"id":"b","resolved":null}]'])(
    "%j is ok", (json) => expect(classifyStoredIssues(json).status).toBe("ok"),
  );

  it.each(["not json", '{"id":"x"}', "null", '"text"'])("%j is stored_unreadable (writes fail closed)", (json) => {
    expect(classifyStoredIssues(json).status).toBe("stored_unreadable");
  });

  it.each([
    ['["just a string"]', "entry not an object"],
    ['[{"description":"no id"}]', "missing id"],
    ['[{"id":""}]', "empty id"],
    ['[{"id":7}]', "non-string id"],
    ['[{"id":"a"},{"id":"a"}]', "duplicate id"],
    ['[{"id":"a","isBlocking":"true"}]', "non-boolean isBlocking"],
    ['[{"id":"a","isBlocking":true,"resolved":1}]', "non-boolean resolved"],
  ])("%j is resend_rejected (%s)", (json, reason) => {
    const r = classifyStoredIssues(json);
    expect(r.status).toBe("resend_rejected");
    expect(r.reasons).toContain(reason);
  });
});

describe("summarize", () => {
  it("counts by status, workflow type and reason; lists affected runs without issue content", () => {
    const s = summarize([
      { runId: "r1", isLocked: 1, issuesJson: "[]", workflowType: "Installation" },
      { runId: "r2", isLocked: 0, issuesJson: '[{"description":"secret text"}]', workflowType: "Inspection" },
      { runId: "r3", isLocked: 1, issuesJson: "not json", workflowType: null, configType: "Install" },
    ]);
    expect(s).toMatchObject({ totalRuns: 3, ok: 1, resend_rejected: 1, stored_unreadable: 1, openRunsAffected: 1 });
    expect(s.byWorkflowType).toEqual({ Inspection: { stored_unreadable: 0, resend_rejected: 1 }, "legacy:Install": { stored_unreadable: 1, resend_rejected: 0 } });
    expect(JSON.stringify(s)).not.toContain("secret text");
  });
});
