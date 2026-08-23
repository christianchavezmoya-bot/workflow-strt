/** Ordered bootstrap phases — used for overall (not per-phase) download progress. */
export const BOOTSTRAP_PHASE_ORDER = [
  "reference",
  "projects",
  "assets",
  "configs",
  "linked-configs",
  "workflows",
  "issues",
  "asset-documents",
  "document-files",
  "media",
] as const;

export type BootstrapPhase = (typeof BOOTSTRAP_PHASE_ORDER)[number];

export const BOOTSTRAP_PHASE_LABELS: Record<string, string> = {
  reference: "Reference data",
  projects: "Projects",
  assets: "Assets",
  configs: "Product configs",
  "linked-configs": "Workflow configs",
  workflows: "Assignments & runs",
  issues: "Open & closed issues",
  "asset-documents": "Asset document links",
  "document-files": "Linked document files",
  media: "Reference photos",
};

/**
 * Overall download progress across all bootstrap phases.
 * Caps at 99 until bootstrap:complete — avoids misleading "100%" mid-download.
 */
export function bootstrapOverallPercent(phase: string, done: number, total: number): number {
  const idx = BOOTSTRAP_PHASE_ORDER.indexOf(phase as BootstrapPhase);
  const stepIndex = idx >= 0 ? idx : 0;
  const stepCount = BOOTSTRAP_PHASE_ORDER.length;
  const phaseFraction = done / Math.max(total, 1);
  const overall = (stepIndex + phaseFraction) / stepCount;
  return Math.min(99, Math.max(0, Math.round(overall * 100)));
}

export function bootstrapStepLabel(phase: string, done: number, total: number): string {
  const label = BOOTSTRAP_PHASE_LABELS[phase] ?? phase;
  const stepIndex = BOOTSTRAP_PHASE_ORDER.indexOf(phase as BootstrapPhase);
  const stepNum = stepIndex >= 0 ? stepIndex + 1 : null;
  const stepCount = BOOTSTRAP_PHASE_ORDER.length;
  if (stepNum != null) {
    return `${label} · step ${stepNum}/${stepCount} (${done}/${total})`;
  }
  return `${label} · ${done}/${total}`;
}
