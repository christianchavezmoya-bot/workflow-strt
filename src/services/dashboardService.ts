import api from "./api";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, webCacheKey } from "./webFreshCache";

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

const DASHBOARD_ANALYTICS_TTL_MS = 60_000;
const DASHBOARD_ANALYTICS_TIMEOUT_MS = 20_000;

export const dashboardService = {
  async evidenceCompleteness(windowDays: number): Promise<EvidenceCompleteness> {
    const url = `/dashboard/evidence-completeness?windowDays=${windowDays}`;
    if (!isMobileNativePlatform()) {
      return webCachedGet(
        webCacheKey("/dashboard/evidence-completeness", { windowDays }),
        async () => {
          const res = await api.get<EvidenceCompleteness>(url, { timeout: DASHBOARD_ANALYTICS_TIMEOUT_MS });
          return res.data;
        },
        { ttlMs: DASHBOARD_ANALYTICS_TTL_MS },
      );
    }
    const res = await api.get<EvidenceCompleteness>(url);
    return res.data;
  },

  async workflowHealth(windowDays: number): Promise<WorkflowHealth> {
    const url = `/dashboard/workflow-health?windowDays=${windowDays}`;
    if (!isMobileNativePlatform()) {
      return webCachedGet(
        webCacheKey("/dashboard/workflow-health", { windowDays }),
        async () => {
          const res = await api.get<WorkflowHealth>(url, { timeout: DASHBOARD_ANALYTICS_TIMEOUT_MS });
          return res.data;
        },
        { ttlMs: DASHBOARD_ANALYTICS_TTL_MS },
      );
    }
    const res = await api.get<WorkflowHealth>(url);
    return res.data;
  },
};
