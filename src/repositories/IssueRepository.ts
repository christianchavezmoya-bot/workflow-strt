import api from "../services/api";
import type { OpenIssueRecord } from "../services/assetWorkflowRunService";
import { entityGetAllIssues, entityReplaceAllIssues, syncMetaSet } from "../services/localDB";
import { isMobileNativePlatform } from "../utils/platform";

function toRecord(i: OpenIssueRecord) {
  return { id: i.issueId, assetId: i.assetId, projectId: i.projectId, data: i };
}

export const IssueRepository = {
  async getAll(userId?: string): Promise<OpenIssueRecord[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues", { params: userId ? { userId } : undefined });
      return res.data;
    }

    const local = await entityGetAllIssues();

    // Background refresh — reconciles deleted rows via replace-all
    api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues", { params: userId ? { userId } : undefined })
      .then(async (res) => {
        await entityReplaceAllIssues(res.data.map(toRecord));
        await syncMetaSet("issues");
        window.dispatchEvent(new Event("repo:issues:updated"));
      })
      .catch(() => { window.dispatchEvent(new Event("repo:issues:fetch-failed")); });

    if (local.length > 0) return local as OpenIssueRecord[];

    // No local data — wait for network
    const res = await api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues", { params: userId ? { userId } : undefined });
    await entityReplaceAllIssues(res.data.map(toRecord));
    return res.data;
  },
};
