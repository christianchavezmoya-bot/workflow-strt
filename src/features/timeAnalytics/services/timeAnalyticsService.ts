/**
 * Time Analytics — data service
 *
 * Single source of truth for fetching + shaping data for the dashboard.
 *
 * Strategy:
 *   1. Try to hit your real backend via the existing `api` axios instance
 *      (passed in by the host app — keeps auth headers, baseURL, etc.).
 *   2. On any failure, fall back to a deterministic mock dataset so the
 *      UI always renders something useful during dev / before the
 *      backend endpoint is wired.
 *
 * The service ONLY consumes the `TimeAnalyticsSnapshot` view shape.
 * All mapping from your entities to that shape happens server-side
 * (recommended) — see `docs/INTEGRATION.md` for endpoint specs.
 *
 * If you want to compute the snapshot client-side, write a custom
 * service that implements `TimeAnalyticsService` and call your own
 * mappers. The view components never call this service directly.
 */

import type { TimeAnalyticsSnapshot, TimeAnalyticsFilters } from "../types";
import { generateMockSnapshot, MOCK_AVAILABLE } from "../data/mockData";

// ============================================================
//        Public service surface
// ============================================================

export interface TimeAnalyticsService {
  fetch(filters: TimeAnalyticsFilters): Promise<TimeAnalyticsSnapshot>;
}

// ============================================================
//        Real-backend implementation
// ============================================================

/**
 * Real backend service.
 *
 * Pass the existing `api` axios instance from your app so auth + baseURL
 * are inherited.
 *
 * Expected backend endpoint (add to your server when ready):
 *   GET /api/time-analytics/snapshot?from=&to=&customerId=&productId=&projectId=
 *
 * Response body: TimeAnalyticsSnapshot
 *
 * Until that endpoint exists, set `useMock: true` to skip the network
 * call entirely, or let the service auto-fall-back on failure
 * (when `mode === "auto"`).
 */
export class ApiTimeAnalyticsService implements TimeAnalyticsService {
  constructor(
    private api: { get: <T = unknown>(url: string, config?: unknown) => Promise<{ data: T }> },
    private options: { useMock?: boolean; endpoint?: string; strict?: boolean } = {},
  ) {}

  async fetch(filters: TimeAnalyticsFilters): Promise<TimeAnalyticsSnapshot> {
    if (this.options.useMock || !MOCK_AVAILABLE) {
      return generateMockSnapshot(filters);
    }
    const url = this.options.endpoint ?? "/time-analytics/snapshot";
    try {
      const res = await this.api.get<TimeAnalyticsSnapshot>(url, { params: filters });
      return res.data;
    } catch (err) {
      if (this.options.strict) {
        throw err instanceof Error ? err : new Error("Time analytics snapshot request failed");
      }
      console.warn(
        "[timeAnalytics] backend snapshot endpoint unavailable, falling back to mock",
        err,
      );
      return generateMockSnapshot(filters);
    }
  }
}

/**
 * Pure mock service — useful for tests or when the host app
 * doesn't provide an axios instance.
 */
export class MockTimeAnalyticsService implements TimeAnalyticsService {
  async fetch(filters: TimeAnalyticsFilters): Promise<TimeAnalyticsSnapshot> {
    return generateMockSnapshot(filters);
  }
}
