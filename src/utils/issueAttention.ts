/** Shared filters for dashboard / attention widgets (high observations + scope variations). */

export type IssueAttentionFields = {
  isBlocking: boolean;
  severity: string;
  issueType?: string;
};

export function isHighObservationIssue(issue: IssueAttentionFields): boolean {
  return !issue.isBlocking && issue.severity === "high" && issue.issueType === "observation";
}

export function isScopeVariationIssue(issue: { issueType?: string }): boolean {
  return issue.issueType === "scope-deviation";
}

/** Non-blocking high observations plus scope variations — both belong on attention dashboards. */
export function isDashboardAttentionIssue(issue: IssueAttentionFields): boolean {
  return isHighObservationIssue(issue) || isScopeVariationIssue(issue);
}
