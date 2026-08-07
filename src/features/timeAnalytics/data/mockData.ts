/**
 * Mock data — used as fallback when the real backend is unavailable.
 * Deterministic (seeded) so screenshots and tests are reproducible.
 */

import type {
  TimeAnalyticsSnapshot,
  TimeAnalyticsFilters,
  InstallerRow,
  ProjectRow,
  AssetTypeRow,
  ProductRow,
  CustomerRow,
  DowntimeReason,
  FinanceRollup,
  ForecastRow,
  BenchmarkRow,
  ActivityEvent,
  InstallerTimelineEntry,
  HeatmapCell,
  QualitySpeedPoint,
  KpiSnapshot,
} from "../types";

export const MOCK_AVAILABLE = true;

const AVATAR_PAL = [
  "#2dd4bf", "#ff9f45", "#3aa1ff", "#a78bfa",
  "#34d399", "#fbbf24", "#f472b6", "#22d3ee",
  "#fb923c", "#60a5fa",
];

const INSTALLERS: InstallerRow[] = [
  ["Marcus Chen", "Lead Tech", "Alpha", "NSW"],
  ["Priya Raman", "Senior Tech", "Bravo", "VIC"],
  ["Diego Alvarez", "Tech II", "Alpha", "QLD"],
  ["Yuki Tanaka", "Senior Tech", "Charlie", "NSW"],
  ["Amara Okafor", "Lead Tech", "Delta", "WA"],
  ["Liam O'Connor", "Tech II", "Bravo", "VIC"],
  ["Sofia Marchetti", "Tech III", "Charlie", "SA"],
  ["Hassan Mansour", "Senior Tech", "Alpha", "NSW"],
  ["Nora Eriksen", "Tech II", "Delta", "NZ"],
  ["Tomás Rivera", "Lead Tech", "Bravo", "QLD"],
  ["Aiko Yamada", "Tech II", "Charlie", "VIC"],
  ["Ezra Klein", "Senior Tech", "Delta", "WA"],
].map(([name, role, team, region], i) => {
  const productive = 140 + (i % 5) * 12 + (i * 7) % 10;
  const downtime = 8 + (i % 3) * 4 + (i * 3) % 6;
  const productivity = (productive / (productive + downtime)) * 100;
  return {
    id: `i${i + 1}`,
    name,
    role,
    team,
    region,
    color: AVATAR_PAL[i % AVATAR_PAL.length],
    initials: name.split(" ").map(p => p[0]).slice(0, 2).join(""),
    productiveHours: +productive.toFixed(1),
    downtimeHours: +downtime.toFixed(1),
    productivityPct: +productivity.toFixed(1),
    avgInstallMinutes: 110 + (i * 7) % 50,
    completions: 18 + (i * 3) % 10,
    defects: i % 4,
  };
});

const PROJECTS: ProjectRow[] = [
  { id: "p1", name: "Aurora Substation 12",   customerId: "c1", customerName: "Aurora Energy",      status: "On Track", health: "good", due: "2025-09-12", totalAssets: 240, doneAssets: 192, productiveHours: 1180, downtimeHours: 142 },
  { id: "p2", name: "Northwind Tower Rollout", customerId: "c2", customerName: "Northwind Telecom",  status: "At Risk",  health: "warn", due: "2025-08-30", totalAssets: 180, doneAssets: 96,  productiveHours: 720,  downtimeHours: 198 },
  { id: "p3", name: "Helix Rail Signalling",  customerId: "c3", customerName: "Helix Rail",         status: "On Track", health: "good", due: "2025-10-22", totalAssets: 320, doneAssets: 210, productiveHours: 1490, downtimeHours: 175 },
  { id: "p4", name: "Meridian Smart Meters",  customerId: "c4", customerName: "Meridian Water",     status: "Behind",   health: "bad",  due: "2025-09-05", totalAssets: 460, doneAssets: 188, productiveHours: 1320, downtimeHours: 312 },
  { id: "p5", name: "Vortex Pit Telemetry",   customerId: "c5", customerName: "Vortex Mining",      status: "On Track", health: "good", due: "2025-11-18", totalAssets: 96,  doneAssets: 78,  productiveHours: 612,  downtimeHours: 71 },
  { id: "p6", name: "Citadel Perimeter",      customerId: "c6", customerName: "Citadel Defence",    status: "On Track", health: "good", due: "2025-12-04", totalAssets: 210, doneAssets: 144, productiveHours: 980,  downtimeHours: 124 },
  { id: "p7", name: "Lumen Hospital Network", customerId: "c7", customerName: "Lumen Health",       status: "At Risk",  health: "warn", due: "2025-09-28", totalAssets: 150, doneAssets: 64,  productiveHours: 480,  downtimeHours: 132 },
  { id: "p8", name: "Aurora Coastal Rollout", customerId: "c1", customerName: "Aurora Energy",      status: "On Track", health: "good", due: "2025-12-22", totalAssets: 280, doneAssets: 168, productiveHours: 1140, downtimeHours: 154 },
];

