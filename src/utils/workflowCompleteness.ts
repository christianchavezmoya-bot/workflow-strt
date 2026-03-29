import type { AssetWorkflowRun, StepResult } from "../types/assetWorkflowRun";
import type { CaptureField, StepInput, WorkflowStep } from "../types/workflow";

export type MissingWorkflowItemKind = "photo" | "video" | "input" | "capture";

export interface MissingWorkflowItem {
  id: string;
  label: string;
  kind: MissingWorkflowItemKind;
  required: boolean;
}

function hasTextValue(val: string | undefined): boolean {
  if (!val) return false;
  return val.trim().length > 0;
}

export function parseMediaCaptureCount(val: string | undefined): number {
  if (!val) return 0;
  if (val.startsWith("data:image/") || val.startsWith("data:video/")) return 1;
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

export function getMissingWorkflowItems(
  step: WorkflowStep | undefined,
  values: Record<string, string> | undefined,
): MissingWorkflowItem[] {
  if (!step) return [];

  const missingInputs: MissingWorkflowItem[] = [];
  for (const input of step.inputs ?? []) {
    const raw = values?.[input.id];
    if (input.type === "photo" || input.type === "video") {
      if (!hasInputValue(input, raw)) {
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

export function countMissingWorkflowItems(run: AssetWorkflowRun): number {
  const stepMap = new Map(parseWorkflowStepsFromSnapshot(run.workflowSnapshotJson).map((step) => [step.id, step]));
  return parseWorkflowStepResults(run.stepResultsJson).reduce((count, result) => {
    const step = stepMap.get(result.stepId);
    return count + getMissingWorkflowItems(step, result.values).length;
  }, 0);
}
