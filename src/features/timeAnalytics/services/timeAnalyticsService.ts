/**
 * Time Analytics — data service
 *
 * Fetches snapshot data from the backend via the host app's axios instance.
 */

import type { TimeAnalyticsSnapshot, TimeAnalyticsFilters } from "../types";
import type { FinanceSettings } from "../utils/financeSettings";

export interface TimeAnalyticsService {
  fetch(filters: TimeAnalyticsFilters, finance?: FinanceSettings): Promise<TimeAnalyticsSnapshot>;
}

export class ApiTimeAnalyticsService implements TimeAnalyticsService {
  constructor(
    private api: { get: <T>(url: string, config?: object) => Promise<{ data: T }> },
    private options: { endpoint?: string } = {},
  ) {}

  async fetch(
    filters: TimeAnalyticsFilters,
    finance?: FinanceSettings,
  ): Promise<TimeAnalyticsSnapshot> {
    const url = this.options.endpoint ?? "/time-analytics/snapshot";
    const params: Record<string, string | number | undefined> = { ...filters };
    if (finance) {
      params.hourlyRate = finance.hourlyRate;
      params.revenueMultiplier = finance.revenueMultiplier;
      params.quotedRatio = finance.quotedRatio;
    }
    const res = await this.api.get<TimeAnalyticsSnapshot>(url, { params });
    return res.data;
  }
}