const ASSETS: AssetTypeRow[] = [
  { type: "Substation Gateway",   model: "AcuLink X-700",   avgMinutes: 158, minMinutes: 122, maxMinutes: 198, std: 8.4,  installs: 24, difficulty: 11.6 },
  { type: "Distribution Hub",     model: "AcuLink X-500",   avgMinutes: 142, minMinutes: 110, maxMinutes: 180, std: 7.1,  installs: 19, difficulty: 8.4 },
  { type: "Field Sensor Array",   model: "PulseNode R2",    avgMinutes: 118, minMinutes: 92,  maxMinutes: 158, std: 9.6,  installs: 35, difficulty: 3.6 },
  { type: "Smart Sensor Pro",     model: "PulseNode R3",    avgMinutes: 128, minMinutes: 96,  maxMinutes: 172, std: 10.4, installs: 28, difficulty: 5.6 },
  { type: "Perimeter Cam 4K",     model: "Sentinel Cam 4K", avgMinutes: 198, minMinutes: 152, maxMinutes: 252, std: 12.7, installs: 22, difficulty: 19.6 },
  { type: "Flow Meter",           model: "TrioMeter S",     avgMinutes: 95,  minMinutes: 72,  maxMinutes: 122, std: 5.2,  installs: 41, difficulty: -1.0 },
  { type: "Industrial Meter",     model: "TrioMeter X",     avgMinutes: 108, minMinutes: 84,  maxMinutes: 138, std: 6.0,  installs: 32, difficulty: 1.6 },
  { type: "Edge Router",          model: "EdgeRouter Pro",  avgMinutes: 135, minMinutes: 102, maxMinutes: 168, std: 7.8,  installs: 18, difficulty: 7.0 },
];

const PRODUCTS: ProductRow[] = [
  { id: "pr1", name: "AcuLink X-700",    family: "Gateway",     firmware: "v4.2.1", avgMinutes: 158, installs: 84, trend90d: -2.1, defectRatePct: 1.2 },
  { id: "pr2", name: "AcuLink X-500",    family: "Gateway",     firmware: "v4.2.1", avgMinutes: 142, installs: 76, trend90d:  0.4, defectRatePct: 1.5 },
  { id: "pr3", name: "PulseNode R2",     family: "Sensor",      firmware: "v1.8.0", avgMinutes: 118, installs: 152, trend90d: -4.2, defectRatePct: 0.8 },
  { id: "pr4", name: "PulseNode R3",     family: "Sensor",      firmware: "v2.0.3", avgMinutes: 128, installs: 142, trend90d:  8.6, defectRatePct: 2.3 },
  { id: "pr5", name: "Sentinel Cam 4K",  family: "Camera",      firmware: "v3.1.0", avgMinutes: 198, installs: 64,  trend90d:  3.1, defectRatePct: 1.8 },
  { id: "pr6", name: "TrioMeter S",      family: "Metering",    firmware: "v2.4.7", avgMinutes: 95,  installs: 168, trend90d: -1.4, defectRatePct: 0.4 },
  { id: "pr7", name: "TrioMeter X",      family: "Metering",    firmware: "v2.4.7", avgMinutes: 108, installs: 124, trend90d: -3.8, defectRatePct: 0.6 },
  { id: "pr8", name: "EdgeRouter Pro",   family: "Networking",  firmware: "v6.1.0", avgMinutes: 135, installs: 58,  trend90d:  1.2, defectRatePct: 1.0 },
];

