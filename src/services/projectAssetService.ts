import axios from "axios";
import api from "./api";
import type { ProjectAsset, CreateProjectAssetInput, ProjectAssetStatus, AssetIssue } from "../types/projectAsset";
import { entityDeleteAsset, entityGetAsset, entityPutAsset, entityReplaceIssuesForAsset, pendingAdd, pendingGetAll } from "./localDB";
import { AssetRepository } from "../repositories/AssetRepository";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, invalidateWebCache } from "./webFreshCache";
import type { OpenIssueRecord } from "./assetWorkflowRunService";

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

// ── Pure derivation helpers ────────────────────────────────────────────────────

/** Derive {id, assetId, projectId, data} records for the issues store from an
 *  asset's issuesJson. Only unresolved issues are included — matching the server's
 *  GetOpenIssues logic. jobNumber/customerName are left blank for asset-level
 *  issues (they require a project lookup); the background refresh in
 *  IssueRepository corrects these fields on the next server sync. */
function deriveOpenIssuesFromAsset(asset: ProjectAsset): Array<{
  id: string; assetId: string; projectId: string; data: unknown;
}> {
  let issues: AssetIssue[] = [];
  try { issues = JSON.parse(asset.issuesJson ?? "[]"); } catch { /* empty */ }
  return issues
    .filter((i) => !i.resolved)
    .map((i) => ({
      id: i.id,
      assetId: asset.id,
      projectId: asset.projectId,
      data: {
        issueId: i.id,
        description: i.description,
        issueType: i.issueType,
        severity: i.severity,
        isBlocking: i.isBlocking,
        reportedAt: i.reportedAt,
        createdBy: null,
        stepTitle: i.stepTitle ?? null,
        runId: "",
        assetId: asset.id,
        assetTag: asset.assetTag ?? "",
        assetName: asset.assetName ?? "",
        assetLocation: asset.location ?? "",
        projectId: asset.projectId,
        jobNumber: "",
        customerName: "",
        source: "asset" as const,
      } satisfies OpenIssueRecord,
    }));
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
      invalidateWebCache(`/project-assets/${id}`);
      return fromDto(res.data);
    }

    const result = await AssetRepository.update(id, patch as Partial<ProjectAsset> & Record<string, unknown>);
    if (result === null) throw new Error("Offline — change queued");
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
      return [];
    }
  },

  async activeSummary(): Promise<ProjectAssetSummaryItem[]> {
    try {
      const res = await api.get<ProjectAssetSummaryItem[]>("/project-assets/active-summary");
      return res.data;
    } catch {
      return [];
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
