/**
 * Workflow capture spreadsheet — column schema, cell values, and search index.
 * Data source: workflow snapshot + stepResultsJson only (not BOM).
 */

import type { AssetWorkflowRun, StepResult } from "../types/assetWorkflowRun";
import type { Feature } from "../types/feature";
import type { FeatureDependency } from "../types/featureDependency";
import type { WorkflowStep } from "../types/workflow";
import type { FeatureSelection } from "../services/productConfigService";

export type CaptureColumnKind =
  | "feature-pn-mfr"
  | "feature-pn-alt"
  | "feature-capture"
  | "dependency-capture";

export interface CaptureColumnDef {
  id: string;
  kind: CaptureColumnKind;
  featureId: string;
  featureName: string;
  dependencyId?: string;
  dependencyName?: string;
  /** 1-based unit index */
  unitIndex: number;
  fieldKey: string;
  fieldLabel: string;
  /** Stable key for column visibility picker */
  groupKey: string;
  sortLabel: string;
}

export interface CaptureCellBinding {
  stepId: string;
  captureFieldId: string;
  iterationIndex?: number;
}

export interface CaptureCellValue {
  value: string;
  applicable: boolean;
  binding?: CaptureCellBinding;
}

export interface CaptureAssetRow {
  assetId: string;
  cells: Record<string, CaptureCellValue>;
  searchText: string;
  runId?: string;
  customerFinalized: boolean;
}

type SnapshotStep = WorkflowStep & {
  bomSource?: { dependencyId?: string; featureId?: string; isInventory?: boolean };
};

const CAPTURE_FIELD_LABELS: Record<string, string> = {
  serialNo: "Serial",
  serialNumber: "Serial",
  firmware: "Firmware",
  firmwareVersion: "Firmware",
  ipAddress: "IP Address",
  macAddress: "MAC",
  model: "Model",
  location: "Location",
  certification: "Certification",
  cert: "Certification",
};

