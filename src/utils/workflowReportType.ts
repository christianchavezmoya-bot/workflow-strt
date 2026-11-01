/**
 * The workflow TYPE a report is about ("Installation", "Commissioning", "Inspection", "Repair",
 * "Other", or an admin-created custom type), resolved from persisted type data. It is the single
 * source for the report's identity everywhere it appears: the PDF title ("<TYPE> REPORT"), the
 * filename prefix (workflowReportBaseFileName), and the DOCX/JSON export metadata.
 *
 * Precedence, most authoritative first:
 *   1. the live workflow-types catalog entry for the config's workflowTypeId (custom types included);
 *   2. a type name the server already resolved from that catalog (public e-sign summary);
 *   3. the seeded catalog's names for a known workflowTypeId (catalog unavailable: offline cold start);
 *   4. legacy configType text: matched to the catalog by id or name, then to the seeded names, else
 *      used as-is (it is what an admin typed);
 *   5. the neutral "Workflow" when nothing is known. Never a guessed "Installation".
 */
import type { WorkflowType } from "../types/workflowType";

/** Seeded workflow types (AppDbContext.cs / WorkflowConfigUnification migration), plus the legacy
 *  configType spellings seen in this codebase. Used only when the live catalog can't answer. */
const SEEDED_TYPE_NAMES: Readonly<Record<string, string>> = {
  "wftype-installation": "Installation",
  "wftype-commissioning": "Commissioning",
  "wftype-inspection": "Inspection",
  "wftype-repair": "Repair",
  "wftype-other": "Other",
  installation: "Installation",
  install: "Installation",
  commissioning: "Commissioning",
  inspection: "Inspection",
  repair: "Repair",
  other: "Other",
};

export const FALLBACK_REPORT_TYPE = "Workflow";

export interface ReportTypeSource {
  /** Authoritative catalog id (WorkflowConfig.workflowTypeId). */
  workflowTypeId?: string | null;
  /** A name the server already resolved from the catalog (public e-sign summary). */
  workflowTypeName?: string | null;
  /** Legacy free-form type text (WorkflowConfig.configType). */
  configType?: string | null;
}

type CatalogEntry = Pick<WorkflowType, "id" | "name">;

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function resolveWorkflowReportType(
  source: ReportTypeSource | null | undefined,
  catalog: readonly CatalogEntry[] = [],
): string {
  const id = clean(source?.workflowTypeId);
  if (id) {
    const fromCatalog = clean(catalog.find((t) => t.id === id)?.name);
    if (fromCatalog) return fromCatalog;
  }
  const serverName = clean(source?.workflowTypeName);
  if (serverName) return serverName;
  if (id && SEEDED_TYPE_NAMES[id.toLowerCase()]) return SEEDED_TYPE_NAMES[id.toLowerCase()];

  const legacy = clean(source?.configType);
  if (legacy) {
    const lower = legacy.toLowerCase();
    const fromCatalog = catalog.find((t) => t.id.toLowerCase() === lower || clean(t.name).toLowerCase() === lower);
    if (fromCatalog && clean(fromCatalog.name)) return clean(fromCatalog.name);
    return SEEDED_TYPE_NAMES[lower] ?? legacy;
  }
  return FALLBACK_REPORT_TYPE;
}

/**
 * For report paths that start from a run rather than an already-loaded config: loads the run's
 * config and the catalog (both best-effort: a failure, e.g. offline, degrades to the neutral
 * fallback instead of breaking report generation) and resolves the type.
 */
export async function loadWorkflowReportType(
  workflowConfigId: string | null | undefined,
  deps: {
    getConfig: (id: string) => Promise<ReportTypeSource | null | undefined>;
    listTypes: () => Promise<readonly CatalogEntry[]>;
  },
): Promise<string> {
  const [config, catalog] = await Promise.all([
    workflowConfigId ? deps.getConfig(workflowConfigId).catch(() => null) : Promise.resolve(null),
    deps.listTypes().catch(() => [] as CatalogEntry[]),
  ]);
  return resolveWorkflowReportType(config, catalog);
}
