import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { Feature } from "../types/feature";
import type { FeatureDependency } from "../types/featureDependency";
import type { ProjectAsset } from "../types/projectAsset";
import type { StepResult } from "../types/assetWorkflowRun";
import { labelForCaptureField, pickCaptureRun } from "./captureSpreadsheet";
import { parseWorkflowStepsFromSnapshot } from "./workflowCompleteness";
import { buildCapturedFields, type CapturedFieldExport, type WorkflowReportExportContext } from "./workflowReportExport";

export interface ProjectCaptureColumn {
  id: string;
  groupKey: string;
  featureId?: string;
  featureName: string;
  unitIndex: number;
  fieldLabel: string;
  displayLabel: string;
  sequence: number;
  groupType: "feature" | "general";
  /** Source run field — used for inline capture-table edits */
  stepId?: string;
  inputId?: string;
  inputType?: string;
  iterationIndex?: number;
}

export interface ProjectCaptureGroup {
  key: string;
  featureId?: string;
  featureName: string;
  displayName: string;
  groupType: "feature" | "general";
  businessPartNumber?: string;
  manufacturerPartNumber?: string;
  unitCount: number;
  columns: ProjectCaptureColumn[];
  tintIndex: number;
}

export interface ProjectCaptureRow {
  assetId: string;
  runId?: string;
  cells: Record<string, string>;
  /** Capture columns that belong to this asset's workflow run (others render N/A). */
  applicableColumnIds: Set<string>;
  searchText: string;
  /** Structured hits for word-start search UI (feature / field / value). */
  searchHits: ProjectCaptureSearchHit[];
}

/** One searchable capture cell — used to show "Feature · Field" context on match. */
export interface ProjectCaptureSearchHit {
  featureName: string;
  fieldLabel: string;
  value: string;
}

export interface ProjectCaptureTable {
  columns: ProjectCaptureColumn[];
  groups: ProjectCaptureGroup[];
  rows: ProjectCaptureRow[];
}

interface GroupAccumulator {
  key: string;
  featureId?: string;
  featureName: string;
  displayName: string;
  groupType: "feature" | "general";
  businessPartNumber?: string;
  manufacturerPartNumber?: string;
  maxUnitIndex: number;
  columns: ProjectCaptureColumn[];
  seenColumnKeys: Set<string>;
  tintIndex: number;
}

const GENERAL_GROUP_KEY = "general-sign-off";
const GENERAL_GROUP_LABEL = "General / Sign-off";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): boolean {
  return UUID_RE.test(String(value ?? "").trim());
}

function resolveFeatureDisplayName(
  field: CapturedFieldExport,
  productFeatures: Feature[],
): string {
  const raw = field.featureName?.trim() ?? "";
  if (raw && !isUuid(raw)) return raw;
  if (field.featureId) {
    const feat = productFeatures.find((f) => f.id === field.featureId);
    if (feat?.name?.trim()) return feat.name.trim();
  }
  if (raw) return raw;
  return "Feature";
}