export function labelForCaptureField(key: string): string {
  if (CAPTURE_FIELD_LABELS[key]) return CAPTURE_FIELD_LABELS[key];
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

export function isRunCustomerFinalized(run: AssetWorkflowRun | null | undefined): boolean {
  if (!run) return false;
  if (run.customerSignedAt) return true;
  const s = run.signatureStatus ?? "";
  return s === "Signed" || s === "Declined" || s === "WaivedCustomer";
}

function parseStepResults(json: string): StepResult[] {
  try {
    const parsed = JSON.parse(json || "[]") as StepResult[];
    return Array.isArray(parsed) ? parsed.filter((r) => r.stepId !== "__nav__") : [];
  } catch {
    return [];
  }
}

function parseSnapshotSteps(snapshotJson: string): SnapshotStep[] {
  try {
    const doc = JSON.parse(snapshotJson || "{}") as Record<string, unknown>;
    const stepsRaw = doc.stepsJson;
    if (!stepsRaw) return [];
    const inner = typeof stepsRaw === "string" ? JSON.parse(stepsRaw) : stepsRaw;
    if (Array.isArray(inner)) return inner as SnapshotStep[];
    if (inner && typeof inner === "object" && Array.isArray((inner as { steps?: unknown }).steps)) {
      return (inner as { steps: SnapshotStep[] }).steps;
    }
    return [];
  } catch {
    return [];
  }
}

function parseFeatureSelections(json: string | undefined): FeatureSelection[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as FeatureSelection[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Max activeCount per feature across workflow configs for a product. */
export function computeMaxUnitsByFeature(
  featureSelectionsList: FeatureSelection[][],
): Record<string, number> {
  const max: Record<string, number> = {};
  for (const sels of featureSelectionsList) {
    for (const s of sels) {
      if (!s.included && s.activeCount <= 0) continue;
      const count = Math.max(0, s.activeCount ?? 0);
      max[s.featureId] = Math.max(max[s.featureId] ?? 0, count);
    }
  }
  return max;
}

export function buildCaptureColumns(
  features: Feature[],
  depsByFeature: Record<string, FeatureDependency[]>,
  maxUnitsByFeature: Record<string, number>,
  hiddenGroupKeys: Set<string>,
): CaptureColumnDef[] {
  const cols: CaptureColumnDef[] = [];
  const inventoryFeatures = features
    .filter((f) => f.isInventory)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const feat of inventoryFeatures) {
    const maxUnits = Math.max(1, maxUnitsByFeature[feat.id] ?? 1);
    const captureKeys = (feat.captureFields?.length ? feat.captureFields : ["serialNo", "firmware"]).map(String);

    for (let unit = 1; unit <= maxUnits; unit++) {
      const groupKey = `feat:${feat.id}:${unit}`;
      if (hiddenGroupKeys.has(groupKey) || hiddenGroupKeys.has(`feat:${feat.id}`)) {
        continue;
      }
      const pnMfrId = `${groupKey}:pn-mfr`;
      if (!hiddenGroupKeys.has(pnMfrId)) {
        cols.push({
          id: pnMfrId,
          kind: "feature-pn-mfr",
          featureId: feat.id,
          featureName: feat.name,
          unitIndex: unit,
          fieldKey: "mfrPn",
          fieldLabel: "Mfr P/N",
          groupKey,
          sortLabel: `${feat.name} ${unit} Mfr P/N`,
        });
      }

      const pnAltId = `${groupKey}:pn-alt`;
      if (!hiddenGroupKeys.has(pnAltId)) {
        cols.push({
          id: pnAltId,
          kind: "feature-pn-alt",
          featureId: feat.id,
          featureName: feat.name,
          unitIndex: unit,
          fieldKey: "altPn",
          fieldLabel: "Bus P/N",
          groupKey,
          sortLabel: `${feat.name} ${unit} Bus P/N`,
        });
      }

      for (const fieldKey of captureKeys) {
        const colId = `${groupKey}:fc:${fieldKey}`;
        if (hiddenGroupKeys.has(colId)) continue;
        cols.push({
          id: colId,
          kind: "feature-capture",
          featureId: feat.id,
          featureName: feat.name,
          unitIndex: unit,
          fieldKey,
          fieldLabel: labelForCaptureField(fieldKey),
          groupKey,
          sortLabel: `${feat.name} ${unit} ${labelForCaptureField(fieldKey)}`,
        });
      }

      const deps = (depsByFeature[feat.id] ?? [])
        .filter((d) => d.isInventory)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

      for (const dep of deps) {
        const depGroup = `dep:${feat.id}:${dep.id}:${unit}`;
        const depFields = dep.captureFields?.length ? dep.captureFields : ["serialNo"];
        for (const fieldKey of depFields) {
          const colId = `${depGroup}:${fieldKey}`;
          if (hiddenGroupKeys.has(colId) || hiddenGroupKeys.has(depGroup)) continue;
          cols.push({
            id: colId,
            kind: "dependency-capture",
            featureId: feat.id,
            featureName: feat.name,
            dependencyId: dep.id,
            dependencyName: dep.name,
            unitIndex: unit,
            fieldKey,
            fieldLabel: labelForCaptureField(fieldKey),
            groupKey: depGroup,
            sortLabel: `${feat.name} ${unit} — ${dep.name} ${labelForCaptureField(fieldKey)}`,
          });
        }
      }
    }
  }

  return cols.sort((a, b) => a.sortLabel.localeCompare(b.sortLabel));
}

function findFeatureCaptureValue(
  steps: SnapshotStep[],
  results: StepResult[],
  featureId: string,
  unitIndex: number,
  fieldKey: string,
): { value: string; binding?: CaptureCellBinding } {
  for (const step of steps) {
    if (step.stepFeatureId !== featureId || step.stepUnitIndex !== unitIndex) continue;
    const fields = step.captureFields ?? [];
    const field = fields.find((f) => f.key === fieldKey || f.label === fieldKey);
    if (!field) continue;
    const result = results.find((r) => r.stepId === step.id && (r.iterationIndex ?? 0) === 0);
    const raw = result?.values?.[field.id];
    if (raw) {
      return {
        value: raw,
        binding: { stepId: step.id, captureFieldId: field.id, iterationIndex: 0 },
      };
    }
  }
  return { value: "" };
}

function findDependencyCaptureValue(
  steps: SnapshotStep[],
  results: StepResult[],
  dependencyId: string,
  unitIndex: number,
  fieldKey: string,
): { value: string; binding?: CaptureCellBinding } {
  for (const step of steps) {
    const bom = step.bomSource;
    if (!bom?.dependencyId || bom.dependencyId !== dependencyId || !bom.isInventory) continue;
    const fields = step.captureFields ?? [];
    const field = fields.find(
      (f) => f.key === fieldKey || f.key === fieldKey.replace(/([A-Z])/g, (m) => m.toLowerCase()),
    );
    if (!field) {
      const byLabel = fields.find((f) => labelForCaptureField(f.key).toLowerCase() === labelForCaptureField(fieldKey).toLowerCase());
      if (!byLabel) continue;
      const iterIndex = unitIndex - 1;
      const result = results.find((r) => r.stepId === step.id && (r.iterationIndex ?? 0) === iterIndex);
      const raw = result?.values?.[byLabel.id];
      if (raw) {
        return {
          value: raw,
          binding: { stepId: step.id, captureFieldId: byLabel.id, iterationIndex: iterIndex },
        };
      }
      continue;
    }
    const iterIndex = unitIndex - 1;
    const result = results.find((r) => r.stepId === step.id && (r.iterationIndex ?? 0) === iterIndex);
    const raw = result?.values?.[field.id];
    if (raw) {
      return {
        value: raw,
        binding: { stepId: step.id, captureFieldId: field.id, iterationIndex: iterIndex },
      };
    }
  }
  return { value: "" };
}

export function buildCaptureRow(
  assetId: string,
  run: AssetWorkflowRun | undefined,
  columns: CaptureColumnDef[],
  features: Feature[],
  activeCountByFeature: Record<string, number>,
): CaptureAssetRow {
  const featMap = new Map(features.map((f) => [f.id, f]));
  const steps = run ? parseSnapshotSteps(run.workflowSnapshotJson) : [];
  const results = run ? parseStepResults(run.stepResultsJson) : [];
  const cells: Record<string, CaptureCellValue> = {};
  const searchParts: string[] = [];

  for (const col of columns) {
    const activeCount = activeCountByFeature[col.featureId] ?? 0;
    const applicable = activeCount === 0 ? true : col.unitIndex <= activeCount;
    let value = "";
    let binding: CaptureCellBinding | undefined;

    const feat = featMap.get(col.featureId);
    if (feat) {
      searchParts.push(feat.name, feat.manufacturerPartNumber ?? "", feat.alternativePartNumber ?? "");
    }

    if (!applicable) {
      cells[col.id] = { value: "", applicable: false };
      continue;
    }

    if (col.kind === "feature-pn-mfr") {
      value = feat?.manufacturerPartNumber ?? "";
    } else if (col.kind === "feature-pn-alt") {
      value = feat?.alternativePartNumber ?? "";
    } else if (col.kind === "feature-capture") {
      const found = findFeatureCaptureValue(steps, results, col.featureId, col.unitIndex, col.fieldKey);
      value = found.value;
      binding = found.binding;
    } else if (col.kind === "dependency-capture" && col.dependencyId) {
      const found = findDependencyCaptureValue(steps, results, col.dependencyId, col.unitIndex, col.fieldKey);
      value = found.value;
      binding = found.binding;
    }

    if (value) searchParts.push(value);
    if (col.dependencyName) searchParts.push(col.dependencyName);

    cells[col.id] = { value, applicable: true, binding };
  }

  return {
    assetId,
    cells,
    searchText: searchParts.join(" ").toLowerCase(),
    runId: run?.id,
    customerFinalized: isRunCustomerFinalized(run),
  };
}

export function buildAssetCaptureSearchBlob(
  assetTag: string,
  assetName: string,
  serialNumber: string | undefined,
  captureRow: CaptureAssetRow | undefined,
  features: Feature[],
): string {
  const parts = [assetTag, assetName, serialNumber ?? ""];
  for (const f of features) {
    if (!f.isInventory) continue;
    parts.push(f.name, f.description ?? "", f.manufacturerPartNumber ?? "", f.alternativePartNumber ?? "");
  }
  if (captureRow) parts.push(captureRow.searchText);
  return parts.join(" ").toLowerCase();
}

export function listColumnGroups(columns: CaptureColumnDef[]): { key: string; label: string }[] {
  const seen = new Set<string>();
  const groups: { key: string; label: string }[] = [];
  for (const col of columns) {
    if (seen.has(col.groupKey)) continue;
    seen.add(col.groupKey);
    const label =
      col.kind === "dependency-capture" && col.dependencyName
        ? `${col.featureName} ${col.unitIndex} — ${col.dependencyName}`
        : `${col.featureName} ${col.unitIndex}`;
    groups.push({ key: col.groupKey, label });
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

export function patchStepResultValue(
  stepResultsJson: string,
  binding: CaptureCellBinding,
  newValue: string,
): string {
  const results = parseStepResults(stepResultsJson);
  const nav = (() => {
    try {
      const all = JSON.parse(stepResultsJson || "[]") as StepResult[];
      return Array.isArray(all) ? all.filter((r) => r.stepId === "__nav__") : [];
    } catch {
      return [];
    }
  })();

  const iter = binding.iterationIndex ?? 0;
  let found = results.find((r) => r.stepId === binding.stepId && (r.iterationIndex ?? 0) === iter);
  if (!found) {
    found = {
      stepId: binding.stepId,
      values: {},
      completedAt: new Date().toISOString(),
      iterationIndex: iter > 0 ? iter : undefined,
    };
    results.push(found);
  }
  found.values = { ...found.values, [binding.captureFieldId]: newValue };
  return JSON.stringify([...results, ...nav]);
}