const CUSTOMERS: CustomerRow[] = [
  { id: "c1", name: "Aurora Energy",     industry: "Utilities",   country: "AU", projectCount: 2, totalAssets: 520, doneAssets: 360, productiveHours: 2320, downtimeHours: 296, productivityPct: 88.7, avgInstallMinutes: 387 },
  { id: "c2", name: "Northwind Telecom", industry: "Telecom",     country: "NZ", projectCount: 1, totalAssets: 180, doneAssets: 96,  productiveHours: 720,  downtimeHours: 198, productivityPct: 78.4, avgInstallMinutes: 450 },
  { id: "c3", name: "Helix Rail",        industry: "Transport",   country: "AU", projectCount: 1, totalAssets: 320, doneAssets: 210, productiveHours: 1490, downtimeHours: 175, productivityPct: 89.5, avgInstallMinutes: 426 },
  { id: "c4", name: "Meridian Water",    industry: "Utilities",   country: "AU", projectCount: 1, totalAssets: 460, doneAssets: 188, productiveHours: 1320, downtimeHours: 312, productivityPct: 80.9, avgInstallMinutes: 421 },
  { id: "c5", name: "Vortex Mining",     industry: "Resources",   country: "AU", projectCount: 1, totalAssets: 96,  doneAssets: 78,  productiveHours: 612,  downtimeHours: 71,  productivityPct: 89.6, avgInstallMinutes: 471 },
  { id: "c6", name: "Citadel Defence",   industry: "Government",  country: "NZ", projectCount: 1, totalAssets: 210, doneAssets: 144, productiveHours: 980,  downtimeHours: 124, productivityPct: 88.8, avgInstallMinutes: 408 },
  { id: "c7", name: "Lumen Health",      industry: "Healthcare",  country: "AU", projectCount: 1, totalAssets: 150, doneAssets: 64,  productiveHours: 480,  downtimeHours: 132, productivityPct: 78.4, avgInstallMinutes: 450 },
];

const DOWNTIME_REASONS: DowntimeReason[] = [
  { reason: "Permit / site access",    occurrences: 48, avgMinutes: 142, totalMinutes: 6820 },
  { reason: "Material shortage",       occurrences: 36, avgMinutes: 96,  totalMinutes: 3450 },
  { reason: "Equipment failure",       occurrences: 24, avgMinutes: 88,  totalMinutes: 2110 },
  { reason: "Weather hold",            occurrences: 22, avgMinutes: 175, totalMinutes: 3850 },
  { reason: "Customer site not ready", occurrences: 19, avgMinutes: 124, totalMinutes: 2360 },
  { reason: "Rework / defect",         occurrences: 14, avgMinutes: 64,  totalMinutes: 900  },
  { reason: "Travel / logistics",      occurrences: 12, avgMinutes: 55,  totalMinutes: 660  },
  { reason: "Safety stand-down",       occurrences: 6,  avgMinutes: 210, totalMinutes: 1260 },
];

const DOWNTIME_TREND = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"].map((m, i) => ({
  month: m,
  productive: 1080 + Math.cos(i / 1.4) * 60 + (i * 9) % 30,
  downtime:   120 + Math.sin(i / 1.7) * 30 + (i * 13) % 20,
}));

