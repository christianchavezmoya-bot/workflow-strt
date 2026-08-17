/**
 * Admin-side reads for triaging fault reports submitted from the apps.
 */
import api from "./api";

export interface FaultReportRow {
  id: string;
  referenceCode: string;
  kind: string;
  severity: string;
  status: string;
  title: string;
  description?: string | null;
  platform: string;
  appVersion?: string | null;
  userAgent?: string | null;
  routePath?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  errorName?: string | null;
  errorMessage?: string | null;
  traceId?: string | null;
  wasOffline: boolean;
  occurredAtUtc: string;
  createdAtUtc: string;
  lastUpdatedAtUtc?: string | null;
  notes?: string | null;
  resolvedAtUtc?: string | null;
}

/** One event in the life of a report — a corrective action, or an automatic status change. */
export interface FaultReportUpdate {
  id: string;
  action: string;
  status: string;
  authorName?: string | null;
  systemGenerated: boolean;
  createdAtUtc: string;
}

export interface FaultReportDetail {
  report: FaultReportRow;
  errorStack?: string | null;
  breadcrumbsJson?: string | null;
  diagnosticsJson?: string | null;
  updates: FaultReportUpdate[];
}

export interface FaultReportSummary {
  total: number;
  new: number;
  investigating: number;
  unresolved: number;
  lastSevenDays: number;
}

function normalizeRow(row: FaultReportRow): FaultReportRow {
  return {
    ...row,
    lastUpdatedAtUtc: row.lastUpdatedAtUtc ?? row.resolvedAtUtc ?? row.createdAtUtc ?? row.occurredAtUtc,
  };
}

function normalizeDetail(detail: FaultReportDetail): FaultReportDetail {
  return {
    ...detail,
    report: normalizeRow(detail.report),
    updates: Array.isArray(detail.updates) ? detail.updates : [],
  };
}

export const faultReportAdminService = {
  async list(params: { status?: string; severity?: string; platform?: string; take?: number } = {}) {
    const { data } = await api.get<FaultReportRow[]>("/fault-reports", { params });
    return data.map(normalizeRow);
  },

  async summary() {
    const { data } = await api.get<FaultReportSummary>("/fault-reports/summary");
    return data;
  },

  async get(id: string) {
    const { data } = await api.get<FaultReportDetail>(`/fault-reports/${id}`);
    return normalizeDetail(data);
  },

  async getByReference(reference: string) {
    const { data } = await api.get<FaultReportDetail>(
      `/fault-reports/by-reference/${encodeURIComponent(reference)}`
    );
    return normalizeDetail(data);
  },

  async update(id: string, patch: { status?: string; severity?: string; notes?: string }) {
    const { data } = await api.patch<FaultReportRow>(`/fault-reports/${id}`, patch);
    return normalizeRow(data);
  },

  /** Appends a corrective action. The report's own status moves to match. */
  async addUpdate(id: string, body: { action: string; status?: string }) {
    const { data } = await api.post<FaultReportUpdate>(`/fault-reports/${id}/updates`, body);
    return data;
  },

  async remove(id: string) {
    await api.delete(`/fault-reports/${id}`);
  },
};
