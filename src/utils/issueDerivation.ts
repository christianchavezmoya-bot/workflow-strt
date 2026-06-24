import type { OpenIssueRecord } from "../services/assetWorkflowRunService";
import type { AssetIssue, ProjectAsset } from "../types/projectAsset";

export function deriveOpenIssuesFromAsset(asset: ProjectAsset): Array<{
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
        jobNumber: "",
        customerName: "",
        source: "asset" as const,
      } satisfies OpenIssueRecord,
    }));
}
