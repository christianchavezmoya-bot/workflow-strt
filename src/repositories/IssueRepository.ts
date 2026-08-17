import api from "../services/api";
import type { OpenIssueRecord } from "../services/assetWorkflowRunService";
import { shouldSkipBlockingFetch } from "../services/connectivityMonitor";
import { entityGetAllIssues, entityReplaceAllIssues, syncMetaSet } from "../services/localDB";
import { isMobileNativePlatform } from "../utils/platform";
import { isOfflineNetworkError } from "../utils/offlineNetworkError";
import { webCachedGet, webCacheKey } from "../services/webFreshCache";

function toRecord(i: OpenIssueRecord) {
  return { id: i.issueId, assetId: i.assetId, projectId: i.projectId, data: i };
}

function issueSnapshotKey(issue: OpenIssueRecord): string {
  return JSON.stringify([
    issue.issueId,
    issue.assetId,
    issue.projectId,
    issue.description,
    issue.issueType,
    issue.severity,
    issue.isBlocking,
    issue.reportedAt,
    issue.createdBy,
    issue.stepTitle,
    issue.runId,
    issue.source,
  ]);
}

function issuesListChanged(previous: OpenIssueRecord[], next: OpenIssueRecord[]): boolean {
  if (previous.length !== next.length) return true;
  const previousKeys = [...previous].map(issueSnapshotKey).sort();
  const nextKeys = [...next].map(issueSnapshotKey).sort();
  return nextKeys.some((key, index) => key !== previousKeys[index]);
}

const DASHBOARD_ATTENTION_TIMEOUT_MS = 20_000;

export const IssueRepository = {
  /** Read IndexedDB snapshot only — no network, no repo:issues:updated event. */
  async getLocalSnapshot(): Promise<OpenIssueRecord[]> {
    if (!isMobileNativePlatform()) return [];
    const local = await entityGetAllIssues();
    return local as OpenIssueRecord[];
  },

  async getAll(userId?: string): Promise<OpenIssueRecord[]> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(
        webCacheKey("/asset-workflow-runs/open-issues", userId ? { userId } : undefined),
        async () => {
          const res = await api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues", {
            params: userId ? { userId } : undefined,
            timeout: DASHBOARD_ATTENTION_TIMEOUT_MS,
          });
          return res.data;
        },
        { ttlMs: 30_000 },
      );
    }

    const local = await entityGetAllIssues();

    // Background refresh — reconciles deleted rows via replace-all (skip when offline)
    if (!shouldSkipBlockingFetch()) {
      api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues", { params: userId ? { userId } : undefined })
        .then(async (res) => {
          const localSnapshot = (local.length > 0 ? local : await entityGetAllIssues()) as OpenIssueRecord[];
          if (!issuesListChanged(localSnapshot, res.data)) return;
          await entityReplaceAllIssues(res.data.map(toRecord));
          await syncMetaSet("issues");
          window.dispatchEvent(new Event("repo:issues:updated"));
        })
        .catch((err) => {
          if (isOfflineNetworkError(err)) {
            window.dispatchEvent(new Event("repo:issues:fetch-failed"));
          }
        });
    }

    if (local.length > 0) return local as OpenIssueRecord[];

    if (shouldSkipBlockingFetch()) return [];

    const res = await api.get<OpenIssueRecord[]>("/asset-workflow-runs/open-issues", { params: userId ? { userId } : undefined });
    await entityReplaceAllIssues(res.data.map(toRecord));
    return res.data;
  },
};
