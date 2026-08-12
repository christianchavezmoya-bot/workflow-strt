/** User-configurable finance assumptions for Time Analytics (local to this feature). */

export interface FinanceSettings {
  hourlyRate: number;
  revenueMultiplier: number;
  quotedRatio: number;
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  hourlyRate: 85,
  revenueMultiplier: 1.35,
  quotedRatio: 0.92,
};

const STORAGE_KEY = "time-analytics-finance-settings";

export function loadFinanceSettings(): FinanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FINANCE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<FinanceSettings>;
    return {
      hourlyRate: positive(parsed.hourlyRate, DEFAULT_FINANCE_SETTINGS.hourlyRate),
      revenueMultiplier: positive(parsed.revenueMultiplier, DEFAULT_FINANCE_SETTINGS.revenueMultiplier),
      quotedRatio: clampRatio(parsed.quotedRatio, DEFAULT_FINANCE_SETTINGS.quotedRatio),
    };
  } catch {
    return { ...DEFAULT_FINANCE_SETTINGS };
  }
}

export function saveFinanceSettings(settings: FinanceSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && value > 0 ? value : fallback;
}

function clampRatio(value: unknown, fallback: number): number {
  if (typeof value !== "number" || value <= 0 || value > 1) return fallback;
  return value;
}

export function financeSettingsKey(settings: FinanceSettings): string {
  return `${settings.hourlyRate}|${settings.revenueMultiplier}|${settings.quotedRatio}`;
}