const FINANCE: FinanceRollup = {
  revenue: 1_842_500,
  labourCost: 612_340,
  marginPct: 66.8,
  billablePct: 82.4,
  byInstaller: INSTALLERS.slice(0, 8).map((i, idx) => ({ id: i.id, name: i.name, cost: 32000 + (idx * 2400) + (idx * 11 * 7) })),
  byProject: PROJECTS.map((p, idx) => ({
    id: p.id,
    name: p.name,
    quoted: 120000 + ((idx * 41_000) % 220_000),
    actual: 100000 + ((idx * 53_000) % 260_000),
  })),
};

const FORECAST: ForecastRow = {
  remainingHours: 4_210,
  estimatedCompletion: "2025-12-19",
  riskLevel: "medium",
  crewsNeeded: 14,
  confidencePct: 88,
  completion: [
    { week: "W1", low: 8,  mid: 12, high: 18 },
    { week: "W2", low: 22, mid: 30, high: 42 },
    { week: "W3", low: 38, mid: 52, high: 72 },
    { week: "W4", low: 56, mid: 74, high: 104 },
    { week: "W5", low: 72, mid: 92, high: 130 },
    { week: "W6", low: 86, mid: 108, high: 150 },
    { week: "W7", low: 96, mid: 118, high: 162 },
    { week: "W8", low: 102, mid: 124, high: 168 },
  ],
  history: [
    { period: "Q1", predicted: 120, actual: 118 },
    { period: "Q2", predicted: 132, actual: 128 },
    { period: "Q3", predicted: 140, actual: 144 },
    { period: "Q4", predicted: 138, actual: 132 },
    { period: "Q1", predicted: 150, actual: 156 },
    { period: "Q2", predicted: 162, actual: 158 },
  ],
};

const BENCHMARKS: BenchmarkRow[] = ASSETS.slice(0, 8).map(a => ({
  name: a.type,
  expectedMinutes: Math.round(a.avgMinutes * 0.95),
  actualMinutes: a.avgMinutes,
  confidencePct: 90 - Math.round(a.std),
}));

const ACTIVITY: ActivityEvent[] = [
  { type: "good", text: "<b>Marcus Chen</b> completed <b>Substation Gateway #214</b> in 1h 48m", timestamp: new Date(Date.now() - 2 * 60_000).toISOString() },
  { type: "good", text: "<b>Amara Okafor</b> started <b>Perimeter Cam 4K</b> at Vortex Pit 7", timestamp: new Date(Date.now() - 6 * 60_000).toISOString() },
  { type: "warn", text: "<b>Northwind Tower Rollout</b> flagged at risk — 2 crews behind", timestamp: new Date(Date.now() - 12 * 60_000).toISOString() },
  { type: "bad",  text: "<b>PulseNode R3</b> firmware v2.0.3 caused 3 reworks on Aurora Substation 12", timestamp: new Date(Date.now() - 24 * 60_000).toISOString() },
  { type: "good", text: "<b>Priya Raman</b> reached 92% productivity this week — new personal best", timestamp: new Date(Date.now() - 38 * 60_000).toISOString() },
  { type: "good", text: "<b>Helix Rail Signalling</b> passed 65% completion milestone", timestamp: new Date(Date.now() - 60 * 60_000).toISOString() },
  { type: "warn", text: "Weather hold affecting 3 sites across NSW team Alpha", timestamp: new Date(Date.now() - 65 * 60_000).toISOString() },
  { type: "good", text: "Benchmark engine updated 14 expected-time models", timestamp: new Date(Date.now() - 2 * 3600_000).toISOString() },
];

const HEATMAP: HeatmapCell[] = (() => {
  const out: HeatmapCell[] = [];
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  for (const day of days) for (let h = 0; h < 24; h++) {
    let intensity = 0;
    if (h >= 7 && h <= 17) {
      intensity = 0.5 + 0.45 * Math.sin((h - 7) / 4) - (h === 12 ? 0.25 : 0);
    } else {
      intensity = ((day.length + h) * 17) % 100 / 1000;
    }
    out.push({ day, hour: h, intensity: Math.max(0, Math.min(1, intensity)) });
  }
  return out;
})();

