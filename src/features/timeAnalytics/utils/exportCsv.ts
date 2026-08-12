import type { TimeAnalyticsSnapshot } from "../types";

function escapeCsv(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const body = rows.map(r => r.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSnapshotCsv(data: TimeAnalyticsSnapshot, viewId: string): void {
  const stamp = data.range.from.replace(/-/g, "") + "-" + data.range.to.replace(/-/g, "");
  const filename = `time-analytics-${viewId}-${stamp}.csv`;

  switch (viewId) {
    case "installers":
      downloadCsv(filename, [
        ["Name", "Team", "Region", "Productive h", "Downtime h", "Productivity %", "Avg min", "Completions", "Defects"],
        ...data.installers.map(i => [
          i.name, i.team, i.region,
          i.productiveHours, i.downtimeHours, i.productivityPct,
          i.avgInstallMinutes, i.completions, i.defects,
        ]),
      ]);
      break;
    case "projects":
      downloadCsv(filename, [
        ["Project", "Customer", "Status", "Done", "Total", "Productive h", "Downtime h"],
        ...data.projects.map(p => [
          p.name, p.customerName, p.status, p.doneAssets, p.totalAssets,
          p.productiveHours, p.downtimeHours,
        ]),
      ]);
      break;
    case "finance":
      downloadCsv(filename, [
        ["Metric", "Value"],
        ["Revenue", data.finance.revenue],
        ["Labour cost", data.finance.labourCost],
        ["Margin %", data.finance.marginPct],
        ["Billable %", data.finance.billablePct],
        ["Hourly rate", data.finance.params.hourlyRate],
        ["Revenue multiplier", data.finance.params.revenueMultiplier],
        ["Quoted ratio", data.finance.params.quotedRatio],
        [],
        ["Installer", "Cost"],
        ...data.finance.byInstaller.map(i => [i.name, i.cost]),
      ]);
      break;
    default:
      downloadCsv(filename, [
        ["Generated", data.generatedAt],
        ["Range", data.range.from, data.range.to],
        ["Active installers", data.kpis.activeInstallers],
        ["Productive hours", data.kpis.productiveHours],
        ["Downtime hours", data.kpis.downtimeHours],
        ["Productivity %", data.kpis.productivityPct],
      ]);
  }
}
