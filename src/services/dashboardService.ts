import api from "./api";

export interface EvidenceCompleteness {
  windowDays: number;
  totalRuns: number;
  signed: number; signedPct: number;
  allStepsComplete: number; allStepsCompletePct: number;
  hasMedia: number; hasMediaPct: number;
  noOpenIssues: number; noOpenIssuesPct: number;
  overallScore: number;
  byProject: EvidenceProject[];
}

export interface EvidenceProject {
  projectId: string;
  jobNumber: string;
  customerName: string;
  runCount: number;
  score: number;
}

export interface WorkflowHealth {
  windowDays: number;
  overallScore: number;
  previousScore: number;
  scoreDelta: number;
  totalRuns: number;
  completionRate: number;
  firstRunSuccessRate: number;
  stepPassRate: number;
  cleanClosureRate: number;
  byType: WorkflowTypeHealth[];
}

export interface WorkflowTypeHealth {
  typeName: string;
  runCount: number;
  score: number;
}

export type DashboardScope = "default" | "pm-owned" | "participant";

export const dashboardService = {
  async evidenceCompleteness(windowDays: number, scope: DashboardScope = "default"): Promise<EvidenceCompleteness> {
    const res = await api.get<EvidenceCompleteness>("/dashboard/evidence-completeness", {
      params: { windowDays, scope }
    });
    return res.data;
  },
  async workflowHealth(windowDays: number, scope: DashboardScope = "default"): Promise<WorkflowHealth> {
    const res = await api.get<WorkflowHealth>("/dashboard/workflow-health", {
      params: { windowDays, scope }
    });
    return res.data;
  },
};
