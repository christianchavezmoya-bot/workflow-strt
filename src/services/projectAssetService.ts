import axios from "axios";
import api from "./api";
import type { ProjectAsset, CreateProjectAssetInput, ProjectAssetStatus } from "../types/projectAsset";
import type { Project } from "../types/project";
import { entityDeleteAsset, entityGetAllAssets, entityGetAllProjects, entityGetAsset, entityPutAsset, entityReplaceIssuesForAsset, pendingGetAll, referenceDataGet } from "./localDB";
import syncQueue from "./syncQueue";
import { AssetRepository } from "../repositories/AssetRepository";
import { isMobileNativePlatform } from "../utils/platform";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";
import { webCachedGet, invalidateWebCache, invalidateWebCacheByPrefix } from "./webFreshCache";
import { deriveOpenIssuesFromAsset } from "../utils/issueDerivation";
import type { User } from "../types/user";

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

function toOpenAssetItem(asset: ProjectAsset): OpenAssetItem {
  return {
    id: asset.id,
    projectId: asset.projectId,
    jobNumber: (asset as unknown as { jobNumber?: string }).jobNumber ?? "",
    office: (asset as unknown as { office?: string }).office ?? "",
    officeId: (asset as unknown as { officeId?: string }).officeId,
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

function buildDashboardWorkspaceFromAssets(cached: ProjectAsset[], userId?: string): DashboardWorkspace {
  const toWorkspaceItem = (asset: ProjectAsset): DashboardWorkspaceAssetItem => ({
    id: asset.id,
    projectId: asset.projectId,
    jobNumber: (asset as unknown as { jobNumber?: string }).jobNumber ?? "",
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
  });

  const allItems = cached
    .map((asset) => toWorkspaceItem(asset))
    .filter((item) => !item.isDeleted && item.status !== "Cancelled" && item.status !== "Closed");

  const userFiltered = userId
    ? allItems.filter((item) => item.assignedUserId === userId)
    : allItems;

  const isInstallationWorkflow = (mode?: string) =>
    !mode || mode === "INSTALLATION_ONLY" || mode === "MIXED";
  const isInspectionWorkflow = (mode?: string) =>
    mode === "INSPECTION_ONLY" || mode === "MIXED";

  const isCurrent = (item: DashboardWorkspaceAssetItem) =>
    item.status !== "Complete" && item.status !== "Completed" && item.status !== "Closed";

  const isHistory = (item: DashboardWorkspaceAssetItem) =>
    item.status === "Complete" || item.status === "Completed";

  return {
    currentInstalls: userFiltered.filter((item) => isCurrent(item) && isInstallationWorkflow(item.workflowMode)),
    currentInspections: userFiltered.filter((item) => isCurrent(item) && isInspectionWorkflow(item.workflowMode)),
    installHistory: userFiltered.filter((item) => isHistory(item) && isInstallationWorkflow(item.workflowMode)),
    inspectionHistory: userFiltered.filter((item) => isHistory(item) && isInspectionWorkflow(item.workflowMode)),
  };
}

export const projectAssetService = {
  async listByProject(projectId: string, includeDeleted = false): Promise<ProjectAsset[]> {
    try { return await AssetRepository.getByProject(projectId, includeDeleted); }
    catch { return []; }
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
    }
    return asset;
  },

  async bulkCreate(projectId: string, productId: string, assets: CreateProjectAssetInput[]): Promise<ProjectAsset[]> {
    const res = await api.post<ProjectAsset[]>("/project-assets/bulk", { projectId, productId, assets });
    const created = res.data.map(fromDto);
    if (isMobileNativePlatform()) {
      await Promise.all(created.map((a) => entityPutAsset({ id: a.id, productId: a.productId, projectId: a.projectId, data: a })));
    }
    return created;
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
    const res = await api.patch<ProjectAsset>(`/project-assets/${id}/issues`, { issuesJson });
    const asset = fromDto(res.data);
    if (isMobileNativePlatform()) {
      await entityPutAsset({ id: asset.id, productId: asset.productId, projectId: asset.projectId, data: asset });
      // Sync the issues store so Issues Board reflects this change even while offline.
      // Write only open (unresolved) issues - resolved ones are excluded from the
      // server's open-issues response and Issues Board only shows open ones.
      // Fix: must call this even when openRecords is empty (every issue just
      // resolved) - entityReplaceIssuesForAsset correctly removes stale closed
      // entries; the old entityPutIssues-only call never deleted anything,
      // leaving resolved issues stuck in the store indefinitely while offline.
      const openRecords = deriveOpenIssuesFromAsset(asset);
      await entityReplaceIssuesForAsset(asset.id, openRecords);
      window.dispatchEvent(new Event("repo:issues:updated"));
    } else {
      invalidateWebCache(`/project-assets/${id}`);
    }
    window.dispatchEvent(new Event("notifications:run-state-changed"));
    window.dispatchEvent(new Event("notifications:refresh"));
    return asset;
  },

  // Assign/claim an asset via the narrow, installer-permitted endpoint.
  // The broad update() (PUT) is Admin/PM-only, so an installer's takeover used to
  // 403. AssignedUserId drives BOTH the Assets installer column AND the Dashboard
  // "My Jobs Today" query, so this must persist for the job to appear in the new
  // owner's dashboard.
  async patchAssignment(id: string, assignedUserId: string | null): Promise<ProjectAsset> {
    const res = await api.patch<ProjectAsset>(`/project-assets/${id}/assignment`, { assignedUserId });
    const asset = fromDto(res.data);
    if (isMobileNativePlatform()) {
      await entityPutAsset({ id: asset.id, productId: asset.productId, projectId: asset.projectId, data: asset });
      window.dispatchEvent(new CustomEvent("repo:assets:updated", {
        detail: { productId: asset.productId, projectId: asset.projectId },
      }));
    } else {
      invalidateWebCache(`/project-assets/${id}`);
    }
    window.dispatchEvent(new Event("notifications:run-state-changed"));
    window.dispatchEvent(new Event("notifications:refresh"));
    return asset;
  },

  async remove(id: string): Promise<void> {
    if (!isMobileNativePlatform()) {
      await api.delete(`/project-assets/${id}`);
      invalidateWebCache(`/project-assets/${id}`);
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
      if (axios.isAxiosError(error) && !error.response) {
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
    try {
      const res = await api.get<string[]>("/project-assets/my-project-ids");
      return res.data;
    } catch {
      return [];
    }
  },

  async listOpenLocal(): Promise<OpenAssetItem[]> {
    if (!isMobileNativePlatform()) return [];
    try {
      const cached = await entityGetAllAssets();
      return cached
        .map((asset) => toOpenAssetItem(asset as ProjectAsset))
        .filter((asset) => asset.status !== "Complete" && asset.status !== "Closed");
    } catch {
      return [];
    }
  },

  async listOpen(): Promise<OpenAssetItem[]> {
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
      const cached = await entityGetAllAssets() as ProjectAsset[];
      return buildDashboardWorkspaceFromAssets(cached, userId);
    } catch {
      return {
        currentInstalls: [],
        currentInspections: [],
        installHistory: [],
        inspectionHistory: [],
      };
    }
  },

  async dashboardWorkspace(userId?: string, options?: { light?: boolean }): Promise<DashboardWorkspace> {
    try {
      const params: Record<string, string | boolean> = {};
      if (userId) params.userId = userId;
      if (options?.light) params.light = true;

      const res = await api.get<DashboardWorkspace>("/project-assets/dashboard-workspace", {
        params: Object.keys(params).length > 0 ? params : undefined,
      });
      return res.data;
    } catch {
      if (isMobileNativePlatform()) return await this.dashboardWorkspaceLocal(userId);
      throw new Error("dashboard-workspace-failed");
    }
  },

  async restore(id: string): Promise<ProjectAsset> {
    const res = await api.post<ProjectAsset>(`/project-assets/${id}/restore`);
    return fromDto(res.data);
  },

  async purge(id: string): Promise<void> {
    await api.delete(`/project-assets/${id}/purge`);
    if (isMobileNativePlatform()) {
      await entityDeleteAsset(id);
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

