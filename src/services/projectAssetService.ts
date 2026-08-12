import axios from "axios";
import api from "./api";
import type { ProjectAsset, CreateProjectAssetInput, ProjectAssetStatus } from "../types/projectAsset";
import type { Project } from "../types/project";
import { entityDeleteAsset, entityGetAllAssets, entityGetAllProjects, entityGetAsset, entityGetWorkflowRunsByAsset, entityPutAsset, entityReplaceIssuesForAsset, pendingGetAll, referenceDataGet } from "./localDB";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { OfflineRun } from "./offlineStore";
import syncQueue from "./syncQueue";
import { AssetRepository } from "../repositories/AssetRepository";
import { isMobileNativePlatform } from "../utils/platform";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";
import { webCachedGet, invalidateWebCache, invalidateWebCacheByPrefix } from "./webFreshCache";
import { deriveOpenIssuesFromAsset } from "../utils/issueDerivation";
import type { User } from "../types/user";
import { shouldSkipRunMutation } from "./connectivityMonitor";
import { mediaStore } from "./mediaStore";
import { isOfflineNetworkError as isOfflineNetworkErrorShape } from "../utils/offlineNetworkError";
import offlineStore from "./offlineStore";
import { dashboardWorkspaceHasRows, dedupeDashboardWorkspaceItemsById, dashboardWorkspaceLayoutEqual } from "../utils/dashboardWorkspaceMerge";
import { bucketDashboardWorkspaceItems } from "../utils/dashboardWorkspaceBucket";
import type { PaginatedResult, ProjectAssetPageQuery } from "../types/paginatedList";

const DASHBOARD_WORKSPACE_CACHE_KEY = (userId: string) => `dashboard-workspace:${userId}`;

function isOfflineNetworkError(error: unknown): boolean {
  if (shouldSkipRunMutation()) return true;
  return isOfflineNetworkErrorShape(error);
}

async function persistAssetIssuesLocally(asset: ProjectAsset, dirty: boolean): Promise<ProjectAsset> {
  await entityPutAsset({
    id: asset.id,
    productId: asset.productId,
    projectId: asset.projectId,
    data: asset,
    dirty,
  });
  let projectMeta: { jobNumber?: string; customerName?: string } | undefined;
  if (isMobileNativePlatform() && asset.projectId) {
    const projects = await entityGetAllProjects() as Project[];
    const project = projects.find((p) => p.id === asset.projectId);
    if (project) {
      projectMeta = { jobNumber: project.jobNumber, customerName: project.customerName };
    }
  }
  const openRecords = deriveOpenIssuesFromAsset(asset, projectMeta);
  await entityReplaceIssuesForAsset(asset.id, openRecords);
  window.dispatchEvent(new Event("repo:issues:updated"));
  window.dispatchEvent(new Event("notifications:run-state-changed"));
  window.dispatchEvent(new Event("notifications:refresh"));
  return asset;
}

function normalizeStatus(raw: unknown): ProjectAssetStatus {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "inprogress" || value === "running") return "InProgress";
  if (value === "paused") return "Paused";
  if (value === "pending") return "Pending";
  if (value === "complete" || value === "completed" || value === "done") return "Complete";
  if (value === "closed") return "Closed";
  if (value === "cancelled" || value === "canceled") return "Cancelled";
  if (value === "issue" || value === "issues" || value === "missing") return "Issue";
  return "NotStarted";
}

function fromDto(dto: ProjectAsset): ProjectAsset {
  return { ...dto, status: normalizeStatus(dto.status) };
}

/** Return all asset IDs that have a pending action queued. */
export async function pendingAssetIds(): Promise<Set<string>> {
  if (!isMobileNativePlatform()) return new Set<string>();
  const all = await pendingGetAll();
  return new Set(all.filter((a) => a.entityType === "asset").map((a) => a.entityId));
}

function toOpenAssetItem(asset: ProjectAsset, projectById?: Map<string, Project>): OpenAssetItem {
  const project = projectById?.get(asset.projectId);
  return {
    id: asset.id,
    projectId: asset.projectId,
    jobNumber: project?.jobNumber ?? "",
    office: project?.office ?? (asset as unknown as { office?: string }).office ?? "",
    officeId: project?.officeId ?? (asset as unknown as { officeId?: string }).officeId,
    assetTag: asset.assetTag,
    assetName: asset.assetName,
    assetModel: asset.assetModel,
    manufacturer: (asset as unknown as { manufacturer?: string }).manufacturer,
    hasWorkflow: !!(asset as unknown as { workflowSummary?: unknown }).workflowSummary,
    status: asset.status,
    runStatus: (asset as unknown as { workflowSummary?: { latestRunStatus?: string } }).workflowSummary?.latestRunStatus,
    completedSteps:
      (asset as unknown as { workflowSummary?: { completedItems?: number; completedSteps?: number } }).workflowSummary?.completedItems
      ?? (asset as unknown as { workflowSummary?: { completedItems?: number; completedSteps?: number } }).workflowSummary?.completedSteps
      ?? 0,
    totalSteps: (asset as unknown as { workflowSummary?: { requiredItems?: number } }).workflowSummary?.requiredItems ?? 0,
    missingItems: (asset as unknown as { workflowSummary?: { missingItems?: number } }).workflowSummary?.missingItems ?? 0,
    evidenceStatus: (asset as unknown as { workflowSummary?: { evidenceStatus?: string } }).workflowSummary?.evidenceStatus,
    assignedUserId: (asset as unknown as { assignedUserId?: string }).assignedUserId,
    location: asset.location,
  } satisfies OpenAssetItem;
}

