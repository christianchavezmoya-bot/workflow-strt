/**
 * useTimeAnalyticsData — single hook the views consume.
 *
 * Owns filter state and fetch lifecycle against the live API.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AxiosInstance } from "axios";
import { ApiTimeAnalyticsService } from "../services/timeAnalyticsService";
import type {
  TimeAnalyticsSnapshot,
  TimeAnalyticsFilters,
} from "../types";

export interface UseTimeAnalyticsDataOptions {
  /** axios instance from the host app */
  api: AxiosInstance;
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
  opts: UseTimeAnalyticsDataOptions,
): UseTimeAnalyticsDataResult {
  const {
    api,
    refreshIntervalMs = 0,
    endpoint,
    filterDebounceMs = 400,
  } = opts;

  const [filters, setFilters] = useState<TimeAnalyticsFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<TimeAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const fetchOnce = useCallback(async () => {
    const myToken = ++tokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const svc = new ApiTimeAnalyticsService(api, { endpoint });
      const snap = await svc.fetch(filters);
      if (myToken !== tokenRef.current) return;
      setData(snap);
    } catch (e) {
      if (myToken !== tokenRef.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load time analytics";
      setError(msg);
      setData(null);
    } finally {
      if (myToken === tokenRef.current) setLoading(false);
    }
  }, [api, filters, endpoint]);

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
  };
}
