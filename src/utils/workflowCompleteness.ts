import type { AssetWorkflowRun, StepResult } from "../types/assetWorkflowRun";
import type { CaptureField, StepInput, WorkflowStep } from "../types/workflow";

export type MissingWorkflowItemKind = "photo" | "video" | "input" | "capture";

/**
 * Only items the author marked Required ever appear here, for every kind including
 * photo/video. The gates differ by kind, not by strictness:
 *   - "input"/"capture": must be filled before the runner advances to the next step.
 *   - "photo"/"video": the runner warns but lets the step advance; they block Lock run
 *     and installer sign-off instead.
 */
export interface MissingWorkflowItem {
  id: string;
  label: string;
  kind: MissingWorkflowItemKind;
  required: boolean;
}

/**
 * Which missing items stop the runner leaving a step, and which only warn.
 * Required data has to be entered now; required media can be added later but blocks
 * Lock run and installer sign-off. Optional media never reaches here at all.
 */
export function splitMissingItemsByGate(items: MissingWorkflowItem[]): {
  blocking: MissingWorkflowItem[];
  warning: MissingWorkflowItem[];
} {
  return {
    blocking: items.filter((item) => item.kind === "input" || item.kind === "capture"),
    warning: items.filter((item) => item.kind === "photo" || item.kind === "video"),
  };
}

function hasTextValue(val: string | undefined): boolean {
  if (!val) return false;
  return val.trim().length > 0;
}

export function parseMediaCaptureCount(val: string | undefined): number {
  if (!val) return 0;
  if (val.startsWith("data:image/") || val.startsWith("data:video/")) return 1;
  // step-media uploads store photos as application/octet-stream data URLs
  if (val.startsWith("data:application/octet-stream") || val.startsWith("data:application/binary")) return 1;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item).length : 0;
  } catch {
    return 0;
  }
}

function hasInputValue(input: StepInput, val: string | undefined): boolean {
  if (!val) return false;
  if (input.type === "photo" || input.type === "video") return parseMediaCaptureCount(val) > 0;
  if (input.type === "component" && input.subFields?.length) {
    try {
      const parsed = JSON.parse(val) as Record<string, string>;
      return Object.values(parsed ?? {}).some((entry) => hasTextValue(entry));
    } catch {
      return false;
    }
  }
  return hasTextValue(val);
}

function hasCaptureFieldValue(field: CaptureField, val: string | undefined): boolean {
  if (!val) return false;
  return hasTextValue(val);
}

export function parseWorkflowStepsFromSnapshot(snapshotJson: string): WorkflowStep[] {
  try {
    const parsed = JSON.parse(snapshotJson) as { stepsJson?: string };
    if (!parsed?.stepsJson) return [];
    const stepsParsed = JSON.parse(parsed.stepsJson);
    if (Array.isArray(stepsParsed)) return stepsParsed as WorkflowStep[];
    if (stepsParsed?.steps && Array.isArray(stepsParsed.steps)) return stepsParsed.steps as WorkflowStep[];
  } catch {}
  return [];
}

export function parseWorkflowStepResults(json: string): StepResult[] {
  try {
    return (JSON.parse(json) as StepResult[]).filter((result) => result.stepId !== "__nav__");
  } catch {
    return [];
  }
}

function parseVisitedStepIds(stepResultsJson: string): Set<string> {
  try {
    const parsed = JSON.parse(stepResultsJson) as Array<{ stepId?: string; values?: Record<string, string> }>;
    const visited = new Set<string>();
    for (const entry of parsed) {
      if (!entry?.stepId) continue;
      if (entry.stepId !== "__nav__") {
        visited.add(entry.stepId);
        continue;
      }

      const currentStepId = entry.values?.currentStepId;
      if (currentStepId) visited.add(currentStepId);

      const rawHistory = entry.values?.historyJson;
      if (!rawHistory) continue;
      try {
        const history = JSON.parse(rawHistory) as string[];
        for (const stepId of history) {
          if (stepId) visited.add(stepId);
        }
      } catch {
        // Ignore malformed navigation history.
      }
    }
    return visited;
  } catch {
    return new Set<string>();
  }
}

function getMissingItemsForUncapturedStep(step: WorkflowStep | undefined): MissingWorkflowItem[] {
  if (!step) return [];

  const missingInputs: MissingWorkflowItem[] = [];
  for (const input of step.inputs ?? []) {
    if (input.type === "photo" || input.type === "video") {
      if (!input.required) continue;
      missingInputs.push({
        id: input.id,
        label: input.label || (input.type === "video" ? "Video" : "Photo"),
        kind: input.type,
        required: true,
      });
      continue;
    }

    if (!input.required) continue;
    missingInputs.push({
      id: input.id,
      label: input.label || input.id,
      kind: "input",
      required: true,
    });
  }

  const missingCaptureFields: MissingWorkflowItem[] = [];
  for (const field of step.captureFields ?? []) {
    if (!field.required) continue;
    missingCaptureFields.push({
      id: field.id,
      label: field.label || field.key || field.id,
      kind: "capture",
      required: true,
    });
  }

  return [...missingInputs, ...missingCaptureFields];
}

const IMPORT_ONLY_KEYS = new Set(["value", "unit", "pass", "label", "notes"]);