function buildActiveSummaryFromAssets(cached: ProjectAsset[]): ProjectAssetSummaryItem[] {
  const byProject = new Map<string, ProjectAssetSummaryItem>();
  for (const asset of cached) {
    let bucket = byProject.get(asset.projectId);
    if (!bucket) {
      bucket = { projectId: asset.projectId, notStarted: 0, inProgress: 0, complete: 0, total: 0 };
      byProject.set(asset.projectId, bucket);
    }
    bucket.total += 1;
    if (asset.status === "Complete" || asset.status === "Closed") bucket.complete += 1;
    else if (asset.status === "NotStarted") bucket.notStarted += 1;
    else bucket.inProgress += 1;
  }
  return [...byProject.values()];
}

async function buildTechnicianWorkloadSummaryFromLocal(): Promise<TechnicianWorkloadSummaryItem[]> {
  const [cached, users, projects] = await Promise.all([
    entityGetAllAssets() as Promise<ProjectAsset[]>,
    referenceDataGet<User[]>("users").then((data) => data ?? []),
    entityGetAllProjects() as Promise<Project[]>,
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const byUser = new Map<string, TechnicianWorkloadSummaryItem & { jobNumberSet: Set<string> }>();
  for (const asset of cached) {
    const userId = asset.assignedUserId;
    if (!userId) continue;
    let bucket = byUser.get(userId);
    if (!bucket) {
      const user = users.find((u) => u.id === userId);
      bucket = {
        userId,
        fullName: user?.fullName ?? "Unknown",
        paused: 0,
        inProgress: 0,
        notStarted: 0,
        totalAssigned: 0,
        jobNumbers: [],
        jobNumberSet: new Set<string>(),
        hasIssues: false,
        completedSteps: 0,
        totalSteps: 0,
        startedAt: undefined,
      };
      byUser.set(userId, bucket);
    }
    bucket.totalAssigned += 1;
    if (asset.status === "Paused") bucket.paused += 1;
    else if (asset.status === "NotStarted") bucket.notStarted += 1;
    else if (asset.status !== "Complete" && asset.status !== "Closed") bucket.inProgress += 1;
    const summary = asset.workflowSummary;
    if (summary?.hasOpenIssues) bucket.hasIssues = true;
    bucket.completedSteps += summary?.completedItems ?? 0;
    bucket.totalSteps += summary?.requiredItems ?? 0;
    if (summary?.latestRunStartedAt && (!bucket.startedAt || summary.latestRunStartedAt < bucket.startedAt)) {
      bucket.startedAt = summary.latestRunStartedAt;
    }
    const project = projectById.get(asset.projectId);
    if (project?.jobNumber) bucket.jobNumberSet.add(project.jobNumber);
  }
  return [...byUser.values()].map(({ jobNumberSet, ...rest }) => ({ ...rest, jobNumbers: [...jobNumberSet] }));
}

function buildDashboardWorkspaceFromAssets(
  cached: ProjectAsset[],
  userId?: string,
  projectById?: Map<string, Project>,
): DashboardWorkspace {
  const toWorkspaceItem = (asset: ProjectAsset): DashboardWorkspaceAssetItem => {
    const project = projectById?.get(asset.projectId);
    return {
    id: asset.id,
    projectId: asset.projectId,
    jobNumber: project?.jobNumber ?? "",
    assetTag: asset.assetTag,
    assetName: asset.assetName,
    assetModel: asset.assetModel,
    location: asset.location,
    status: asset.status,
    runStatus: (asset as unknown as { workflowSummary?: { latestRunStatus?: string } }).workflowSummary?.latestRunStatus,
    historyStatus: asset.status,
    completedSteps:
      (asset as unknown as { workflowSummary?: { completedItems?: number; completedSteps?: number } }).workflowSummary?.completedItems
      ?? (asset as unknown as { workflowSummary?: { completedItems?: number; completedSteps?: number } }).workflowSummary?.completedSteps
      ?? 0,
    totalSteps: (asset as unknown as { workflowSummary?: { requiredItems?: number } }).workflowSummary?.requiredItems ?? 0,
    missingItems: (asset as unknown as { workflowSummary?: { missingItems?: number } }).workflowSummary?.missingItems ?? 0,
    evidenceStatus: (asset as unknown as { workflowSummary?: { evidenceStatus?: string } }).workflowSummary?.evidenceStatus,
    assignedUserId: (asset as unknown as { assignedUserId?: string }).assignedUserId,
    workflowMode: (asset as unknown as { workflowMode?: string }).workflowMode ?? "",
    isDeleted: asset.isDeleted ?? false,
    deletedAtUtc: (asset as unknown as { deletedAtUtc?: string }).deletedAtUtc,
    deleteReason: (asset as unknown as { deleteReason?: string }).deleteReason,
    latestActivityAt: (asset as unknown as { latestActivityAt?: string }).latestActivityAt,
    completedAt: (asset as unknown as { completedAt?: string }).completedAt,
    hasOpenIssues:
      (asset as unknown as { hasOpenIssues?: boolean; workflowSummary?: { hasOpenIssues?: boolean } }).hasOpenIssues
      ?? (asset as unknown as { hasOpenIssues?: boolean; workflowSummary?: { hasOpenIssues?: boolean } }).workflowSummary?.hasOpenIssues
      ?? false,
    signatureStatus:
      (asset as unknown as { signatureStatus?: string; workflowSummary?: { signatureStatus?: string } }).signatureStatus
      ?? (asset as unknown as { signatureStatus?: string; workflowSummary?: { signatureStatus?: string } }).workflowSummary?.signatureStatus,
  };
  };

  const allItems = cached
    .map((asset) => toWorkspaceItem(asset))
    .filter((item) => !item.isDeleted);

  const userFiltered = userId
    ? allItems.filter((item) => item.assignedUserId === userId)
    : allItems;

  return bucketDashboardWorkspaceItems(userFiltered);
}

type CachedAssetRecord = {
  id: string;
  productId: string;
  projectId: string;
  data: unknown;
  dirty?: boolean;
};

/**
 * Mirror dashboard-workspace rows into the generic asset entity store so cold-start
 * offline rebuild (dashboardWorkspaceLocal) matches the last online dashboard view.
 * Skips dirty rows so offline edits are not clobbered.
 */
async function hydrateAssetsFromWorkspaceSnapshot(workspace: DashboardWorkspace): Promise<void> {
  if (!isMobileNativePlatform()) return;

  const flattened = [
    ...workspace.currentInstalls,
    ...workspace.currentInspections,
    ...workspace.installHistory,
    ...workspace.inspectionHistory,
  ];
  if (flattened.length === 0) return;

  const items = dedupeDashboardWorkspaceItemsById(flattened);
  await Promise.all(items.map(async (item) => {
    const existing = await entityGetAsset(item.id) as CachedAssetRecord | null;
    if (existing?.dirty) return;

    const base = existing?.data as ProjectAsset | undefined;
    if (!base?.productId && !existing?.productId) {
      try {
        const full = await projectAssetService.getById(item.id);
        if (full) {
          await entityPutAsset({
            id: full.id,
            productId: full.productId,
            projectId: full.projectId,
            data: full,
            dirty: false,
          });
          void import("./assetPrefetchService").then(({ prefetchAssetWorkflowData }) => {
            void prefetchAssetWorkflowData(full.id);
          });
        }
      } catch {
        // Non-fatal — workspace row still visible online.
      }
      return;
    }

    const productId = base?.productId ?? existing!.productId;
    const projectId = item.projectId || base?.projectId || existing!.projectId;
    const merged = {
      ...(base ?? {
        id: item.id,
        projectId,
        productId,
        assetTag: item.assetTag ?? "",
        status: "NotStarted" as const,
      }),
      id: item.id,
      projectId,
      productId,
      assetTag: item.assetTag ?? base?.assetTag ?? "",
      assetName: item.assetName ?? base?.assetName,
      assetModel: item.assetModel ?? base?.assetModel,
      location: item.location ?? base?.location,
      assignedUserId: item.assignedUserId ?? base?.assignedUserId,
      status: normalizeStatus(item.status ?? base?.status),
      isDeleted: item.isDeleted ?? base?.isDeleted,
      workflowSummary: {
        ...(base?.workflowSummary ?? {}),
        hasWorkflow: (item.totalSteps > 0) || base?.workflowSummary?.hasWorkflow || false,
        latestRunStatus: item.runStatus ?? base?.workflowSummary?.latestRunStatus,
        signatureStatus: item.signatureStatus ?? base?.workflowSummary?.signatureStatus,
        completedItems: item.completedSteps ?? base?.workflowSummary?.completedItems ?? 0,
        requiredItems: item.totalSteps ?? base?.workflowSummary?.requiredItems ?? 0,
        missingItems: item.missingItems ?? base?.workflowSummary?.missingItems ?? 0,
        evidenceStatus: item.evidenceStatus ?? base?.workflowSummary?.evidenceStatus,
        hasOpenIssues: item.hasOpenIssues ?? base?.workflowSummary?.hasOpenIssues ?? false,
      },
    } as ProjectAsset;

    await entityPutAsset({
      id: item.id,
      productId,
      projectId,
      data: merged,
      dirty: false,
    });

    if (productId || item.totalSteps > 0) {
      void import("./assetPrefetchService").then(({ prefetchAssetWorkflowData }) => {
        void prefetchAssetWorkflowData(item.id);
      });
    }
  }));
}

function pickLatestCachedRun(runs: AssetWorkflowRun[]): (AssetWorkflowRun & Partial<OfflineRun>) | undefined {
  if (runs.length === 0) return undefined;
  return runs.reduce((best, run) => {
    if (!best) return run;
    return new Date(run.startedAt).getTime() >= new Date(best.startedAt).getTime() ? run : best;
  }, runs[0]);
}

/**
 * Merge server workspace fields with local IndexedDB state without letting stale asset summaries
 * overwrite a fresh online fetch (e.g. archived CAD-0038 still InProgress locally).
 * Local dirty runs/assets still win for offline-first writes.
 */
export function reconcileWorkspaceItemWithLocal(
  item: DashboardWorkspaceAssetItem,
  asset: ProjectAsset,
  latestLocalRun?: AssetWorkflowRun & Partial<OfflineRun>,
): DashboardWorkspaceAssetItem {
  const summaryRunStatus = asset.workflowSummary?.latestRunStatus;
  const summarySignatureStatus = asset.workflowSummary?.signatureStatus;
  const localDirty = latestLocalRun?.dirty === true;

  const runStatus = localDirty
    ? (latestLocalRun?.status ?? item.runStatus ?? summaryRunStatus)
    : (item.runStatus ?? latestLocalRun?.status ?? summaryRunStatus);

  const signatureStatus = localDirty
    ? (summarySignatureStatus ?? item.signatureStatus)
    : (item.signatureStatus ?? summarySignatureStatus);

  const status = localDirty
    ? (asset.status ?? item.status)
    : (item.status ?? asset.status);

  return {
    ...item,
    status,
    historyStatus: status ?? item.historyStatus,
    runStatus,
    signatureStatus,
  };
}

/**
 * Re-buckets a persisted (frozen) dashboard-workspace snapshot against the freshest locally-known
 * asset status. A job completed offline after the snapshot was captured must still move from
 * "My Jobs Today" to "Job History" immediately - the snapshot alone can't reflect that, since it's
 * only refreshed on the next successful online fetch, but the generic asset cache (kept live by
 * every offline write path, e.g. applyOfflineAssetStatusUpdate) already has the true status.
 */
async function reconcileWorkspaceWithLocalStatus(data: DashboardWorkspace): Promise<DashboardWorkspace> {
  const flattened = [
    ...data.currentInstalls, ...data.currentInspections,
    ...data.installHistory, ...data.inspectionHistory,
  ];
  if (flattened.length === 0) return data;

  const deduped = dedupeDashboardWorkspaceItemsById(flattened);
  let changed = deduped.length !== flattened.length;

  const reconciled = await Promise.all(deduped.map(async (item) => {
    const cached = await entityGetAsset(item.id);
    const asset = cached?.data as ProjectAsset | undefined;
    if (!asset) return item;

    const localRuns = (await entityGetWorkflowRunsByAsset(item.id)) as AssetWorkflowRun[];
    const latestLocalRun = pickLatestCachedRun(localRuns) as (AssetWorkflowRun & Partial<OfflineRun>) | undefined;
    const next = reconcileWorkspaceItemWithLocal(item, asset, latestLocalRun);

    if (
      next.status !== item.status
      || next.runStatus !== item.runStatus
      || next.signatureStatus !== item.signatureStatus
    ) {
      changed = true;
    }
    return next;
  }));

  const rebucketed = bucketDashboardWorkspaceItems(reconciled);
  if (!changed && dashboardWorkspaceLayoutEqual(data, rebucketed)) return data;
  return rebucketed;
}

export const projectAssetService = {
  async listByProject(projectId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    try { return await AssetRepository.getByProject(projectId, includeDeleted); }
    catch { return []; }
  },

  /** Network-first project list for native prefetch (avoids stale local-first gap after SSE). */
  async listByProjectFresh(projectId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    if (!isMobileNativePlatform()) {
      return this.listByProject(projectId, includeDeleted);
    }
    try {
      const { shouldSkipBlockingFetch } = await import("./connectivityMonitor");
      if (shouldSkipBlockingFetch()) {
        return await this.listByProject(projectId, includeDeleted);
      }
      const res = await api.get<ProjectAsset[]>(`/project-assets/by-project/${projectId}`, {
        params: { includeDeleted: includeDeleted || undefined },
      });
      const { entityReplaceAssetsByProject, syncMetaSet } = await import("./localDB");
      await entityReplaceAssetsByProject(
        projectId,
        res.data.map((a) => ({ id: a.id, productId: a.productId, projectId: a.projectId, data: fromDto(a) })),
      );
      await syncMetaSet("assets");
      window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { projectId } }));
      return res.data.map(fromDto);
    } catch {
      return await this.listByProject(projectId, includeDeleted);
    }
  },

  async listByProjectPage(
    projectId: string,
    query: ProjectAssetPageQuery = {},
  ): Promise<PaginatedResult<ProjectAsset>> {
    try { return await AssetRepository.getByProjectPage(projectId, query); }
    catch {
      return { items: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 50, hasMore: false };
    }
  },

  async listByProduct(productId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    try { return await AssetRepository.getByProduct(productId, includeDeleted); }
    catch { return []; }
  },

  async listLocalByProduct(productId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    try { return await AssetRepository.getLocalByProduct(productId, includeDeleted); }
    catch { return []; }
  },

  async listLocalByProject(projectId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    try { return await AssetRepository.getLocalByProject(projectId, includeDeleted); }
    catch { return []; }
  },

  async create(input: CreateProjectAssetInput): Promise<ProjectAsset> {
    const res = await api.post<ProjectAsset>("/project-assets", input);
    const asset = fromDto(res.data);
    if (isMobileNativePlatform()) {
      await entityPutAsset({ id: asset.id, productId: asset.productId, projectId: asset.projectId, data: asset });
      void import("./assetPrefetchService").then(({ prefetchAssetWorkflowData }) => {
        void prefetchAssetWorkflowData(asset.id);
      });
    } else {
      invalidateWebCacheByPrefix("/project-assets/by-product/");
      invalidateWebCacheByPrefix("/project-assets/by-project/");
      window.dispatchEvent(new CustomEvent("repo:assets:updated", {
        detail: { assetId: asset.id, productId: asset.productId, projectId: asset.projectId },
      }));
    }
    return asset;
  },

  async bulkCreate(projectId: string, productId: string, assets: CreateProjectAssetInput[]): Promise<ProjectAsset[]> {
    const res = await api.post<ProjectAsset[]>("/project-assets/bulk", { projectId, productId, assets });
    const created = res.data.map(fromDto);
    if (isMobileNativePlatform()) {
      await Promise.all(created.map((a) => entityPutAsset({ id: a.id, productId: a.productId, projectId: a.projectId, data: a })));
      void import("./assetPrefetchService").then(({ prefetchAssetIds }) => {
        void prefetchAssetIds(created.map((a) => a.id));
      });
    } else {
      invalidateWebCacheByPrefix("/project-assets/by-product/");
      invalidateWebCacheByPrefix("/project-assets/by-project/");
      if (created[0]) {
        window.dispatchEvent(new CustomEvent("repo:assets:updated", {
          detail: {
            assetId: created[0].id,
            productId: created[0].productId,
            projectId: created[0].projectId,
          },
        }));
      }
    }
    return created;
  },

  async getByIdLocalFirst(id: string): Promise<ProjectAsset | null> {
    return this.getById(id);
  },

  async getById(id: string): Promise<ProjectAsset | null> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(`/project-assets/${id}`, async () => {
        const res = await api.get<ProjectAsset>(`/project-assets/${id}`);
        return fromDto(res.data);
      });
    }

    const local = await entityGetAsset(id);
    if (local) {
      // Only refresh in the background when there is actually a link to refresh
      // over. Without this guard an offline phone fired a doomed request on
      // EVERY getById - and getById is called per asset on hot paths (card taps,
      // quick actions, run launches), so a single offline screen could queue a
      // burst of requests that each burn the full 10s API timeout before failing.
      // Matches the guard already used by workflowConfigService, userService and
      // officesService for their background refreshes.
      if (!shouldSkipBlockingFetch()) {
        void api.get<ProjectAsset>(`/project-assets/${id}`)
          .then(async (res) => {
            const asset = fromDto(res.data);
            await entityPutAsset({ id: asset.id, productId: asset.productId, projectId: asset.projectId, data: asset });
            window.dispatchEvent(new CustomEvent("repo:assets:updated", {
              detail: { assetId: asset.id, productId: asset.productId, projectId: asset.projectId },
            }));
          })
          .catch(() => {});
      }
      return fromDto(local.data as ProjectAsset);
    }

    // No cached copy. Offline there is nothing to fetch and nothing to fall back
    // to, so the request can only fail - short-circuit to the same null answer
    // instead of paying the full API timeout to get there.
    if (shouldSkipBlockingFetch()) return null;

    try {
      const res = await api.get<ProjectAsset>(`/project-assets/${id}`);
      const asset = fromDto(res.data);
      await entityPutAsset({ id: asset.id, productId: asset.productId, projectId: asset.projectId, data: asset });
      return asset;
    } catch {
      return null;
    }
  },

  async update(id: string, patch: Partial<CreateProjectAssetInput> & { status?: string; workOrderId?: string }): Promise<ProjectAsset> {
    if (!isMobileNativePlatform()) {
      const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
      // A write happened - invalidate BOTH the single-asset cache AND the
      // by-project/by-product LIST caches, or the asset lists (e.g. the assigned-
      // technician column) keep serving a stale pre-edit snapshot for up to the
      // cache TTL and the change appears to "revert". Mirrors AssetRepository.update.
      invalidateWebCache(`/project-assets/${id}`);
      invalidateWebCacheByPrefix("/project-assets/by-product/");
      invalidateWebCacheByPrefix("/project-assets/by-project/");
      const asset = fromDto(res.data);
      window.dispatchEvent(new CustomEvent("repo:assets:updated", {
        detail: { productId: asset.productId, projectId: asset.projectId },
      }));
      if (patch.status !== undefined || patch.issuesJson !== undefined) {
        window.dispatchEvent(new Event("notifications:run-state-changed"));
        window.dispatchEvent(new Event("notifications:refresh"));
      }
      return asset;
    }

    const result = await AssetRepository.update(id, patch as Partial<ProjectAsset> & Record<string, unknown>);
    if (result === null) {
      // Queued with no local row to merge - re-read after a list refresh may still fail;
      // return a minimal optimistic object so takeover/start flows can proceed in-session.
      const local = await entityGetAsset(id);
      const data = local?.data as ProjectAsset | undefined;
      if (data) {
        const optimistic = fromDto({ ...data, ...patch } as ProjectAsset);
        window.dispatchEvent(new CustomEvent("repo:assets:updated", {
          detail: { productId: optimistic.productId, projectId: optimistic.projectId },
        }));
        return optimistic;
      }
      throw new Error("Offline - asset not cached yet; open this project once while online");
    }
    window.dispatchEvent(new CustomEvent("repo:assets:updated", {
      detail: { productId: result.productId, projectId: result.projectId },
    }));
    if (patch.status !== undefined || patch.issuesJson !== undefined) {
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
    }
    return result;
  },

  async patchIssues(id: string, issuesJson: string): Promise<ProjectAsset> {
    if (!isMobileNativePlatform()) {
      const res = await api.patch<ProjectAsset>(`/project-assets/${id}/issues`, { issuesJson });
      invalidateWebCache(`/project-assets/${id}`);
      return fromDto(res.data);
    }

    const body = { issuesJson };
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const requestBody = await mediaStore.resolveUploadPayload(body);
      const res = await api.patch<ProjectAsset>(`/project-assets/${id}/issues`, requestBody);
      const asset = fromDto(res.data);
      return await persistAssetIssuesLocally(asset, false);
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const local = await entityGetAsset(id);
      if (!local) {
        throw new Error("Offline - asset not cached yet; open this project once while online");
      }

      const persistedIssuesJson = await mediaStore.persistIssueMediaInJson(issuesJson, id);
      const merged = fromDto({
        ...(local.data as ProjectAsset),
        issuesJson: persistedIssuesJson,
      });
      await persistAssetIssuesLocally(merged, true);
      await syncQueue.enqueue({
        opType: "ASSET_UPDATE",
        url: `/project-assets/${id}/issues`,
        method: "PATCH",
        entityType: "asset",
        entityId: id,
        body: { issuesJson: persistedIssuesJson },
        optimisticPatch: { issuesJson: persistedIssuesJson },
        snapshotUpdatedAt: merged.updatedAt,
      });
      window.dispatchEvent(new CustomEvent("repo:assets:updated", {
        detail: { productId: merged.productId, projectId: merged.projectId },
      }));
      return merged;
    }
  },

  // Assign/claim an asset via the narrow, installer-permitted endpoint.
  // The broad update() (PUT) is Admin/PM-only, so an installer's takeover used to
  // 403. AssignedUserId drives BOTH the Assets installer column AND the Dashboard
  // "My Jobs Today" query, so this must persist for the job to appear in the new
  // owner's dashboard.
  async patchAssignment(id: string, assignedUserId: string | null): Promise<ProjectAsset> {
    if (!isMobileNativePlatform()) {
      const res = await api.patch<ProjectAsset>(`/project-assets/${id}/assignment`, { assignedUserId });
      invalidateWebCache(`/project-assets/${id}`);
      const asset = fromDto(res.data);
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return asset;
    }

    const body = { assignedUserId };
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const res = await api.patch<ProjectAsset>(`/project-assets/${id}/assignment`, body);
      const asset = fromDto(res.data);
      await entityPutAsset({ id: asset.id, productId: asset.productId, projectId: asset.projectId, data: asset });
      window.dispatchEvent(new CustomEvent("repo:assets:updated", {
        detail: { productId: asset.productId, projectId: asset.projectId },
      }));
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return asset;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const local = await entityGetAsset(id);
      if (!local) {
        throw new Error("Offline - asset not cached yet; open this project once while online");
      }

      const merged = fromDto({
        ...(local.data as ProjectAsset),
        assignedUserId: assignedUserId ?? undefined,
      });
      await entityPutAsset({
        id: merged.id,
        productId: merged.productId,
        projectId: merged.projectId,
        data: merged,
        dirty: true,
      });
      await syncQueue.enqueue({
        opType: "ASSET_UPDATE",
        url: `/project-assets/${id}/assignment`,
        method: "PATCH",
        entityType: "asset",
        entityId: id,
        body,
        optimisticPatch: { assignedUserId },
        snapshotUpdatedAt: merged.updatedAt,
      });
      window.dispatchEvent(new CustomEvent("repo:assets:updated", {
        detail: { productId: merged.productId, projectId: merged.projectId },
      }));
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return merged;
    }
  },

  async remove(id: string): Promise<void> {
    if (!isMobileNativePlatform()) {
      await api.delete(`/project-assets/${id}`);
      // Only the single-asset key used to be dropped, so the very next list fetch was
      // served from the still-cached by-project/by-product entries and the deleted row
      // reappeared until the user reloaded by hand. Mirror create/update: clear the list
      // caches and announce the change so open views re-read.
      invalidateWebCache(`/project-assets/${id}`);
      invalidateWebCacheByPrefix("/project-assets/by-product/");
      invalidateWebCacheByPrefix("/project-assets/by-project/");
      window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { assetId: id } }));
      return;
    }

    try {
      await api.delete(`/project-assets/${id}`);
      await entityDeleteAsset(id);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        await entityDeleteAsset(id);
        return;
      }
      // No response = network unreachable - delete locally and queue for server
      if (isOfflineNetworkError(error)) {
        await entityDeleteAsset(id);
        await syncQueue.enqueue({
          opType: "ASSET_DELETE",
          url: `/project-assets/${id}`,
          method: "DELETE",
          entityType: "asset",
          entityId: id,
          optimisticPatch: {},
        });
        return;
      }
      throw error;
    }
  },

  async workloadSummary(): Promise<WorkloadSummaryItem[]> {
    try {
      const res = await api.get<WorkloadSummaryItem[]>("/project-assets/workload-summary");
      return res.data;
    } catch {
      return [];
    }
  },

  async technicianWorkloadSummaryLocal(): Promise<TechnicianWorkloadSummaryItem[]> {
    if (!isMobileNativePlatform()) return [];
    try {
      return await buildTechnicianWorkloadSummaryFromLocal();
    } catch {
      return [];
    }
  },

  async technicianWorkloadSummary(): Promise<TechnicianWorkloadSummaryItem[]> {
    if (isMobileNativePlatform()) {
      const local = await this.technicianWorkloadSummaryLocal();
      if (local.length > 0) {
        if (!shouldSkipBlockingFetch()) {
          void api.get<TechnicianWorkloadSummaryItem[]>("/project-assets/technician-workload-summary")
            .then(() => {})
            .catch(() => {});
        }
        return local;
      }
      if (shouldSkipBlockingFetch()) return local;
    }
    try {
      const res = await api.get<TechnicianWorkloadSummaryItem[]>("/project-assets/technician-workload-summary");
      return res.data;
    } catch {
      if (!isMobileNativePlatform()) return [];
      try {
        return await buildTechnicianWorkloadSummaryFromLocal();
      } catch {
        return [];
      }
    }
  },

  async activeSummaryLocal(): Promise<ProjectAssetSummaryItem[]> {
    if (!isMobileNativePlatform()) return [];
    try {
      const cached = await entityGetAllAssets() as ProjectAsset[];
      return buildActiveSummaryFromAssets(cached);
    } catch {
      return [];
    }
  },

  async activeSummary(): Promise<ProjectAssetSummaryItem[]> {
    if (isMobileNativePlatform()) {
      const local = await this.activeSummaryLocal();
      if (local.length > 0) {
        if (!shouldSkipBlockingFetch()) {
          void api.get<ProjectAssetSummaryItem[]>("/project-assets/active-summary")
            .then(() => {})
            .catch(() => {});
        }
        return local;
      }
      if (shouldSkipBlockingFetch()) return local;
    }
    try {
      const res = await api.get<ProjectAssetSummaryItem[]>("/project-assets/active-summary");
      return res.data;
    } catch {
      if (!isMobileNativePlatform()) return [];
      try {
        return await this.activeSummaryLocal();
      } catch {
        return [];
      }
    }
  },

  async myProjectIds(): Promise<string[]> {
    if (isMobileNativePlatform() && shouldSkipBlockingFetch()) {
      try {
        const cached = await entityGetAllAssets() as ProjectAsset[];
        return Array.from(new Set(cached.map((a) => a.projectId).filter(Boolean)));
      } catch {
        return [];
      }
    }

    try {
      const res = await api.get<string[]>("/project-assets/my-project-ids");
      return res.data;
    } catch {
      if (isMobileNativePlatform()) {
        try {
          const cached = await entityGetAllAssets() as ProjectAsset[];
          return Array.from(new Set(cached.map((a) => a.projectId).filter(Boolean)));
        } catch {
          return [];
        }
      }
      return [];
    }
  },

  async listOpenLocal(): Promise<OpenAssetItem[]> {
    if (!isMobileNativePlatform()) return [];
    try {
      const [cached, projects] = await Promise.all([
        entityGetAllAssets(),
        entityGetAllProjects() as Promise<Project[]>,
      ]);
      const projectById = new Map(projects.map((p) => [p.id, p]));
      return cached
        .map((asset) => toOpenAssetItem(asset as ProjectAsset, projectById))
        .filter((asset) => asset.status !== "Complete" && asset.status !== "Closed");
    } catch {
      return [];
    }
  },

  async listOpen(): Promise<OpenAssetItem[]> {
    if (isMobileNativePlatform()) {
      const local = await this.listOpenLocal();
      if (local.length > 0) {
        if (!shouldSkipBlockingFetch()) {
          void api.get<OpenAssetItem[]>("/project-assets/open")
            .then(() => {})
            .catch(() => {});
        }
        return local;
      }
      if (shouldSkipBlockingFetch()) return local;
    }
    try {
      const res = await api.get<OpenAssetItem[]>("/project-assets/open");
      return res.data;
    } catch {
      if (isMobileNativePlatform()) return await this.listOpenLocal();
      return [];
    }
  },

  async dashboardWorkspaceLocal(userId?: string): Promise<DashboardWorkspace> {
    if (!isMobileNativePlatform()) {
      return {
        currentInstalls: [],
        currentInspections: [],
        installHistory: [],
        inspectionHistory: [],
      };
    }

    try {
      const [cached, projects] = await Promise.all([
        entityGetAllAssets() as Promise<ProjectAsset[]>,
        entityGetAllProjects() as Promise<Project[]>,
      ]);
      const projectById = new Map(projects.map((p) => [p.id, p]));
      const built = buildDashboardWorkspaceFromAssets(cached, userId, projectById);
      return await reconcileWorkspaceWithLocalStatus(built);
    } catch {
      return {
        currentInstalls: [],
        currentInspections: [],
        installHistory: [],
        inspectionHistory: [],
      };
    }
  },

  /**
   * Native offline cold-start path: read the persisted dashboard-workspace snapshot
   * (saved on the last successful online fetch) before falling back to entity rebuild.
   * Survives app kill; unlike dashboardCache (in-memory only).
   */
  async dashboardWorkspaceOfflineFirst(userId?: string): Promise<DashboardWorkspace> {
    if (!isMobileNativePlatform()) {
      return {
        currentInstalls: [],
        currentInspections: [],
        installHistory: [],
        inspectionHistory: [],
      };
    }

    if (userId) {
      const cached = await offlineStore.getCache<DashboardWorkspace>(DASHBOARD_WORKSPACE_CACHE_KEY(userId));
      if (cached && dashboardWorkspaceHasRows(cached)) {
        return await reconcileWorkspaceWithLocalStatus(cached);
      }
    }

    return await this.dashboardWorkspaceLocal(userId);
  },

  async dashboardWorkspace(userId?: string, options?: { light?: boolean }): Promise<DashboardWorkspace> {
    try {
      const params: Record<string, string | boolean> = {};
      if (userId) params.userId = userId;
      if (options?.light) params.light = true;

      const res = await api.get<DashboardWorkspace>("/project-assets/dashboard-workspace", {
        params: Object.keys(params).length > 0 ? params : undefined,
      });
      // Persist the full response for offline reuse. This endpoint doesn't go through the
      // generic AssetRepository/entityReplaceAssetsByProduct cache, so an asset only ever seen
      // via the Dashboard (never independently opened via Projects/Assets) would otherwise have
      // no offline copy at all once dashboardCache's in-memory, restart-clearing cache is gone.
      if (isMobileNativePlatform() && userId && dashboardWorkspaceHasRows(res.data)) {
        await offlineStore.saveCache(DASHBOARD_WORKSPACE_CACHE_KEY(userId), res.data);
        await hydrateAssetsFromWorkspaceSnapshot(res.data);
        void import("./assetPrefetchService").then(({ prefetchAssignedAssetsFromWorkspace }) => {
          void prefetchAssignedAssetsFromWorkspace(res.data, userId);
        });
      }
      if (isMobileNativePlatform()) {
        return await reconcileWorkspaceWithLocalStatus(res.data);
      }
      return res.data;
    } catch {
      if (isMobileNativePlatform()) {
        return await this.dashboardWorkspaceOfflineFirst(userId);
      }
      throw new Error("dashboard-workspace-failed");
    }
  },

  // restore/purge change list membership exactly like remove does, so they need the same
  // invalidation — otherwise a restored asset stays missing (and a purged one stays
  // present) until a manual reload.
  async restore(id: string): Promise<ProjectAsset> {
    const res = await api.post<ProjectAsset>(`/project-assets/${id}/restore`);
    const asset = fromDto(res.data);
    if (!isMobileNativePlatform()) {
      invalidateWebCache(`/project-assets/${id}`);
      invalidateWebCacheByPrefix("/project-assets/by-product/");
      invalidateWebCacheByPrefix("/project-assets/by-project/");
      window.dispatchEvent(new CustomEvent("repo:assets:updated", {
        detail: { assetId: asset.id, productId: asset.productId, projectId: asset.projectId },
      }));
    }
    return asset;
  },

  async purge(id: string): Promise<void> {
    await api.delete(`/project-assets/${id}/purge`);
    if (isMobileNativePlatform()) {
      await entityDeleteAsset(id);
    } else {
      invalidateWebCache(`/project-assets/${id}`);
      invalidateWebCacheByPrefix("/project-assets/by-product/");
      invalidateWebCacheByPrefix("/project-assets/by-project/");
      window.dispatchEvent(new CustomEvent("repo:assets:updated", { detail: { assetId: id } }));
    }
  },
};

