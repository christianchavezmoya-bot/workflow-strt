import type { RunIssue } from "../types/assetWorkflowRun";

/**
 * Whether the user may delete an issue, or lower it out of "blocking", in the runner.
 *
 * Mirrors the API rule (server/Commtrac.Api/Services/RunIssueMerge.cs), which refuses the change
 * otherwise: an unresolved blocking issue may only be removed or downgraded by Admin / Project
 * Manager or by whoever recorded it. The server stamps `createdByUserId` when an issue first
 * reaches it; issues flagged on this device in this session don't carry it locally yet, so they
 * are passed in `sessionCreatedIds`. Anyone may resolve (close) a blocking issue.
 */
export function canRemoveOrDowngradeIssue(
  issue: Pick<RunIssue, "id" | "isBlocking" | "resolved" | "createdByUserId">,
  user: { id?: string | null; role?: string | null } | null | undefined,
  sessionCreatedIds: ReadonlySet<string>,
): boolean {
  if (!issue.isBlocking || issue.resolved) return true;
  if (user?.role === "Admin" || user?.role === "Project Manager") return true;
  if (issue.createdByUserId) return Boolean(user?.id) && issue.createdByUserId === user?.id;
  return sessionCreatedIds.has(issue.id);
}