const TIMELINE: InstallerTimelineEntry[] = INSTALLERS.slice(0, 6).map((i, idx) => {
  const segments: InstallerTimelineEntry["segments"] = [];
  let cursor = 7 + ((idx * 11) % 60) / 60;
  for (let s = 0; s < 4; s++) {
    const dur = 1.2 + ((idx + s) * 7) % 18 / 10;
    segments.push({ startHour: cursor, endHour: cursor + dur, kind: "prod", label: "Install" });
    cursor += dur + 0.3;
    if (cursor > 12 && cursor < 12.5) cursor = 12.5;
  }
  segments.push({ startHour: 12, endHour: 12.5, kind: "break", label: "Lunch" });
  return {
    installerId: i.id,
    installerName: i.name,
    initials: i.initials,
    color: i.color,
    team: i.team,
    segments,
  };
});

const QUALITY_SPEED: QualitySpeedPoint[] = INSTALLERS.map(i => ({
  installerId: i.id,
  name: i.name,
  color: i.color,
  avgMinutes: i.avgInstallMinutes,
  defects: i.defects,
}));

const PRODUCT_TREND = (() => {
  const months = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
  return months.map((month, i) => ({
    month,
    series: {
      "AcuLink X-700":   135 + Math.sin(i / 1.3) * 10 + (i * 7) % 8,
      "PulseNode R3":    105 + Math.cos(i / 1.5) * 8 + (i > 6 ? 12 : 0) + (i * 5) % 6,
      "Sentinel Cam 4K": 180 + Math.sin(i / 2.0) * 15 + (i * 3) % 8,
      "TrioMeter X":     95  + Math.cos(i / 1.7) * 6 + (i * 11) % 5,
    },
  }));
})();

const BURNDOWN = (() => {
  const total = 240;
  let remaining = total;
  const out: { week: string; ideal: number; actual: number }[] = [];
  for (let w = 0; w <= 24; w++) {
    const ideal = total - (total / 24) * w;
    remaining = Math.max(0, remaining - (Math.random() * 14 + 6));
    out.push({ week: `W${w + 1}`, ideal: +ideal.toFixed(0), actual: +remaining.toFixed(0) });
  }
  return out;
})();

const KPIS: KpiSnapshot = (() => {
  const productive = INSTALLERS.reduce((a, b) => a + b.productiveHours, 0);
  const downtime = INSTALLERS.reduce((a, b) => a + b.downtimeHours, 0);
  const fastest = [...INSTALLERS].sort((a, b) => a.avgInstallMinutes - b.avgInstallMinutes)[0];
  return {
    activeInstallers: INSTALLERS.length,
    completedToday: 34,
    productiveHours: +productive.toFixed(1),
    downtimeHours: +downtime.toFixed(1),
    productivityPct: +((productive / (productive + downtime)) * 100).toFixed(1),
    avgInstallMinutes: 142,
    fastestInstallerName: fastest.name,
    projectsActive: PROJECTS.filter(p => p.status !== "Completed").length,
    assetsRemaining: PROJECTS.reduce((a, p) => a + (p.totalAssets - p.doneAssets), 0),
    revenue: FINANCE.revenue,
    labourCost: FINANCE.labourCost,
  };
})();

export function generateMockSnapshot(filters: TimeAnalyticsFilters): TimeAnalyticsSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    range: { from: filters.from ?? "", to: filters.to ?? "" },
    filters,
    kpis: KPIS,
    installers: INSTALLERS,
    projects: PROJECTS,
    assets: ASSETS,
    products: PRODUCTS,
    customers: CUSTOMERS,
    downtime: { reasons: DOWNTIME_REASONS, trendMonthly: DOWNTIME_TREND },
    finance: FINANCE,
    forecast: FORECAST,
    benchmarks: BENCHMARKS,
    activity: ACTIVITY,
    installerTimeline: TIMELINE,
    heatmap: HEATMAP,
    qualitySpeed: QUALITY_SPEED,
    productTrend: PRODUCT_TREND,
    burndown: BURNDOWN,
  };
}