export interface OpenAssetItem {
  id: string;
  projectId: string;
  jobNumber: string;
  office: string;
  officeId?: string;
  assetTag?: string;
  assetName?: string;
  assetModel?: string;
  manufacturer?: string;
  hasWorkflow: boolean;
  status: string;
  runStatus?: string;
  completedSteps: number;
  totalSteps: number;
  missingItems: number;
  evidenceStatus?: string;
  assignedUserId?: string;
  location?: string;
}

export interface WorkloadSummaryItem {
  userId: string;
  fullName: string;
  notStarted: number;
  inProgress: number;
  paused: number;
  totalAssigned: number;
  jobNumbers: string[];
  hasIssues: boolean;
  completedSteps: number;
  totalSteps: number;
  startedAt?: string;
}

export interface TechnicianWorkloadSummaryItem {
  userId: string;
  fullName: string;
  paused: number;
  inProgress: number;
  notStarted: number;
  totalAssigned: number;
  jobNumbers: string[];
  hasIssues: boolean;
  completedSteps: number;
  totalSteps: number;
  startedAt?: string;
}

export interface ProjectAssetSummaryItem {
  projectId: string;
  notStarted: number;
  inProgress: number;
  complete: number;
  total: number;
}

export interface DashboardWorkspaceAssetItem {
  id: string;
  projectId: string;
  jobNumber: string;
  assetTag?: string;
  assetName?: string;
  assetModel?: string;
  location?: string;
  status: string;
  runStatus?: string;
  historyStatus: string;
  completedSteps: number;
  totalSteps: number;
  missingItems: number;
  evidenceStatus?: string;
  assignedUserId?: string;
  workflowMode: string;
  isDeleted: boolean;
  deletedAtUtc?: string;
  deleteReason?: string;
  latestActivityAt?: string;
  completedAt?: string;
  hasOpenIssues: boolean;
  signatureStatus?: string;
}

export interface DashboardWorkspace {
  currentInstalls: DashboardWorkspaceAssetItem[];
  currentInspections: DashboardWorkspaceAssetItem[];
  installHistory: DashboardWorkspaceAssetItem[];
  inspectionHistory: DashboardWorkspaceAssetItem[];
}

