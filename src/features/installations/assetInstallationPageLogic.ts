import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import { isMobileNativePlatform } from "../../utils/platform";

// ------------------------------------------------------------------
// Column configuration
// ------------------------------------------------------------------

export interface ColumnDef {
  id: string;
  label: string;
}

export const CONFIGURABLE_COLUMNS: ColumnDef[] = [
  { id: "assetName", label: "Asset Name" },
  { id: "serialNumber", label: "Serial #" },
  { id: "assetModel", label: "Asset Model" },
  { id: "manufacturer", label: "Manufacturer" },
  { id: "configType", label: "Config Type" },
  { id: "configName", label: "Workflow Configuration Name" },
  { id: "project", label: "Project" },
  { id: "siteName", label: "Site Name" },
  { id: "location", label: "Location" },
  { id: "dateCreated", label: "Date Created" },
  { id: "dateClosed", label: "Date Closed" },
  { id: "assignedTech", label: "Assigned Tech" },
  { id: "features", label: "Features" },
  { id: "status", label: "Status" },
];

export const DEFAULT_COL_ORDER = CONFIGURABLE_COLUMNS.map((c) => c.id);
export const LS_COL_KEY = "asset_installation_columns_v2";
export const FORCE_VISIBLE_COL_IDS = ["dateCreated", "dateClosed"] as const;
export const ARCHIVE_COL_IDS = [
  "serialNumber",
  "assetModel",
  "manufacturer",
  "project",
  "siteName",
  "configType",
  "status",
];

export function operationsStickyPrefixSx(left: number, zIndex: number) {
  return isMobileNativePlatform()
    ? {}
    : {
        position: "sticky" as const,
        left,
        zIndex,
        bgcolor: "background.paper",
        ...(left > 0 ? { boxShadow: "2px 0 6px rgba(0,0,0,0.12)" } : {}),
      };
}

export function loadColumnConfig(): { order: string[]; hidden: string[] } {
  try {
    const raw = localStorage.getItem(LS_COL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { order?: string[]; hidden?: string[] };
      const knownIds = new Set(CONFIGURABLE_COLUMNS.map((column) => column.id));
      const savedOrder = Array.isArray(parsed.order) ? parsed.order.filter((id) => knownIds.has(id)) : [];
      const missingIds = DEFAULT_COL_ORDER.filter((id) => !savedOrder.includes(id));
      return {
        order: [...savedOrder, ...missingIds],
        hidden: Array.isArray(parsed.hidden)
          ? parsed.hidden.filter(
              (id) =>
                knownIds.has(id) &&
                !FORCE_VISIBLE_COL_IDS.includes(id as (typeof FORCE_VISIBLE_COL_IDS)[number]),
            )
          : [],
      };
    }
  } catch {
    /* localStorage unavailable or corrupt — fall back to defaults */
  }
  return { order: DEFAULT_COL_ORDER, hidden: [] };
}

/** Time-ago helper for mobile sync timestamp display */
export function timeAgo(date: Date, nowMs: number = Date.now()): string {
  const secs = Math.floor((nowMs - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function projectHasInspection(workflowMode?: string | null) {
  return workflowMode === "INSPECTION_ONLY" || workflowMode === "MIXED";
}

export function isInspectionConfigType(configType?: string | null): boolean {
  const n = (configType ?? "").trim().toLowerCase();
  return n === "inspection" || n === "wftype-inspection";
}

export function isInspectionWorkflowType(typeName?: string | null): boolean {
  return (typeName ?? "").trim().toLowerCase().includes("inspection");
}

export function workflowTypeMismatchMessage(
  typeName: string | undefined,
  configType: string | null | undefined,
): string | null {
  const typeIsInspection = isInspectionWorkflowType(typeName);
  const configIsInspection = isInspectionConfigType(configType);
  if (typeIsInspection && !configIsInspection)
    return `The selected workflow config is an installation/generic type but the workflow type is "${typeName}". Using an inspection workflow type with a non-inspection config may produce unexpected results.`;
  if (!typeIsInspection && configIsInspection)
    return `The selected workflow config is an inspection type but the workflow type is "${typeName}". Inspection configs should only be used with an Inspection workflow type.`;
  return null;
}

/**
 * The Assign Workflow dialog only asks for a config now (workflow type is
 * redundant — every config already implies its own type). This derives the
 * workflowTypeId the create() call still needs from the chosen config itself:
 * its own workflowTypeId FK when set, else matched by configType name.
 */
export function resolveConfigWorkflowTypeId(config: WorkflowConfig, types: WorkflowType[]): string {
  if (config.workflowTypeId) return config.workflowTypeId;
  const normalized = config.configType?.trim().toLowerCase();
  if (!normalized) return "";
  return types.find((t) => t.name.trim().toLowerCase() === normalized)?.id ?? "";
}

// ------------------------------------------------------------------
// Health tracking
// ------------------------------------------------------------------

export interface AssetHealth {
  total: number;
  notStarted: number;
  inProgress: number;
  paused: number;
  pending: number;
  complete: number;
  closed: number;
  issue: number;
  noWorkflow: number;
}

export function assetHasConfiguredWorkflow(asset: ProjectAsset): boolean {
  return !!asset.workflowSummary?.hasWorkflow || !!asset.productConfigId || !!asset.workflowTemplateId;
}

export function computeHealth(list: ProjectAsset[]): AssetHealth {
  return {
    total: list.length,
    notStarted: list.filter((a) => a.status === "NotStarted").length,
    inProgress: list.filter((a) => a.status === "InProgress").length,
    paused: list.filter((a) => a.status === "Paused").length,
    pending: list.filter((a) => a.status === "Pending").length,
    complete: list.filter((a) => a.status === "Complete").length,
    closed: list.filter((a) => a.status === "Closed").length,
    issue: list.filter((a) => a.status === "Issue").length,
    noWorkflow: list.filter((a) => !assetHasConfiguredWorkflow(a)).length,
  };
}

export function tabDotColor(h: AssetHealth | undefined): string | null {
  if (!h || h.total === 0) return null;
  if (h.issue > 0) return "error.main";
  if (h.complete + h.closed === h.total) return "success.main";
  return "warning.main";
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function nextDraftConfigNumber(configs: WorkflowConfig[], productName: string) {
  const pattern = new RegExp(`^${escapeRegExp(productName)}\\s+Config\\s+(\\d+)$`, "i");
  const maxMatch = configs.reduce((max, cfg) => {
    const match = cfg.name.match(pattern);
    if (!match) return max;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return maxMatch + 1;
}
