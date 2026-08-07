/**
 * useTimeAnalyticsData — single hook the views consume.
 *
 * Owns filter state, fetch lifecycle, and service selection (api vs mock).
 * Views never call the service directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiTimeAnalyticsService,
  MockTimeAnalyticsService,
  type TimeAnalyticsService,
} from "../services/timeAnalyticsService";
import { generateMockSnapshot } from "../data/mockData";
import type {
  TimeAnalyticsSnapshot,
  TimeAnalyticsFilters,
} from "../types";

export type FetchMode = "api" | "mock" | "auto";

export interface UseTimeAnalyticsDataOptions {
  /** axios instance from the host app — optional; mock-only when omitted. */
  api?: unknown;
  /** "auto" tries the api and falls back on failure (default). */
  mode?: FetchMode;
  /** Refresh interval in ms. 0 disables polling (default). */
  refreshIntervalMs?: number;
  /** Backend path relative to api baseURL. Default: "/time-analytics/snapshot". */
  endpoint?: string;
  /** Debounce filter-driven refetches (ms). Default 400. */
  filterDebounceMs?: number;
}

export interface UseTimeAnalyticsDataResult {
  data: TimeAnalyticsSnapshot | null;
  loading: boolean;
  error: string | null;
  filters: TimeAnalyticsFilters;
  setFilters: (next: TimeAnalyticsFilters) => void;
  refresh: () => void;
  setMode: (m: FetchMode) => void;
  mode: FetchMode;
  isMock: boolean;
}

const DEFAULT_FILTERS: TimeAnalyticsFilters = {
  from: isoDaysAgo(30),
  to: isoToday(),
  customerId: "",
  productId: "",
  projectId: "",
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function filtersKey(filters: TimeAnalyticsFilters): string {
  return JSON.stringify(filters);
}

export function useTimeAnalyticsData(
  opts: UseTimeAnalyticsDataOptions = {},
): UseTimeAnalyticsDataResult {
  const {
    api,
    mode: initialMode = "api",
    refreshIntervalMs = 0,
    endpoint,
    filterDebounceMs = 400,
  } = opts;

  const [mode, setMode] = useState<FetchMode>(initialMode);
  const [filters, setFilters] = useState<TimeAnalyticsFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<TimeAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState<boolean>(initialMode === "mock" || !api);
  const tokenRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const buildService = useCallback((): TimeAnalyticsService => {
    if (mode === "mock" || !api) {
      return new MockTimeAnalyticsService();
    }
    return new ApiTimeAnalyticsService(api as never, {
      endpoint,
      strict: mode === "api",
    });
  }, [api, mode, endpoint]);

  const fetchOnce = useCallback(async () => {
    const myToken = ++tokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const svc = buildService();
      const snap = await svc.fetch(filters);
      if (myToken !== tokenRef.current) return;
      setData(snap);
      setIsMock(svc instanceof MockTimeAnalyticsService);
    } catch (e) {
      if (myToken !== tokenRef.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load time analytics";
      if (mode === "auto") {
        setData(generateMockSnapshot(filters));
        setIsMock(true);
        setError(null);
      } else {
        setError(msg);
        setData(null);
        setIsMock(mode === "mock" || !api);
      }
    } finally {
      if (myToken === tokenRef.current) setLoading(false);
    }
  }, [buildService, filters, mode, api]);

  // Debounce filter changes so date pickers don't stampede the API.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchOnce();
    }, filterDebounceMs);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [fetchOnce, filterDebounceMs, filtersKey(filters)]);

  useEffect(() => {
    if (!refreshIntervalMs || refreshIntervalMs < 1000) return;
    const id = window.setInterval(() => void fetchOnce(), refreshIntervalMs);
    return () => window.clearInterval(id);
  }, [fetchOnce, refreshIntervalMs]);

  return {
    data,
    loading,
    error,
    filters,
    setFilters,
    refresh: fetchOnce,
    setMode,
    mode,
    isMock,
  };
}
