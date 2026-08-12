/**
 * useTimeAnalyticsData — single hook the views consume.
 *
 * Owns filter state, finance assumptions, and fetch lifecycle against the live API.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AxiosInstance } from "axios";
import { ApiTimeAnalyticsService } from "../services/timeAnalyticsService";
import type { TimeAnalyticsSnapshot, TimeAnalyticsFilters } from "../types";
import {
  type FinanceSettings,
  loadFinanceSettings,
  saveFinanceSettings,
  financeSettingsKey,
  DEFAULT_FINANCE_SETTINGS,
} from "../utils/financeSettings";
import { isoDaysAgo, isoToday } from "../utils/datePresets";

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
  financeSettings: FinanceSettings;
  setFinanceSettings: (next: FinanceSettings) => void;
  refresh: () => void;
}

const DEFAULT_FILTERS: TimeAnalyticsFilters = {
  from: isoDaysAgo(29),
  to: isoToday(),
  customerId: "",
  productId: "",
  projectId: "",
};

function filtersKey(filters: TimeAnalyticsFilters, finance: FinanceSettings): string {
  return JSON.stringify(filters) + "|" + financeSettingsKey(finance);
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
  const [financeSettings, setFinanceSettingsState] = useState<FinanceSettings>(() => loadFinanceSettings());
  const [data, setData] = useState<TimeAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const setFinanceSettings = useCallback((next: FinanceSettings) => {
    const normalized: FinanceSettings = {
      hourlyRate: next.hourlyRate > 0 ? next.hourlyRate : DEFAULT_FINANCE_SETTINGS.hourlyRate,
      revenueMultiplier: next.revenueMultiplier > 0 ? next.revenueMultiplier : DEFAULT_FINANCE_SETTINGS.revenueMultiplier,
      quotedRatio: next.quotedRatio > 0 && next.quotedRatio <= 1
        ? next.quotedRatio
        : DEFAULT_FINANCE_SETTINGS.quotedRatio,
    };
    saveFinanceSettings(normalized);
    setFinanceSettingsState(normalized);
  }, []);

  const fetchOnce = useCallback(async () => {
    const myToken = ++tokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const svc = new ApiTimeAnalyticsService(api, { endpoint });
      const snap = await svc.fetch(filters, financeSettings);
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
  }, [api, filters, financeSettings, endpoint]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchOnce();
    }, filterDebounceMs);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [fetchOnce, filterDebounceMs, filtersKey(filters, financeSettings)]);

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
    financeSettings,
    setFinanceSettings,
    refresh: fetchOnce,
  };
}
