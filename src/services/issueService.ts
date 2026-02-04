import api from "./api";

export interface Issue {
  id: string;
  installationId: string;
  title: string;
  status: string;
  priority: string;
  owner: string;
  startDate?: string;
  finishDate?: string;
  description?: string;
}

export const issueService = {
  async getIssues() {
    const response = await api.get<Issue[]>("/issues");
    return response.data;
  },
  async createIssue(payload: Issue) {
    const response = await api.post<Issue>("/issues", payload);
    return response.data;
  },
  async updateIssue(id: string, payload: Issue) {
    const response = await api.put<Issue>(`/issues/${id}`, payload);
    return response.data;
  }
};
