import api from "./api";

export interface SearchIndexStatus {
  isRunning: boolean;
  currentWorkType: string;
  queueDepth: number;
  currentRunStartedAtUtc?: string | null;
  currentRunProcessed: number;
  currentRunTotal: number;
  lastRebuildStartedAtUtc?: string | null;
  lastRebuildCompletedAtUtc?: string | null;
  lastRebuildProcessed: number;
  lastRebuildTotal: number;
  lastError?: string | null;
}

export const searchIndexService = {
  async getStatus(): Promise<SearchIndexStatus> {
    const response = await api.get<SearchIndexStatus>("/search/index-status");
    return response.data;
  },

  async rebuild(): Promise<void> {
    await api.post("/search/rebuild-index");
  }
};