function normalizeKeyPart(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeFieldLabel(value: string | undefined): string {
  return String(value ?? "").trim() || "Field";
}

function parseUnitIndex(stepTitle?: string): number {
  const left = String(stepTitle ?? "").split(/[—-]/)[0] ?? "";
  const matches = Array.from(left.matchAll(/(\d+)/g));
  if (matches.length === 0) return 1;
  const parsed = Number(matches[matches.length - 1][1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeSelectedValue(field: CapturedFieldExport): string {
  if (field.inputType === "checkbox") {
    if (field.selectedValue === "true") return "Yes";
    if (field.selectedValue === "false") return "No";
  }
  return field.selectedValue ?? "";
}

function captureContext(run: AssetWorkflowRun, asset: ProjectAsset, productFeatures: Feature[]): WorkflowReportExportContext {
  return {
    run,
    asset,
    workflowConfigName: "",
    signatureEvents: [],
    productFeatures,
  };
}

function groupSortName(group: GroupAccumulator): string {
  return group.groupType === "general" ? "~~~~" : group.displayName.toLowerCase();
}

function parseStepResultsForStructure(json: string): StepResult[] {
  try {
    return (JSON.parse(json || "[]") as StepResult[]).filter((item) => item.stepId !== "__nav__");
  } catch {
    return [];
  }
}

/** Fingerprint stepResultsJson shape (step/input keys) without cell values — stable across inline edits. */
export function stepResultsStructureFingerprint(stepResultsJson: string): string {
  const results = parseStepResultsForStructure(stepResultsJson);
  return results
    .map((result) => {
      const inputKeys = Object.keys(result.values ?? {}).sort().join(",");
      return `${result.stepId}:${result.iterationIndex ?? 0}:${inputKeys}`;
    })
    .sort()
    .join(";");
}

/**
 * Rebuild capture table columns/rows only when workflow structure changes — not on every
 * stepResultsJson value edit (F3 render perf).
 */
export function getCaptureTableStructureKey(
  runsByAsset: Record<string, AssetWorkflowRun[]>,
  assetIds: string[],
): string {
  const parts = assetIds
    .slice()
    .sort()
    .map((assetId) => {
      const run = pickCaptureRun(runsByAsset[assetId] ?? []);
      if (!run) return `${assetId}:none`;
      const snapshotLen = (run.workflowSnapshotJson ?? "").length;
      const structure = stepResultsStructureFingerprint(run.stepResultsJson ?? "[]");
      return `${assetId}:${run.id}:${snapshotLen}:${structure}`;
    });
  return parts.join("|");
}

export function buildProjectCaptureTable(
  assets: ProjectAsset[],
  runsByAsset: Record<string, AssetWorkflowRun[]>,
  productFeatures: Feature[],
): ProjectCaptureTable {
  const groups = new Map<string, GroupAccumulator>();
  const rows: ProjectCaptureRow[] = [];
  let sequence = 0;
  let tintIndex = 0;

  for (const asset of assets) {
    const runs = runsByAsset[asset.id] ?? [];
    const run = pickCaptureRun(runs);
    const capturedFields = run ? buildCapturedFields(captureContext(run, asset, productFeatures)) : [];
    const rowCells: Record<string, string> = {};
    const searchParts: string[] = [asset.assetTag, asset.assetName ?? "", asset.serialNumber ?? ""];
    const searchHits: ProjectCaptureSearchHit[] = [];

    for (const field of capturedFields) {
      if (field.inputType === "photo") continue;

      const featureName = resolveFeatureDisplayName(field, productFeatures);
      const fieldLabel = normalizeFieldLabel(field.inputLabel || field.fieldKey || field.inputId);
      const groupType = featureName || field.featureId ? "feature" : "general";
      const unitIndex = groupType === "general" ? 1 : parseUnitIndex(field.stepTitle);
      const groupKey = groupType === "general"
        ? GENERAL_GROUP_KEY
        : `feature:${field.featureId ?? normalizeKeyPart(featureName)}`;
      const displayName = groupType === "general" ? GENERAL_GROUP_LABEL : featureName;
      const columnKey = `${groupKey}:u${unitIndex}:${normalizeKeyPart(fieldLabel)}`;

      let group = groups.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          featureId: field.featureId,
          featureName: featureName || displayName,
          displayName,
          groupType,
          businessPartNumber: field.businessPartNumber,
          manufacturerPartNumber: field.manufacturerPartNumber,
          maxUnitIndex: unitIndex,
          columns: [],
          seenColumnKeys: new Set<string>(),
          tintIndex: groupType === "general" ? -1 : tintIndex++,
        };
        groups.set(groupKey, group);
      }

      if (!group.businessPartNumber && field.businessPartNumber) group.businessPartNumber = field.businessPartNumber;
      if (!group.manufacturerPartNumber && field.manufacturerPartNumber) group.manufacturerPartNumber = field.manufacturerPartNumber;
      group.maxUnitIndex = Math.max(group.maxUnitIndex, unitIndex);

      if (!group.seenColumnKeys.has(columnKey)) {
        group.columns.push({
          id: columnKey,
          groupKey,
          featureId: field.featureId,
          featureName: displayName,
          unitIndex,
          fieldLabel,
          displayLabel: fieldLabel,
          sequence: sequence++,
          groupType,
          stepId: field.stepId,
          inputId: field.inputId,
          inputType: field.inputType,
          iterationIndex: field.iterationIndex,
        });
        group.seenColumnKeys.add(columnKey);
      }

      const value = normalizeSelectedValue(field);
      rowCells[columnKey] = value;
      searchParts.push(displayName, fieldLabel, value, field.businessPartNumber ?? "", field.manufacturerPartNumber ?? "");
      if (field.allOptions?.length) searchParts.push(...field.allOptions);
      searchHits.push({
        featureName: displayName,
        fieldLabel,
        value,
      });
    }

    rows.push({
      assetId: asset.id,
      runId: run?.id,
      cells: rowCells,
      applicableColumnIds: new Set<string>(),
      searchText: searchParts.join(" ").toLowerCase(),
      searchHits,
    });
  }

  const sortedGroups = Array.from(groups.values())
    .sort((a, b) => groupSortName(a).localeCompare(groupSortName(b)));

  const finalGroups: ProjectCaptureGroup[] = [];
  for (const group of sortedGroups) {
    const unitCount = Math.max(1, group.maxUnitIndex);
    const sortedColumns = group.columns.slice().sort((a, b) => a.sequence - b.sequence);

    if (group.groupType === "general" || unitCount <= 1) {
      finalGroups.push({
        key: group.key,
        featureId: group.featureId,
        featureName: group.featureName,
        displayName: group.displayName,
        groupType: group.groupType,
        businessPartNumber: group.businessPartNumber,
        manufacturerPartNumber: group.manufacturerPartNumber,
        unitCount,
        columns: sortedColumns.map((column) => ({
          ...column,
          displayLabel: unitCount > 1 ? `U${column.unitIndex} · ${column.fieldLabel}` : column.fieldLabel,
        })),
        tintIndex: group.tintIndex,
      });
      continue;
    }

    // Same P/N with multiple installed units → separate top headers (Router 1, Router 2, …).
    for (let unit = 1; unit <= unitCount; unit += 1) {
      const unitColumns = sortedColumns.filter((column) => column.unitIndex === unit);
      if (unitColumns.length === 0) continue;
      finalGroups.push({
        key: `${group.key}:u${unit}`,
        featureId: group.featureId,
        featureName: group.featureName,
        displayName: `${group.displayName} ${unit}`,
        groupType: group.groupType,
        businessPartNumber: group.businessPartNumber,
        manufacturerPartNumber: group.manufacturerPartNumber,
        unitCount: 1,
        columns: unitColumns.map((column) => ({
          ...column,
          displayLabel: column.fieldLabel,
          groupKey: `${group.key}:u${unit}`,
        })),
        tintIndex: group.tintIndex,
      });
    }
  }

  const allColumns = finalGroups.flatMap((group) => group.columns);
  for (const row of rows) {
    const run = pickCaptureRun(runsByAsset[row.assetId] ?? []);
    row.applicableColumnIds = computeApplicableColumnIds(run, allColumns);
  }

  return {
    columns: allColumns,
    groups: finalGroups,
    rows,
  };
}

/** Column applies to an asset when its step exists on that asset's workflow snapshot. */
export function computeApplicableColumnIds(
  run: AssetWorkflowRun | undefined,
  columns: ProjectCaptureColumn[],
): Set<string> {
  if (!run) return new Set();
  const stepIds = new Set(
    parseWorkflowStepsFromSnapshot(run.workflowSnapshotJson ?? "")
      .map((step) => step.id)
      .filter(Boolean),
  );
  const applicable = new Set<string>();
  for (const column of columns) {
    if (!column.stepId) {
      applicable.add(column.id);
      continue;
    }
    if (stepIds.has(column.stepId)) applicable.add(column.id);
  }
  return applicable;
}

/**
 * Web-only fallback: column headers from product feature dependencies while full run
 * blobs are still loading. Cells are empty and not editable until blob-derived table
 * replaces this (same path native always uses — never call on phone).
 */
export function buildSchemaCaptureTableSkeleton(
  assets: ProjectAsset[],
  features: Feature[],
  depsByFeature: Record<string, FeatureDependency[]>,
  maxUnitsByFeature: Record<string, number>,
): ProjectCaptureTable {
  const groups: ProjectCaptureGroup[] = [];
  let sequence = 0;
  let tintIndex = 0;

  const inventoryFeatures = features
    .filter((f) => f.isInventory)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const feat of inventoryFeatures) {
    const maxUnits = Math.max(1, maxUnitsByFeature[feat.id] ?? 1);
    const featureDeps = (depsByFeature[feat.id] ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const captureKeys = feat.captureFields?.length
      ? feat.captureFields.map(String)
      : featureDeps.length
        ? featureDeps.map((d) => d.name)
        : ["serialNo", "firmware"];

    const groupKey = `feature:${feat.id}`;
    const columns: ProjectCaptureColumn[] = [];

    for (let unit = 1; unit <= maxUnits; unit += 1) {
      for (const fieldKey of captureKeys) {
        const fieldLabel = labelForCaptureField(fieldKey);
        const columnKey = `${groupKey}:u${unit}:${normalizeKeyPart(fieldLabel)}`;
        columns.push({
          id: columnKey,
          groupKey,
          featureId: feat.id,
          featureName: feat.name,
          unitIndex: unit,
          fieldLabel,
          displayLabel: maxUnits > 1 ? `U${unit} · ${fieldLabel}` : fieldLabel,
          sequence: sequence++,
          groupType: "feature",
        });
      }
    }

    if (columns.length === 0) continue;

    groups.push({
      key: groupKey,
      featureId: feat.id,
      featureName: feat.name,
      displayName: feat.name,
      groupType: "feature",
      businessPartNumber: feat.alternativePartNumber,
      manufacturerPartNumber: feat.manufacturerPartNumber,
      unitCount: maxUnits,
      columns,
      tintIndex: tintIndex++,
    });
  }

  const rows: ProjectCaptureRow[] = assets.map((asset) => ({
    assetId: asset.id,
    cells: {},
    applicableColumnIds: new Set<string>(),
    searchText: [asset.assetTag, asset.assetName ?? "", asset.serialNumber ?? ""].join(" ").toLowerCase(),
    searchHits: [],
  }));

  return {
    columns: groups.flatMap((g) => g.columns),
    groups,
    rows,
  };
}

export type CaptureMatchKind = "value" | "feature" | "field" | "part";

export interface CaptureMatchInfo {
  kind: CaptureMatchKind;
  featureName: string;
  fieldLabel: string;
  value: string;
  label: string;
}

/**
 * Find the best word-start match in capture hits.
 * Priority: value > feature name > field label (so brand/value beats "Location" label noise).
 */
export function findCaptureMatch(
  hits: ProjectCaptureSearchHit[] | undefined,
  query: string,
  matchesWordStart: (haystack: string | undefined | null, query: string) => boolean,
): CaptureMatchInfo | null {
  if (!hits?.length || !query.trim()) return null;

  const tryKind = (kind: CaptureMatchKind): CaptureMatchInfo | null => {
    for (const hit of hits) {
      const haystack =
        kind === "value" ? hit.value
          : kind === "feature" ? hit.featureName
            : kind === "field" ? hit.fieldLabel
              : undefined;
      if (!matchesWordStart(haystack, query)) continue;
      const label =
        kind === "value"
          ? `${hit.featureName} · ${hit.fieldLabel}: ${hit.value}`
          : kind === "feature"
            ? `Feature: ${hit.featureName}`
            : `${hit.featureName} · ${hit.fieldLabel}`;
      return { kind, featureName: hit.featureName, fieldLabel: hit.fieldLabel, value: hit.value, label };
    }
    return null;
  };

  return tryKind("value") ?? tryKind("feature") ?? tryKind("field");
}