export function getMissingWorkflowItems(
  step: WorkflowStep | undefined,
  values: Record<string, string> | undefined,
): MissingWorkflowItem[] {
  if (!step) return [];

  // Externally-imported step results use generic keys, not workflow input IDs — no MISSING items apply.
  const inputDefs = step.inputs ?? [];
  if (values && inputDefs.length > 0) {
    const valueKeys = Object.keys(values);
    if (
      valueKeys.length > 0 &&
      valueKeys.every((k) => IMPORT_ONLY_KEYS.has(k)) &&
      !inputDefs.some((def) => def.id in values)
    ) {
      return [];
    }
  }

  const missingInputs: MissingWorkflowItem[] = [];
  for (const input of step.inputs ?? []) {
    const raw = values?.[input.id];
    if (input.type === "photo" || input.type === "video") {
      // Optional media is genuinely optional: it never counts as missing, so it cannot
      // hold up Lock run, sign-off, or the evidence badges.
      if (input.required && !hasInputValue(input, raw)) {
        missingInputs.push({
          id: input.id,
          label: input.label || (input.type === "video" ? "Video" : "Photo"),
          kind: input.type,
          required: true,
        });
      }
      continue;
    }

    if (input.required && !hasInputValue(input, raw)) {
      missingInputs.push({
        id: input.id,
        label: input.label || input.id,
        kind: "input",
        required: true,
      });
    }
  }

  const missingCaptureFields: MissingWorkflowItem[] = [];
  for (const field of step.captureFields ?? []) {
    const raw = values?.[field.id];
    if (field.required && !hasCaptureFieldValue(field, raw)) {
      missingCaptureFields.push({
        id: field.id,
        label: field.label || field.key || field.id,
        kind: "capture",
        required: true,
      });
    }
  }

  return [...missingInputs, ...missingCaptureFields];
}

export interface RunMissingMediaStep {
  stepId: string;
  stepOrder: number;
  stepTitle: string;
  inputId: string;
  inputLabel: string;
  inputType: "photo" | "video";
  captured: number;
}

/** Required photo/video slots on a run, with capture counts (optional media excluded). */
export function getRunRequiredMediaSteps(run: AssetWorkflowRun): RunMissingMediaStep[] {
  const steps = parseWorkflowStepsFromSnapshot(run.workflowSnapshotJson);
  const stepMap = new Map(steps.map((step) => [step.id, step]));
  const results = parseWorkflowStepResults(run.stepResultsJson);
  const visitedStepIds = parseVisitedStepIds(run.stepResultsJson);
  const resultStepIds = new Set(results.map((result) => result.stepId));
  const seen = new Set<string>();
  const refs: RunMissingMediaStep[] = [];

  const addFromStep = (stepId: string, values: Record<string, string> | undefined) => {
    const step = stepMap.get(stepId);
    if (!step) return;
    for (const input of step.inputs ?? []) {
      if (input.type !== "photo" && input.type !== "video") continue;
      if (!input.required) continue;
      const key = `${stepId}:${input.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({
        stepId,
        stepOrder: step.order ?? refs.length + 1,
        stepTitle: step.title ?? stepId,
        inputId: input.id,
        inputLabel: input.label || (input.type === "video" ? "Video" : "Photo"),
        inputType: input.type,
        captured: parseMediaCaptureCount(values?.[input.id]),
      });
    }
  };

  for (const result of results) {
    addFromStep(result.stepId, result.values);
  }

  for (const stepId of visitedStepIds) {
    if (resultStepIds.has(stepId)) continue;
    addFromStep(stepId, undefined);
  }

  return refs;
}

export function getRunMissingMediaSteps(run: AssetWorkflowRun): {
  allRequired: RunMissingMediaStep[];
  missing: RunMissingMediaStep[];
} {
  const allRequired = getRunRequiredMediaSteps(run);
  return {
    allRequired,
    missing: allRequired.filter((step) => step.captured === 0),
  };
}

/** Drop stale localStorage flags when the run no longer has missing required media. */
export function sanitizeMissingMediaFlags<T extends { runId: string }>(
  flags: T[],
  runsById: Map<string, AssetWorkflowRun>,
): T[] {
  return flags.filter((flag) => {
    const run = runsById.get(flag.runId);
    if (!run) return true;
    return getRunMissingMediaSteps(run).missing.length > 0;
  });
}

export function countMissingWorkflowItems(run: AssetWorkflowRun): number {
  return getRunMissingWorkflowItems(run).length;
}

export function getRunMissingWorkflowItems(run: AssetWorkflowRun): MissingWorkflowItem[] {
  const steps = parseWorkflowStepsFromSnapshot(run.workflowSnapshotJson);
  const stepMap = new Map(steps.map((step) => [step.id, step]));
  const results = parseWorkflowStepResults(run.stepResultsJson);
  const visitedStepIds = parseVisitedStepIds(run.stepResultsJson);
  const resultStepIds = new Set(results.map((result) => result.stepId));

  const missingFromResults = results.flatMap((result) => {
    const step = stepMap.get(result.stepId);
    return getMissingWorkflowItems(step, result.values);
  });

  const missingFromVisitedWithoutResults: MissingWorkflowItem[] = [];
  for (const stepId of visitedStepIds) {
    if (resultStepIds.has(stepId)) continue;
    missingFromVisitedWithoutResults.push(...getMissingItemsForUncapturedStep(stepMap.get(stepId)));
  }

  return [...missingFromResults, ...missingFromVisitedWithoutResults];
}

export function getWorkflowStepCompletion(run: AssetWorkflowRun): { completedSteps: number; totalSteps: number } {
  const totalSteps = parseWorkflowStepsFromSnapshot(run.workflowSnapshotJson).length;
  const completedSteps = new Set(parseWorkflowStepResults(run.stepResultsJson).map((result) => result.stepId)).size;
  return { completedSteps, totalSteps };
}

export function runHasCompletedAllSteps(run: AssetWorkflowRun): boolean {
  const visitedStepIds = parseVisitedStepIds(run.stepResultsJson);
  if (run.isLocked && visitedStepIds.size > 0) {
    return true;
  }

  const { completedSteps, totalSteps } = getWorkflowStepCompletion(run);
  return totalSteps > 0 && completedSteps >= totalSteps;
}
