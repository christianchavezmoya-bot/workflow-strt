import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { Feature } from "../types/feature";
import type { ProjectAsset } from "../types/projectAsset";
import { pickCaptureRun } from "./captureSpreadsheet";
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

      const featureName = field.featureName?.trim() || "";
      const fieldLabel = normalizeFieldLabel(field.inputLabel || field.fieldKey || field.inputId);
      const groupType = featureName || field.featureId ? "feature" : "general";
      const unitIndex = groupType === "general" ? 1 : parseUnitIndex(field.stepTitle);
      const groupKey = groupType === "general"
        ? GENERAL_GROUP_KEY
        : `feature:${field.featureId ?? normalizeKeyPart(featureName)}`;
      const displayName = groupType === "general" ? GENERAL_GROUP_LABEL : (featureName || field.featureId || "Feature");
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
      searchText: searchParts.join(" ").toLowerCase(),
      searchHits,
    });
  }

  const sortedGroups = Array.from(groups.values())
    .sort((a, b) => groupSortName(a).localeCompare(groupSortName(b)));

  const finalGroups: ProjectCaptureGroup[] = sortedGroups.map((group) => {
    const unitCount = Math.max(1, group.maxUnitIndex);
    const columns = group.columns
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((column) => ({
        ...column,
        displayLabel: unitCount > 1 ? `U${column.unitIndex} · ${column.fieldLabel}` : column.fieldLabel,
      }));

    return {
      key: group.key,
      featureId: group.featureId,
      featureName: group.featureName,
      displayName: group.displayName,
      groupType: group.groupType,
      businessPartNumber: group.businessPartNumber,
      manufacturerPartNumber: group.manufacturerPartNumber,
      unitCount,
      columns,
      tintIndex: group.tintIndex,
    };
  });

  return {
    columns: finalGroups.flatMap((group) => group.columns),
    groups: finalGroups,
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
