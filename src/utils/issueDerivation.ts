import type { OpenIssueRecord } from "../services/assetWorkflowRunService";
import type { AssetIssue, ProjectAsset } from "../types/projectAsset";

export type IssueProjectMeta = { jobNumber?: string; customerName?: string };

export function deriveOpenIssuesFromAsset(
  asset: ProjectAsset,
  projectMeta?: IssueProjectMeta,
): Array<{
  id: string; assetId: string; projectId: string; data: unknown;
}> {
  let issues: AssetIssue[] = [];
  try { issues = JSON.parse(asset.issuesJson ?? "[]"); } catch { /* empty */ }
  return issues
    .filter((issue) => !issue.resolved)
    .map((issue) => ({
      id: issue.id,
      assetId: asset.id,
      projectId: asset.projectId,
      data: {
        issueId: issue.id,
        description: issue.description,
        issueType: issue.issueType,
        severity: issue.severity,
        isBlocking: issue.isBlocking,
        reportedAt: issue.reportedAt,
        createdBy: null,
        stepTitle: issue.stepTitle ?? null,
        runId: "",
        assetId: asset.id,
        assetTag: asset.assetTag ?? "",
        assetName: asset.assetName ?? "",
        assetLocation: asset.location ?? "",
        projectId: asset.projectId,
        jobNumber: projectMeta?.jobNumber ?? "",
        customerName: projectMeta?.customerName ?? "",
        source: "asset" as const,
      } satisfies OpenIssueRecord,
    }));
}
