/**
 * Time Analytics — data service
 *
 * Fetches snapshot data from the backend via the host app's axios instance.
 */

import type { TimeAnalyticsSnapshot, TimeAnalyticsFilters } from "../types";

export interface TimeAnalyticsService {
  fetch(filters: TimeAnalyticsFilters): Promise<TimeAnalyticsSnapshot>;
}

export class ApiTimeAnalyticsService implements TimeAnalyticsService {
  constructor(
    private api: { get: <T>(url: string, config?: object) => Promise<{ data: T }> },
    private options: { endpoint?: string } = {},
  ) {}

  async fetch(filters: TimeAnalyticsFilters): Promise<TimeAnalyticsSnapshot> {
    const url = this.options.endpoint ?? "/time-analytics/snapshot";
    const res = await this.api.get<TimeAnalyticsSnapshot>(url, { params: filters });
    return res.data;
  }
}
