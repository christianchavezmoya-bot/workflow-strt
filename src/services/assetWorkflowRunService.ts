import api from "./api";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";

export const assetWorkflowRunService = {
  async listByAsset(assetId: string): Promise<AssetWorkflowRun[]> {
    try {
      const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${assetId}`);
      return res.data;
    } catch (err: unknown) {
      console.warn("[assetWorkflowRunService] listByAsset failed", err);
      return [];
    }
  },

  async getById(id: string): Promise<AssetWorkflowRun | null> {
    try {
      const res = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${id}`);
      return res.data;
    } catch {
      return null;
    }
  },

  async startRun(assetId: string, workflowConfigId: string, technicianUserId?: string): Promise<AssetWorkflowRun> {
    const res = await api.post<AssetWorkflowRun>("/asset-workflow-runs", {
      assetId,
      workflowConfigId,
      technicianUserId: technicianUserId ?? null,
    });
    return res.data;
  },

  async saveProgress(runId: string, stepResultsJson: string, issuesJson?: string, status?: string): Promise<AssetWorkflowRun> {
    const res = await api.put<AssetWorkflowRun>(`/asset-workflow-runs/${runId}`, {
      stepResultsJson,
      issuesJson: issuesJson ?? null,
      status: status ?? null,
    });
    return res.data;
  },

  async completeRun(runId: string, stepResultsJson: string, issuesJson: string, completedByName?: string): Promise<AssetWorkflowRun> {
    const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/complete`, {
      stepResultsJson,
      issuesJson,
      completedByName: completedByName ?? null,
    });
    return res.data;
  },

  async reopen(runId: string): Promise<AssetWorkflowRun> {
    const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/reopen`);
    return res.data;
  },

  /** Patch issues only — works on locked and in-progress runs. */
  async patchIssues(runId: string, issuesJson: string): Promise<AssetWorkflowRun> {
    const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/issues`, { issuesJson });
    return res.data;
  },
};
