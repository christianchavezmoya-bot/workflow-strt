// Classifies a run's stored IssuesJson the way the API treats it since #392
// (server/Commtrac.Api/Services/RunIssueMerge.cs). Pure; shared by run-issue-audit.mjs and its tests.
//
//   "ok"                 the list merges normally
//   "stored_unreadable"  not a readable JSON array → every issue write to the run is refused
//                        (422 stored_issues_unreadable) until an admin repairs it
//   "resend_rejected"    readable, but a client that re-sends this list (runner autosave, Issues
//                        board / dashboard / history edits) gets 400 issues_invalid, because the
//                        API validates client lists: objects only, unique non-empty string ids,
//                        isBlocking / resolved boolean (or null) when present

export function classifyStoredIssues(issuesJson) {
  if (issuesJson == null || String(issuesJson).trim() === "") return { status: "ok", reasons: [] };
  let parsed;
  try {
    parsed = JSON.parse(issuesJson);
  } catch {
    return { status: "stored_unreadable", reasons: ["invalid JSON"] };
  }
  if (!Array.isArray(parsed)) return { status: "stored_unreadable", reasons: ["not an array"] };

  const reasons = new Set();
  const ids = new Set();
  for (const issue of parsed) {
    if (issue === null || typeof issue !== "object" || Array.isArray(issue)) {
      reasons.add("entry not an object");
      continue;
    }
    if (typeof issue.id !== "string") reasons.add(issue.id === undefined || issue.id === null ? "missing id" : "non-string id");
    else if (issue.id.length === 0) reasons.add("empty id");
    else if (ids.has(issue.id)) reasons.add("duplicate id");
    else ids.add(issue.id);
    for (const key of ["isBlocking", "resolved"]) {
      if (key in issue && issue[key] !== null && typeof issue[key] !== "boolean") reasons.add(`non-boolean ${key}`);
    }
  }
  return reasons.size === 0 ? { status: "ok", reasons: [] } : { status: "resend_rejected", reasons: [...reasons].sort() };
}
