import api from "../services/api";
import type { OpenIssueRecord } from "../services/assetWorkflowRunService";
import { entityGetAllIssues, entityReplaceAllIssues } from "../services/localDB";

function toRecord(i: OpenIssueRecord) {
  return { id: i.issueId, assetId: i.assetId, projectId: i.projectId, data: i };
}

export const IssueRepository = {
  async getAll(userId?: string): Promise<OpenIssueRecord[]> {
    const local = await entityGetAllIssues();

    // Background refresh — reconciles deleted rows via replace-all
    api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues", { params: userId ? { userId } : undefined })
      .then(async (res) => {
        await entityReplaceAllIssues(res.data.map(toRecord));
        window.dispatchEvent(new Event("repo:issues:updated"));
      })
      .catch(() => {});

    if (local.length > 0) return local as OpenIssueRecord[];

    // No local data — wait for network
    const res = await api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues", { params: userId ? { userId } : undefined });
    await entityReplaceAllIssues(res.data.map(toRecord));
    return res.data;
  },
};
