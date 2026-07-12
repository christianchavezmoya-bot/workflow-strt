import axios from "axios";
import api from "./api";
import type { ProjectAsset, CreateProjectAssetInput, ProjectAssetStatus } from "../types/projectAsset";
import type { Project } from "../types/project";
import { entityDeleteAsset, entityGetAllAssets, entityGetAllProjects, entityGetAsset, entityPutAsset, entityReplaceIssuesForAsset, pendingAdd, pendingGetAll } from "./localDB";
import { AssetRepository } from "../repositories/AssetRepository";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, invalidateWebCache, invalidateWebCacheByPrefix } from "./webFreshCache";
import { deriveOpenIssuesFromAsset } from "../utils/issueDerivation";
import { userService } from "./userService";

function normalizeStatus(raw: unknown): ProjectAssetStatus {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "inprogress" || value === "running") return "InProgress";
  if (value === "paused") return "Paused";
  if (value === "pending") return "Pending";
  if (value === "complete" || value === "completed" || value === "done") return "Complete";
  if (value === "closed") return "Closed";
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

    try {
      const res = await api.get<ProjectAsset>(`/project-assets/${id}`);
      return fromDto(res.data);
    } catch {
      const local = await entityGetAsset(id);
      return local ? fromDto(local.data as ProjectAsset) : null;
    }
  },

  async update(id: string, patch: Partial<CreateProjectAssetInput> & { status?: string; workOrderId?: string }): Promise<ProjectAsset> {
    if (!isMobileNativePlatform()) {
      const res = await api.put<ProjectAsset>(`/project-assets/${id}`, patch);
      // A write happened — invalidate BOTH the single-asset cache AND the
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
      // Queued with no local row to merge — re-read after a list refresh may still fail;
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
      throw new Error("Offline — asset not cached yet; open this project once while online");
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
      // Write only open (unresolved) issues — resolved ones are excluded from the
      // server's open-issues response and Issues Board only shows open ones.
      // Fix: must call this even when openRecords is empty (every issue just
      // resolved) — entityReplaceIssuesForAsset correctly removes stale closed
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
      // No response = network unreachable — delete locally and queue for server
      if (axios.isAxiosError(error) && !error.response) {
        await entityDeleteAsset(id);
        await pendingAdd({
          id: crypto.randomUUID(),
          url: `/project-assets/${id}`,
          method: "DELETE",
          body: undefined,
          entityType: "asset",
          entityId: id,
          optimisticPatch: {},
          createdAt: new Date().toISOString(),
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

  async technicianWorkloadSummary(): Promise<TechnicianWorkloadSummaryItem[]> {
    try {
      const res = await api.get<TechnicianWorkloadSummaryItem[]>("/project-assets/technician-workload-summary");
      return res.data;
    } catch {
      // Offline fallback: grouped from cached assets. paused/inProgress/
      // notStarted/totalAssigned/jobNumbers/hasIssues/startedAt come straight
      // from each asset's own cached record (including workflowSummary,
      // already synced per-asset), so these are accurate. completedSteps/
      // totalSteps are summed from workflowSummary.completedItems/requiredItems
      // across the technician's assigned assets — a reasonable approximation,
      // not a re-derivation of the server's own step-level aggregation.
      if (!isMobileNativePlatform()) return [];
      try {
        const [cached, users, projects] = await Promise.all([
          entityGetAllAssets() as Promise<ProjectAsset[]>,
          userService.getUsers(),
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
      } catch {
        return [];
      }
    }
  },

  async activeSummary(): Promise<ProjectAssetSummaryItem[]> {
    try {
      const res = await api.get<ProjectAssetSummaryItem[]>("/project-assets/active-summary");
      return res.data;
    } catch {
      // Offline fallback: derive per-project status counts from cached assets,
      // same source listOpen() already falls back to below. Previously this
      // went blank offline instead of reading it.
      if (!isMobileNativePlatform()) return [];
      try {
        const cached = (await entityGetAllAssets()) as ProjectAsset[];
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
          else bucket.inProgress += 1; // InProgress | Paused | Pending | Issue
        }
        return [...byProject.values()];
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

  async listOpen(): Promise<OpenAssetItem[]> {
    try {
      const res = await api.get<OpenAssetItem[]>("/project-assets/open");
      return res.data;
    } catch {
      // Offline fallback: derive from cached assets
      if (isMobileNativePlatform()) {
        const cached = await entityGetAllAssets();
        return cached.map((asset) => {
          const a = asset as ProjectAsset;
          return {
            id: a.id,
            projectId: a.projectId,
            jobNumber: (a as unknown as { jobNumber?: string }).jobNumber ?? "",
            office: (a as unknown as { office?: string }).office ?? "",
            officeId: (a as unknown as { officeId?: string }).officeId,
            assetTag: a.assetTag,
            assetName: a.assetName,
            assetModel: a.assetModel,
            manufacturer: (a as unknown as { manufacturer?: string }).manufacturer,
            hasWorkflow: !!(a as unknown as { workflowSummary?: unknown }).workflowSummary,
            status: a.status,
            runStatus: (a as unknown as { workflowSummary?: { latestRunStatus?: string } }).workflowSummary?.latestRunStatus,
            completedSteps: (a as unknown as { workflowSummary?: { completedSteps?: number } }).workflowSummary?.completedSteps ?? 0,
            totalSteps: (a as unknown as { workflowSummary?: { requiredItems?: number } }).workflowSummary?.requiredItems ?? 0,
            missingItems: (a as unknown as { workflowSummary?: { missingItems?: number } }).workflowSummary?.missingItems ?? 0,
            evidenceStatus: (a as unknown as { workflowSummary?: { evidenceStatus?: string } }).workflowSummary?.evidenceStatus,
            assignedUserId: (a as unknown as { assignedUserId?: string }).assignedUserId,
            location: a.location,
          } satisfies OpenAssetItem;
        }).filter((a) => a.status !== "Complete" && a.status !== "Closed");
      }
      return [];
    }
  },

  async dashboardWorkspace(userId?: string): Promise<DashboardWorkspace> {
    try {
      const res = await api.get<DashboardWorkspace>("/project-assets/dashboard-workspace", {
        params: userId ? { userId } : undefined,
      });
      return res.data;
    } catch {
      // Offline fallback: derive from cached assets
      if (isMobileNativePlatform()) {
        const cached = await entityGetAllAssets();
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
          completedSteps: (asset as unknown as { workflowSummary?: { completedSteps?: number } }).workflowSummary?.completedSteps ?? 0,
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
          hasOpenIssues: (asset as unknown as { hasOpenIssues?: boolean }).hasOpenIssues ?? false,
          signatureStatus: (asset as unknown as { signatureStatus?: string }).signatureStatus,
        });

        const allItems = cached
          .map((a) => toWorkspaceItem(a as ProjectAsset))
          .filter((item) => !item.isDeleted && item.status !== "Cancelled" && item.status !== "Closed");

        // Filter by userId if provided (for personal workspace)
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

        const currentInstalls = userFiltered.filter(
          (item) => isCurrent(item) && isInstallationWorkflow(item.workflowMode)
        );
        const currentInspections = userFiltered.filter(
          (item) => isCurrent(item) && isInspectionWorkflow(item.workflowMode)
        );
        const installHistory = userFiltered.filter(
          (item) => isHistory(item) && isInstallationWorkflow(item.workflowMode)
        );
        const inspectionHistory = userFiltered.filter(
          (item) => isHistory(item) && isInspectionWorkflow(item.workflowMode)
        );

        return { currentInstalls, currentInspections, installHistory, inspectionHistory };
      }
      return {
        currentInstalls: [],
        currentInspections: [],
        installHistory: [],
        inspectionHistory: [],
      };
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
