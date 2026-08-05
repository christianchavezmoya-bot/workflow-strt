import type { PendingAction } from "../services/localDB";
import { entityGetAllProjects, entityGetAsset, entityGetWorkflowRun } from "../services/localDB";
import offlineStore from "../services/offlineStore";
import { workflowConfigService } from "../services/workflowConfigService";
import { workflowTypeService } from "../services/workflowTypeService";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { Project } from "../types/project";
import type { ProjectAsset } from "../types/projectAsset";

export interface PendingActionContext {
  assetTag?: string;
  assetName?: string;
  jobNumber?: string;
  runStatus?: string;
}

function shortUrl(url: string): string {
  return url.length > 48 ? `${url.slice(0, 45)}…` : url;
}

function readBodyField(action: PendingAction, key: string): string | undefined {
  const fromBody = (action.body as Record<string, unknown> | undefined)?.[key];
  if (typeof fromBody === "string" && fromBody) return fromBody;
  const fromPatch = action.optimisticPatch?.[key];
  if (typeof fromPatch === "string" && fromPatch) return fromPatch;
  return undefined;
}

function runIdFromUrl(url: string): string | null {
  const match = url.match(/[?&]runId=([^&]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function assetIdFromUrl(url: string): string | null {
  const patterns = [
    /\/project-assets\/([^/?]+)/,
    /\/asset-workflow-runs\/([^/?]+)/,
    /\/asset-workflow-assignments\/by-asset\/([^/?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Human-readable operation name for sync queue rows. */
export function describeSyncOpType(action: PendingAction): string {
  const body = action.body as Record<string, unknown> | undefined;
  switch (action.opType) {
    case "RUN_CREATE":
      return "Start workflow run";
    case "RUN_UPDATE":
      return "Save workflow progress";
    case "RUN_COMPLETE":
      return "Complete run";
    case "RUN_ABANDON":
      return "Discard run progress";
    case "STEP_RESULTS":
      return "Save captured step data";
    case "CAPTURE_CELL":
      return typeof body?.fieldLabel === "string" && body.fieldLabel.trim()
        ? `Correct captured field: ${body.fieldLabel}`
        : "Correct captured field";
    case "SIGNATURE_SUBMIT":
      return body?.signerRole === "Customer" ? "Customer sign-off" : "Installer sign-off";
    case "TIME_ENTRY":
      return "Update time tracking";
    case "ISSUE_UPDATE":
      return "Update issues";
    case "ISSUE_CREATE":
      return "Report issue";
    case "ISSUE_CLOSE":
      return "Close issue";
    case "ASSET_UPDATE":
      return "Update asset details";
    case "ASSET_DELETE":
      return "Archive asset";
    case "WORKFLOW_ASSIGNMENT_CREATE":
      return "Assign workflow";
    case "WORKFLOW_ASSIGNMENT_DELETE":
      return "Remove workflow assignment";
    case "MEDIA_UPLOAD":
      return "Upload photo or file";
    case "ASSET_DOCUMENT_LINK_ATTACH":
    case "ASSET_DOCUMENT_LINK_UPLOAD":
      return "Attach document";
    case "ASSET_DOCUMENT_LINK_DETACH":
      return "Remove document link";
    case "WORK_INSTRUCTION_CREATE":
      return "Create work instruction";
    case "WORK_INSTRUCTION_UPDATE":
      return "Update work instruction";
    case "WORK_INSTRUCTION_DELETE":
      return "Delete work instruction";
    default:
      if (action.url.includes("/signature-events")) return "Submit signature";
      if (action.url.includes("/issues")) return "Update issues";
      if (action.url.includes("/time-entries")) return "Update time tracking";
      if (action.method === "DELETE") return "Delete";
      if (action.method === "PATCH") return "Save changes";
      return "Upload change";
  }
}

/** Build title/subtitle from resolved context — no raw URLs. */
export function formatPendingActionLabel(
  action: PendingAction,
  ctx: PendingActionContext,
): { title: string; subtitle: string } {
  const tag = ctx.assetTag ?? ctx.assetName;
  const projectRef = ctx.jobNumber;
  const op = describeSyncOpType(action);
  const isRunOp =
    action.entityType === "workflow-run"
    || action.url.includes("/asset-workflow-runs")
    || action.url.includes("/signature-events");

  if (isRunOp) {
    const titleParts = [tag, projectRef].filter(Boolean);
    const title = titleParts.length > 0 ? titleParts.join(" · ") : "Workflow run";
    const subtitleParts = [op];
    if (ctx.runStatus) subtitleParts.push(ctx.runStatus);
    return { title, subtitle: subtitleParts.join(" · ") };
  }

  if (action.entityType === "asset" && tag) {
    return {
      title: tag,
      subtitle: projectRef ? `${op} · ${projectRef}` : op,
    };
  }

  if (action.entityType === "workflowAssignment") {
    return {
      title: tag ?? "Workflow assignment",
      subtitle: projectRef ? `${op} · ${projectRef}` : op,
    };
  }

  if (tag) {
    return {
      title: tag,
      subtitle: projectRef ? `${op} · ${projectRef}` : op,
    };
  }

  return {
    title: op,
    subtitle: projectRef ?? action.entityType,
  };
}

/** Technical subtitle for diagnostics / support bundle only. */
export function formatPendingActionTechnicalDetail(action: PendingAction): string {
  return `${action.method} ${shortUrl(action.url)}`;
}

async function assetContext(assetId: string): Promise<PendingActionContext> {
  const record = await entityGetAsset(assetId);
  const asset = record?.data as ProjectAsset | null;
  let jobNumber: string | undefined;
  if (record?.projectId) {
    const projects = (await entityGetAllProjects()) as Project[];
    jobNumber = projects.find((project) => project.id === record.projectId)?.jobNumber;
  }
  return {
    assetTag: asset?.assetTag,
    assetName: asset?.assetName,
    jobNumber,
  };
}

async function resolveRunContext(runId: string): Promise<PendingActionContext> {
  const offlineRun = await offlineStore.getRun(runId);
  const run = offlineRun ?? ((await entityGetWorkflowRun(runId))?.data as AssetWorkflowRun | undefined);
  if (!run?.assetId) return {};
  const ctx = await assetContext(run.assetId);
  return { ...ctx, runStatus: run.status };
}

export async function resolvePendingActionLabel(
  action: PendingAction,
): Promise<{ title: string; subtitle: string }> {
  if (action.entityType === "workflowAssignment") {
    const configId = readBodyField(action, "workflowConfigId");
    const typeId = readBodyField(action, "workflowTypeId");
    const assetId = readBodyField(action, "assetId") ?? assetIdFromUrl(action.url);
    const [config, types, assetCtx] = await Promise.all([
      configId ? workflowConfigService.getByIdLocalFirst(configId) : Promise.resolve(null),
      workflowTypeService.list(),
      assetId ? assetContext(assetId) : Promise.resolve({} as PendingActionContext),
    ]);
    const typeName = types.find((type) => type.id === typeId)?.name;
    const workflowName = config?.name ?? typeName ?? "Workflow";
    const base = formatPendingActionLabel(action, assetCtx);
    return {
      title: assetCtx.assetTag ? `${assetCtx.assetTag} · ${workflowName}` : workflowName,
      subtitle: base.subtitle,
    };
  }

  if (action.entityType === "workflow-run") {
    const runId = action.entityId || runIdFromUrl(action.url) || "";
    const ctx = runId ? await resolveRunContext(runId) : {};
    return formatPendingActionLabel(action, ctx);
  }

  const assetId =
    action.entityType === "asset"
      ? action.entityId
      : readBodyField(action, "assetId") ?? assetIdFromUrl(action.url);

  if (assetId) {
    return formatPendingActionLabel(action, await assetContext(assetId));
  }

  const runId = runIdFromUrl(action.url);
  if (runId) {
    return formatPendingActionLabel(action, await resolveRunContext(runId));
  }

  return formatPendingActionLabel(action, {});
}
