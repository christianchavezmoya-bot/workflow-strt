/**
 * Time Analytics — view-shape types
 *
 * The dashboard consumes this shape regardless of the data source.
 * The service layer (services/timeAnalyticsService.ts) is the only place
 * that knows how to build these from your actual backend entities.
 */

// ============================================================
//                       View model
// ============================================================

export interface InstallerRow {
  id: string;
  name: string;
  role: string;
  team: string;
  region: string;
  color: string;
  initials: string;
  // 30-day rollup
  productiveHours: number;
  downtimeHours: number;
  productivityPct: number;
  avgInstallMinutes: number;
  completions: number;
  defects: number;
}

export interface ProjectRow {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  status: "On Track" | "At Risk" | "Behind" | "Completed" | "On Hold";
  health: "good" | "warn" | "bad";
  due: string;
  totalAssets: number;
  doneAssets: number;
  productiveHours: number;
  downtimeHours: number;
}

export interface AssetTypeRow {
  type: string;
  model: string;
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  std: number;
  installs: number;
  difficulty: number; // higher = harder
}

export interface ProductRow {
  id: string;
  name: string;
  family: string;
  firmware: string;
  avgMinutes: number;
  installs: number;
  trend90d: number; // % delta
  defectRatePct: number;
}

export interface CustomerRow {
  id: string;
  name: string;
  industry: string;
  country: string;
  projectCount: number;
  totalAssets: number;
  doneAssets: number;
  productiveHours: number;
  downtimeHours: number;
  productivityPct: number;
  avgInstallMinutes: number;
}

export interface DowntimeReason {
  reason: string;
  occurrences: number;
  avgMinutes: number;
  totalMinutes: number;
}

export interface FinanceRollup {
  revenue: number;
  labourCost: number;
  marginPct: number;
  billablePct: number;
  byInstaller: { id: string; name: string; cost: number }[];
  byProject: { id: string; name: string; quoted: number; actual: number }[];
}

export interface ForecastRow {
  remainingHours: number;
  estimatedCompletion: string;
  riskLevel: "low" | "medium" | "high";
  crewsNeeded: number;
  confidencePct: number;
  completion: { week: string; low: number; mid: number; high: number }[];
  history: { period: string; predicted: number; actual: number }[];
}

export interface BenchmarkRow {
  name: string;
  expectedMinutes: number;
  actualMinutes: number;
  confidencePct: number;
}

export interface ActivityEvent {
  type: "good" | "warn" | "bad";
  text: string;
  timestamp: string;
}

export interface InstallerTimelineEntry {
  installerId: string;
  installerName: string;
  initials: string;
  color: string;
  team: string;
  segments: TimelineSegment[];
}

export interface TimelineSegment {
  startHour: number; // 0..24
  endHour: number;
  kind: "prod" | "down" | "travel" | "break";
  label: string;
}

export interface HeatmapCell {
  day: string;       // "Mon", "Tue", ...
  hour: number;      // 0..23
  intensity: number; // 0..1
}

export interface QualitySpeedPoint {
  installerId: string;
  name: string;
  color: string;
  avgMinutes: number;
  defects: number;
}

// ============================================================
//                       Top-level payload
// ============================================================

export interface TimeAnalyticsFilters {
  from?: string;          // ISO date
  to?: string;            // ISO date
  customerId?: string;    // '' = all
  productId?: string;
  projectId?: string;
}

export interface TimeAnalyticsSnapshot {
  generatedAt: string;
  range: { from: string; to: string };
  filters: TimeAnalyticsFilters;

  kpis: KpiSnapshot;
  installers: InstallerRow[];
  projects: ProjectRow[];
  assets: AssetTypeRow[];
  products: ProductRow[];
  customers: CustomerRow[];
  downtime: {
    reasons: DowntimeReason[];
    trendMonthly: { month: string; productive: number; downtime: number }[];
  };
  finance: FinanceRollup;
  forecast: ForecastRow;
  benchmarks: BenchmarkRow[];
  activity: ActivityEvent[];
  installerTimeline: InstallerTimelineEntry[];
  heatmap: HeatmapCell[];
  qualitySpeed: QualitySpeedPoint[];
  productTrend: { month: string; series: Record<string, number> }[];
  burndown: { week: string; ideal: number; actual: number }[];
}

export interface KpiSnapshot {
  activeInstallers: number;
  completedToday: number;
  productiveHours: number;
  downtimeHours: number;
  productivityPct: number;
  avgInstallMinutes: number;
  fastestInstallerName: string;
  projectsActive: number;
  assetsRemaining: number;
  revenue: number;
  labourCost: number;
}
