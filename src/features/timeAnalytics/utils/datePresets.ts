export type DatePresetId = "1d" | "7d" | "30d" | "90d" | "custom";

export interface DatePreset {
  id: DatePresetId;
  label: string;
  days?: number;
}

export const DATE_PRESETS: DatePreset[] = [
  { id: "1d", label: "1 day", days: 0 },
  { id: "7d", label: "1 week", days: 6 },
  { id: "30d", label: "1 month", days: 29 },
  { id: "90d", label: "Quarter", days: 89 },
];

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function rangeForPreset(preset: DatePreset): { from: string; to: string } {
  const to = isoToday();
  const from = isoDaysAgo(preset.days ?? 29);
  return { from, to };
}

export function detectPreset(from?: string, to?: string): DatePresetId {
  if (!from || !to) return "custom";
  for (const preset of DATE_PRESETS) {
    const r = rangeForPreset(preset);
    if (r.from === from && r.to === to) return preset.id;
  }
  return "custom";
}

export function formatRangeLabel(from: string, to: string): string {
  if (from === to) return from;
  return `${from} → ${to}`;
}
