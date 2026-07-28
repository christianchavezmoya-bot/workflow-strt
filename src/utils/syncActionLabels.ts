import type { PendingAction } from "../services/localDB";
import { entityGetAsset } from "../services/localDB";
import { workflowConfigService } from "../services/workflowConfigService";
import { workflowTypeService } from "../services/workflowTypeService";
import type { ProjectAsset } from "../types/projectAsset";

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

async function assetLabel(assetId: string): Promise<string> {
  const record = await entityGetAsset(assetId);
  const asset = record?.data as ProjectAsset | null;
  if (asset?.assetTag) return asset.assetTag;
  if (asset?.assetName) return asset.assetName;
  return assetId.slice(0, 8);
}

export async function resolvePendingActionLabel(
  action: PendingAction,
): Promise<{ title: string; subtitle: string }> {
  const assetId =
    action.entityType === "asset" || action.entityType === "workflow-run"
      ? action.entityId
      : readBodyField(action, "assetId") ?? assetIdFromUrl(action.url);

  if (action.entityType === "workflowAssignment") {
    const configId = readBodyField(action, "workflowConfigId");
    const typeId = readBodyField(action, "workflowTypeId");
    const [config, types, tag] = await Promise.all([
      configId ? workflowConfigService.getByIdLocalFirst(configId) : Promise.resolve(null),
      workflowTypeService.list(),
      assetId ? assetLabel(assetId) : Promise.resolve(""),
    ]);
    const typeName = types.find((t) => t.id === typeId)?.name;
    const title = config?.name ?? typeName ?? "Workflow assignment";
    const subtitle = tag ? `Asset ${tag}` : shortUrl(action.url);
    return { title, subtitle };
  }

  if (action.entityType === "workflow-run") {
    const tag = await assetLabel(assetId ?? action.entityId);
    return {
      title: `Workflow run · ${tag}`,
      subtitle: `${action.method} ${shortUrl(action.url)}`,
    };
  }

  if (action.entityType === "asset") {
    const tag = await assetLabel(action.entityId);
    const opHint = action.url.includes("/issues") ? "Issues update" : action.opType ?? action.method;
    return {
      title: `Asset ${tag}`,
      subtitle: `${opHint} · ${shortUrl(action.url)}`,
    };
  }

  if (assetId) {
    const tag = await assetLabel(assetId);
    return {
      title: `${action.entityType} · ${tag}`,
      subtitle: `${action.method} ${shortUrl(action.url)}`,
    };
  }

  return {
    title: action.entityType,
    subtitle: `${action.method} ${shortUrl(action.url)}`,
  };
}
