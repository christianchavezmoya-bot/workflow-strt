import api from "../services/api";
import type { OpenIssueRecord } from "../services/assetWorkflowRunService";
import { entityGetAllIssues, entityPutIssues } from "../services/localDB";

export const IssueRepository = {
  async getAll(): Promise<OpenIssueRecord[]> {
    const local = await entityGetAllIssues();

    // Background refresh — runs unconditionally to keep IndexedDB fresh
    api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues")
      .then(async (res) => {
        await entityPutIssues(
          res.data.map((i) => ({ id: i.issueId, assetId: i.assetId, projectId: i.projectId, data: i }))
        );
        window.dispatchEvent(new Event("repo:issues:updated"));
      })
      .catch(() => {});

    if (local.length > 0) return local as OpenIssueRecord[];

    // No local data — wait for network
    const res = await api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues");
    await entityPutIssues(
      res.data.map((i) => ({ id: i.issueId, assetId: i.assetId, projectId: i.projectId, data: i }))
    );
    return res.data;
  },
};
