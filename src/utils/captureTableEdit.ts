import type { StepResult } from "../types/assetWorkflowRun";

export interface CaptureCellBinding {
  stepId: string;
  inputId: string;
  iterationIndex?: number;
}

function parseStepResults(json: string): StepResult[] {
  try {
    return (JSON.parse(json || "[]") as StepResult[]).filter((item) => item.stepId !== "__nav__");
  } catch {
    return [];
  }
}

export function isCaptureColumnEditable(inputType?: string): boolean {
  const t = (inputType ?? "").toLowerCase();
  if (!t) return true;
  if (t.includes("photo") || t.includes("video") || t.includes("signature")) return false;
  return true;
}

/** Minimal shape of a capture column needed to decide whether it can be amended. */
export interface AmendableColumnCandidate {
  stepId?: string;
  inputId?: string;
  inputType?: string;
}

/**
 * Columns a run-amend form may render as editable inputs.
 *
 * A column is only amendable when it maps back to a concrete run field — without both stepId
 * and inputId there is nothing for the capture-cell PATCH to target — and when its type is
 * not media or a signature.
 */
export function selectAmendableColumns<T extends AmendableColumnCandidate>(columns: T[]): T[] {
  return columns.filter((column) =>
    Boolean(column.stepId) && Boolean(column.inputId) && isCaptureColumnEditable(column.inputType));
}

/** Patch one capture/input value inside stepResultsJson. Returns updated JSON string. */
export function patchCaptureCellValue(
  stepResultsJson: string,
  binding: CaptureCellBinding,
  newValue: string,
): string {
  const results = parseStepResults(stepResultsJson);
  const wantIter = binding.iterationIndex ?? 0;

  let target = results.find(
    (r) => r.stepId === binding.stepId && (r.iterationIndex ?? 0) === wantIter,
  );

  if (!target) {
    target = {
      stepId: binding.stepId,
      values: {},
      completedAt: new Date().toISOString(),
      ...(binding.iterationIndex != null ? { iterationIndex: binding.iterationIndex } : {}),
    };
    results.push(target);
  }

  target.values = { ...target.values, [binding.inputId]: newValue };
  return JSON.stringify(results);
}
