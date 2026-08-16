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
  notes?: string | null;
  resolvedAtUtc?: string | null;
}

export interface FaultReportDetail {
  report: FaultReportRow;
  errorStack?: string | null;
  breadcrumbsJson?: string | null;
  diagnosticsJson?: string | null;
}

export interface FaultReportSummary {
  total: number;
  new: number;
  investigating: number;
  unresolved: number;
  lastSevenDays: number;
}

export const faultReportAdminService = {
  async list(params: { status?: string; severity?: string; platform?: string; take?: number } = {}) {
    const { data } = await api.get<FaultReportRow[]>("/fault-reports", { params });
    return data;
  },

  async summary() {
    const { data } = await api.get<FaultReportSummary>("/fault-reports/summary");
    return data;
  },

  async get(id: string) {
    const { data } = await api.get<FaultReportDetail>(`/fault-reports/${id}`);
    return data;
  },

  async getByReference(reference: string) {
    const { data } = await api.get<FaultReportDetail>(
      `/fault-reports/by-reference/${encodeURIComponent(reference)}`
    );
    return data;
  },

  async update(id: string, patch: { status?: string; severity?: string; notes?: string }) {
    const { data } = await api.patch<FaultReportRow>(`/fault-reports/${id}`, patch);
    return data;
  },

  async remove(id: string) {
    await api.delete(`/fault-reports/${id}`);
  },
};
